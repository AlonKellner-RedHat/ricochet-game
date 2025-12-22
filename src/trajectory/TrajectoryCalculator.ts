import { RayUtils, raySegmentIntersect } from "@/math/Ray";
import { Vec2 } from "@/math/Vec2";
import type { Surface } from "@/surfaces";
import type {
  GhostPoint,
  TrajectoryPoint,
  TrajectoryResult,
  TrajectoryStatus,
  Vector2,
} from "@/types";
import { calculatePlannedTrajectoryWithValidation } from "./ImageReflectionCalculator";

/**
 * TrajectoryCalculator - Computes arrow paths through surfaces
 *
 * Features:
 * - Uses image reflection for planned surfaces (trajectory ends at cursor)
 * - Validates that planned surfaces are actually hit on the segment
 * - Extends trajectory past cursor as "ghost path" bouncing off all ricochet surfaces
 * - Tracks exhaustion distance (10 screen lengths)
 */

const EXHAUSTION_DISTANCE = 10000; // 10 screen lengths (~1000px each)

export class TrajectoryCalculator {
  /**
   * Calculate the trajectory from origin toward aimPoint
   */
  calculate(
    origin: Vector2,
    aimPoint: Vector2,
    plannedSurfaces: readonly Surface[],
    allSurfaces: readonly Surface[],
    maxDistance: number
  ): TrajectoryResult {
    if (plannedSurfaces.length > 0) {
      return this.calculateWithPlan(origin, aimPoint, plannedSurfaces, allSurfaces, maxDistance);
    }
    return this.calculateWithoutPlan(origin, aimPoint, allSurfaces, maxDistance);
  }

  /**
   * Calculate trajectory using image reflection for planned surfaces
   */
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Trajectory calculation requires validation of geometry
  private calculateWithPlan(
    origin: Vector2,
    aimPoint: Vector2,
    plannedSurfaces: readonly Surface[],
    allSurfaces: readonly Surface[],
    maxDistance: number
  ): TrajectoryResult {
    const points: TrajectoryPoint[] = [];
    let status: TrajectoryStatus = "valid";
    let failedAtPlanIndex = -1;
    let totalDistance = 0;

    // Get planned path using image reflection with validation
    const trajectoryResult = calculatePlannedTrajectoryWithValidation(
      origin,
      aimPoint,
      plannedSurfaces
    );
    const plannedPath = trajectoryResult.path;

    // Check if any hit missed the segment
    if (!trajectoryResult.isFullyAligned && status === "valid") {
      status = "missed_segment";
      failedAtPlanIndex = trajectoryResult.firstMissIndex;
    }

    // Validate each segment and check for obstacles
    points.push({ position: origin, surfaceId: null, isPlanned: false });

    // Direction of first segment (for final direction)
    let lastDirection = Vec2.direction(origin, aimPoint);

    for (let i = 0; i < plannedPath.length - 1; i++) {
      const segStart = plannedPath[i];
      const segEnd = plannedPath[i + 1];

      if (!segStart || !segEnd) continue;

      const segmentDistance = Vec2.distance(segStart, segEnd);
      lastDirection = Vec2.direction(segStart, segEnd);

      // Check if this segment hits an obstacle (non-planned surface)
      const expectedSurface = i < plannedSurfaces.length ? plannedSurfaces[i] : null;
      const obstacle = this.findObstacleOnSegment(
        segStart,
        segEnd,
        allSurfaces,
        plannedSurfaces,
        expectedSurface ?? null
      );

      if (obstacle) {
        points.push({
          position: obstacle.point,
          surfaceId: obstacle.surface.id,
          isPlanned: false,
        });
        status = "hit_obstacle";
        failedAtPlanIndex = i;
        totalDistance += Vec2.distance(segStart, obstacle.point);
        break;
      }

      // Check max distance
      if (totalDistance + segmentDistance > maxDistance) {
        const remainingDist = maxDistance - totalDistance;
        const direction = Vec2.direction(segStart, segEnd);
        const endpoint = Vec2.add(segStart, Vec2.scale(direction, remainingDist));
        points.push({ position: endpoint, surfaceId: null, isPlanned: false });
        totalDistance = maxDistance;
        status = "out_of_range";
        failedAtPlanIndex = i;
        break;
      }

      totalDistance += segmentDistance;

      // Add the hit point on the planned surface
      if (i < plannedSurfaces.length) {
        const plannedSurface = plannedSurfaces[i];
        if (plannedSurface) {
          points.push({
            position: segEnd,
            surfaceId: plannedSurface.id,
            isPlanned: true,
          });
        }
      } else {
        // Final point (cursor)
        points.push({ position: segEnd, surfaceId: null, isPlanned: false });
      }
    }

    // Calculate ghost path (extends past cursor)
    const lastPoint = points[points.length - 1];
    const ghostPoints = this.calculateGhostPath(
      lastPoint?.position ?? aimPoint,
      lastDirection,
      allSurfaces,
      totalDistance,
      maxDistance
    );

    return {
      points,
      ghostPoints,
      status,
      failedAtPlanIndex,
      totalDistance,
      exhaustionDistance: EXHAUSTION_DISTANCE,
    };
  }

  /**
   * Calculate trajectory without any planned surfaces
   */
  private calculateWithoutPlan(
    origin: Vector2,
    aimPoint: Vector2,
    allSurfaces: readonly Surface[],
    maxDistance: number
  ): TrajectoryResult {
    const points: TrajectoryPoint[] = [{ position: origin, surfaceId: null, isPlanned: false }];
    let totalDistance = 0;
    const direction = Vec2.direction(origin, aimPoint);

    // Trace to first hit or max distance
    const ray = RayUtils.fromPoints(origin, aimPoint);
    const hit = this.findClosestHit(ray, allSurfaces, maxDistance);

    if (hit?.intersection.point) {
      points.push({
        position: hit.intersection.point,
        surfaceId: hit.surface.id,
        isPlanned: false,
      });
      totalDistance = hit.intersection.t;

      // Only calculate ghost path if we hit a ricochet surface
      // Wall surfaces stop the arrow immediately
      let ghostPoints: GhostPoint[] = [];
      if (hit.surface.isPlannable()) {
        ghostPoints = this.calculateGhostPath(
          hit.intersection.point,
          this.getReflectedDirection(direction, hit.surface),
          allSurfaces,
          totalDistance,
          maxDistance
        );
      }

      return {
        points,
        ghostPoints,
        status: "valid",
        failedAtPlanIndex: -1,
        totalDistance,
        exhaustionDistance: EXHAUSTION_DISTANCE,
      };
    }

    // No hit - extend to max distance
    const endpoint = RayUtils.pointAt(ray, maxDistance);
    points.push({ position: endpoint, surfaceId: null, isPlanned: false });

    return {
      points,
      ghostPoints: [],
      status: "valid",
      failedAtPlanIndex: -1,
      totalDistance: maxDistance,
      exhaustionDistance: EXHAUSTION_DISTANCE,
    };
  }

  /**
   * Calculate extended ghost path by bouncing off ricochet surfaces
   */
  private calculateGhostPath(
    startPosition: Vector2,
    startDirection: Vector2,
    allSurfaces: readonly Surface[],
    distanceSoFar: number,
    maxTraceDistance: number
  ): GhostPoint[] {
    const ghostPoints: GhostPoint[] = [];
    let currentPos = startPosition;
    let currentDir = startDirection;
    let distance = distanceSoFar;

    const maxGhostDistance = Math.max(maxTraceDistance * 2, EXHAUSTION_DISTANCE * 1.5);
    const maxBounces = 50; // Safety limit

    for (let bounce = 0; bounce < maxBounces && distance < maxGhostDistance; bounce++) {
      const isExhausted = distance >= EXHAUSTION_DISTANCE;
      const remainingDistance = maxGhostDistance - distance;

      // Cast ray to find next surface
      const ray = RayUtils.create(currentPos, currentDir);
      const hit = this.findClosestHit(ray, allSurfaces, remainingDistance);

      if (!hit?.intersection.point) {
        // No more hits - extend to max distance and stop
        const endpoint = Vec2.add(currentPos, Vec2.scale(currentDir, remainingDistance));
        ghostPoints.push({
          position: endpoint,
          surfaceId: null,
          willStick: false,
        });
        break;
      }

      const hitPoint = hit.intersection.point;
      const hitDistance = hit.intersection.t;
      distance += hitDistance;

      // Check if this surface stops the arrow
      const willStick = isExhausted || !hit.surface.isPlannable();

      ghostPoints.push({
        position: hitPoint,
        surfaceId: hit.surface.id,
        willStick,
      });

      if (willStick) {
        // Arrow sticks - stop tracing
        break;
      }

      // Reflect and continue
      currentPos = hitPoint;
      currentDir = this.getReflectedDirection(currentDir, hit.surface);
    }

    return ghostPoints;
  }

  /**
   * Get reflected direction off a surface
   */
  private getReflectedDirection(direction: Vector2, surface: Surface): Vector2 {
    const segVec = Vec2.subtract(surface.segment.end, surface.segment.start);
    const normal = Vec2.normalize(Vec2.perpendicular(segVec));
    return Vec2.reflect(direction, normal);
  }

  /**
   * Find an obstacle along a segment (excluding planned surfaces)
   */
  private findObstacleOnSegment(
    segStart: Vector2,
    segEnd: Vector2,
    allSurfaces: readonly Surface[],
    plannedSurfaces: readonly Surface[],
    expectedSurface: Surface | null
  ): { surface: Surface; point: Vector2 } | null {
    const ray = RayUtils.fromPoints(segStart, segEnd);
    const segmentLength = Vec2.distance(segStart, segEnd);

    let closestObstacle: { surface: Surface; point: Vector2; t: number } | null = null;

    for (const surface of allSurfaces) {
      // Skip the expected planned surface
      if (expectedSurface && surface.id === expectedSurface.id) continue;
      // Skip other planned surfaces
      if (plannedSurfaces.some((p) => p.id === surface.id)) continue;

      const hit = raySegmentIntersect(ray, surface.segment);

      if (hit.hit && hit.point && hit.t > 0.001 && hit.t < segmentLength - 0.001) {
        if (!closestObstacle || hit.t < closestObstacle.t) {
          closestObstacle = { surface, point: hit.point, t: hit.t };
        }
      }
    }

    return closestObstacle;
  }

  /**
   * Find the closest surface intersection along a ray
   */
  private findClosestHit(
    ray: ReturnType<typeof RayUtils.create>,
    surfaces: readonly Surface[],
    maxDistance: number
  ): { surface: Surface; intersection: ReturnType<typeof raySegmentIntersect> } | null {
    let closest: {
      surface: Surface;
      intersection: ReturnType<typeof raySegmentIntersect>;
    } | null = null;

    for (const surface of surfaces) {
      const hit = raySegmentIntersect(ray, surface.segment);

      if (hit.hit && hit.t > 0.001 && hit.t <= maxDistance) {
        if (!closest || hit.t < closest.intersection.t) {
          closest = { surface, intersection: hit };
        }
      }
    }

    return closest;
  }
}
