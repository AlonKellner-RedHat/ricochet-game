import { RayUtils, raySegmentIntersect } from "@/math/Ray";
import { Vec2 } from "@/math/Vec2";
import type { Surface } from "@/surfaces";
import type { TrajectoryPoint, TrajectoryResult, TrajectoryStatus, Vector2 } from "@/types";
import { calculatePlannedTrajectory } from "./ImageReflectionCalculator";

/**
 * TrajectoryCalculator - Computes arrow paths through surfaces
 *
 * Uses image reflection geometry for planned surfaces to ensure
 * the trajectory ends exactly at the cursor position.
 */
export class TrajectoryCalculator {
  /**
   * Calculate the trajectory from origin toward aimPoint, bouncing off surfaces
   *
   * @param origin - Starting position (player's bow)
   * @param aimPoint - Where the player is aiming (mouse position)
   * @param plannedSurfaces - Ordered list of surfaces the player wants to hit
   * @param allSurfaces - All surfaces in the level (for collision detection)
   * @param maxDistance - Maximum distance the arrow can travel
   * @returns TrajectoryResult with path points and validation status
   */
  calculate(
    origin: Vector2,
    aimPoint: Vector2,
    plannedSurfaces: readonly Surface[],
    allSurfaces: readonly Surface[],
    maxDistance: number
  ): TrajectoryResult {
    // Use image reflection for planned trajectory
    if (plannedSurfaces.length > 0) {
      return this.calculateWithPlan(origin, aimPoint, plannedSurfaces, allSurfaces, maxDistance);
    }

    // No plan - use simple ray tracing
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
    // Get ideal path through planned surfaces using image reflection
    const idealPath = calculatePlannedTrajectory(origin, aimPoint, plannedSurfaces);

    const points: TrajectoryPoint[] = [];
    let status: TrajectoryStatus = "valid";
    let failedAtPlanIndex = -1;
    let totalDistance = 0;

    // Validate that we got enough points (should be plannedSurfaces.length + 2)
    // If not, some surfaces couldn't be hit
    const expectedPoints = plannedSurfaces.length + 2; // origin + hits + cursor
    if (idealPath.length < expectedPoints) {
      // Some planned surfaces couldn't be reached
      return {
        points: [{ position: origin, surfaceId: null, isPlanned: false }],
        status: "missed_surface",
        failedAtPlanIndex: idealPath.length - 2, // Which surface was missed
        totalDistance: 0,
      };
    }

    // Check each segment for obstacles
    for (let i = 0; i < idealPath.length - 1; i++) {
      const segStart = idealPath[i];
      const segEnd = idealPath[i + 1];

      if (!segStart || !segEnd) continue;

      const segmentDistance = Vec2.distance(segStart, segEnd);

      // Add start point
      if (i === 0) {
        points.push({ position: segStart, surfaceId: null, isPlanned: false });
      }

      // Check for obstacles along this segment (excluding planned surfaces)
      const expectedSurface = i < plannedSurfaces.length ? plannedSurfaces[i] : null;
      const obstacle = this.findObstacleOnSegment(
        segStart,
        segEnd,
        allSurfaces,
        plannedSurfaces,
        expectedSurface ?? null
      );

      if (obstacle) {
        // Hit an obstacle before reaching target
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

      // Check if we've exceeded max distance
      if (totalDistance + segmentDistance > maxDistance) {
        // Truncate at max distance
        const remainingDist = maxDistance - totalDistance;
        const direction = Vec2.direction(segStart, segEnd);
        const endpoint = Vec2.add(segStart, Vec2.scale(direction, remainingDist));
        points.push({ position: endpoint, surfaceId: null, isPlanned: false });
        totalDistance = maxDistance;
        status = "missed_surface";
        failedAtPlanIndex = i;
        break;
      }

      totalDistance += segmentDistance;

      // Add end point (either hit point on planned surface or final cursor)
      if (i < plannedSurfaces.length) {
        // This is a hit on a planned surface
        const plannedSurface = plannedSurfaces[i];
        points.push({
          position: segEnd,
          surfaceId: plannedSurface?.id ?? null,
          isPlanned: true,
        });
      } else {
        // Final point (cursor)
        points.push({ position: segEnd, surfaceId: null, isPlanned: false });
      }
    }

    return {
      points,
      status,
      failedAtPlanIndex,
      totalDistance,
    };
  }

  /**
   * Calculate trajectory without any planned surfaces (simple ray tracing)
   */
  private calculateWithoutPlan(
    origin: Vector2,
    aimPoint: Vector2,
    allSurfaces: readonly Surface[],
    maxDistance: number
  ): TrajectoryResult {
    const points: TrajectoryPoint[] = [{ position: origin, surfaceId: null, isPlanned: false }];

    const ray = RayUtils.fromPoints(origin, aimPoint);
    const hit = this.findClosestHit(ray, allSurfaces, maxDistance);

    if (!hit || !hit.intersection.point) {
      // No intersection - draw line to max distance
      const endpoint = RayUtils.pointAt(ray, maxDistance);
      points.push({ position: endpoint, surfaceId: null, isPlanned: false });

      return {
        points,
        status: "valid",
        failedAtPlanIndex: -1,
        totalDistance: maxDistance,
      };
    }

    // Add hit point
    points.push({
      position: hit.intersection.point,
      surfaceId: hit.surface.id,
      isPlanned: false,
    });

    return {
      points,
      status: "valid",
      failedAtPlanIndex: -1,
      totalDistance: hit.intersection.t,
    };
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
      // Skip the expected planned surface for this segment
      if (expectedSurface && surface.id === expectedSurface.id) {
        continue;
      }

      // Skip other planned surfaces (we'll handle them in order)
      if (plannedSurfaces.some((p) => p.id === surface.id)) {
        continue;
      }

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
