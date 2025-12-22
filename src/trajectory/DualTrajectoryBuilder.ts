import { RayUtils, raySegmentIntersect } from "@/math/Ray";
import { Vec2 } from "@/math/Vec2";
import type { Surface } from "@/surfaces";
import type {
  AlignmentResult,
  BypassedSurfaceInfo,
  DualTrajectoryResult,
  GhostPoint,
  TrajectoryPath,
  Vector2,
} from "@/types";
import { PathBuilder, type PathResult } from "./PathBuilder";

/** Distance limit for ghost path extension */
const EXHAUSTION_DISTANCE = 10000;
const MAX_GHOST_BOUNCES = 50;

/**
 * DualTrajectoryBuilder - Builds both planned and actual trajectories
 *
 * First Principles:
 * - Planned path = path through planned surfaces (with bypass for invalid ones)
 * - Actual path = path with NO planned surfaces (pure physics)
 * - Both paths share a common prefix starting from player
 * - Surfaces are bypassed (temporarily skipped) when they can't be used
 */
export class DualTrajectoryBuilder {
  private readonly pathBuilder: PathBuilder;

  constructor() {
    this.pathBuilder = new PathBuilder({ exhaustionLimit: EXHAUSTION_DISTANCE });
  }

  /**
   * Build dual trajectory result
   *
   * @param player - Player position
   * @param cursor - Cursor/target position
   * @param plannedSurfaces - Surfaces in the plan (in order)
   * @param allSurfaces - All surfaces in the level
   */
  build(
    player: Vector2,
    cursor: Vector2,
    plannedSurfaces: readonly Surface[],
    allSurfaces: readonly Surface[]
  ): DualTrajectoryResult {
    // Build planned path (through planned surfaces, skipping invalid ones)
    const plannedResult = this.pathBuilder.build(player, cursor, plannedSurfaces, allSurfaces);

    // Build actual path FOLLOWING planned direction
    // First Principle: The first direction of planned and actual paths must always align
    const actualResult = this.buildActualPath(
      player,
      cursor,
      plannedResult,
      plannedSurfaces,
      allSurfaces
    );

    // Convert to TrajectoryPath format
    const planned = this.convertToTrajectoryPath(plannedResult, allSurfaces);
    const actual = this.convertToTrajectoryPath(actualResult, allSurfaces);

    // Derive alignment from comparing paths
    const alignment = this.deriveAlignment(plannedResult, actualResult);

    // Convert bypassed surfaces
    const bypassedSurfaces = this.convertBypassedSurfaces(plannedResult);

    // Cursor is reachable only if:
    // 1. Planned path reached cursor AND
    // 2. Paths are fully aligned (actual path matches planned)
    // If paths diverge (off-segment hit, obstruction), cursor is NOT reachable via plan
    const isCursorReachable = plannedResult.reachedCursor && alignment.isFullyAligned;

    return {
      planned,
      actual,
      alignment,
      isCursorReachable,
      bypassedSurfaces,
    };
  }

  /**
   * Build actual path that follows the planned direction but uses real physics
   *
   * First Principles:
   * - Actual path starts in the SAME direction as planned path
   * - At each planned reflection point, check if we actually hit the segment
   * - If on-segment: reflect and continue toward next planned point
   * - If off-segment: ignore that surface and use forward physics
   * - Stop at obstructions (walls or blocking side of ricochet)
   */
  private buildActualPath(
    player: Vector2,
    cursor: Vector2,
    plannedResult: PathResult,
    plannedSurfaces: readonly Surface[],
    allSurfaces: readonly Surface[]
  ): PathResult {
    // If no planned surfaces or planned path has only start point, use pure physics
    if (plannedSurfaces.length === 0 || plannedResult.points.length <= 1) {
      return this.pathBuilder.build(player, cursor, [], allSurfaces);
    }

    const points: Vector2[] = [player];
    let currentPoint = player;
    let totalDistance = 0;
    let stoppedByObstruction = false;
    let stoppingSurface: Surface | undefined;
    let reachedCursorInLoop = false;

    // Get the initial direction from planned path (toward first planned hit)
    const firstPlannedTarget = plannedResult.points[1];
    if (!firstPlannedTarget) {
      return this.pathBuilder.build(player, cursor, [], allSurfaces);
    }

    let currentDirection = Vec2.direction(player, firstPlannedTarget);

    // Follow planned path points, but use actual physics
    // Note: plannedResult.points includes [player, ...surfaceHits, cursor]
    // We iterate through surface hits (indices 1 to length-2), then handle cursor separately
    const lastIndex = plannedResult.points.length - 1;

    for (let i = 1; i < plannedResult.points.length; i++) {
      const targetPoint = plannedResult.points[i];
      if (!targetPoint) continue;

      const isLastPoint = i === lastIndex;
      const distanceToTarget = Vec2.distance(currentPoint, targetPoint);

      // Check if we hit anything on the way to target
      const ray = RayUtils.create(currentPoint, currentDirection);
      const hit = this.findClosestHit(ray, allSurfaces, distanceToTarget + 100);

      if (hit && hit.distance < distanceToTarget - 0.001) {
        // We hit something before reaching the planned target
        points.push(hit.point);
        totalDistance += hit.distance;

        // Check if it blocks or reflects
        if (!hit.surface.isPlannable()) {
          // Wall - stop
          stoppedByObstruction = true;
          stoppingSurface = hit.surface;
          break;
        }

        if (!hit.surface.canReflectFrom(currentDirection)) {
          // Blocking side of ricochet - stop
          stoppedByObstruction = true;
          stoppingSurface = hit.surface;
          break;
        }

        // Ricochet surface - reflect and continue
        currentPoint = hit.point;
        currentDirection = this.reflectDirection(currentDirection, hit.surface);

        // After an unplanned bounce, continue with forward physics
        const forwardResult = this.extendWithForwardPhysics(
          currentPoint,
          currentDirection,
          allSurfaces,
          totalDistance
        );

        for (const p of forwardResult.path) {
          points.push(p);
        }
        totalDistance += forwardResult.distance;
        stoppedByObstruction = forwardResult.stopped;
        stoppingSurface = forwardResult.stoppingSurface;
        break;
      }

      // If this is the last point (cursor), we reached it!
      if (isLastPoint) {
        // We reached the cursor without hitting any obstacle
        points.push(targetPoint);
        totalDistance += distanceToTarget;
        reachedCursorInLoop = true;
        break;
      }

      // Check if we actually hit the planned surface at the planned point
      const plannedSurface = this.findSurfaceAtPoint(targetPoint, plannedSurfaces);

      if (plannedSurface) {
        // ON-SEGMENT HIT: We hit the surface at the planned point
        // Check if direction allows reflection
        if (!plannedSurface.canReflectFrom(currentDirection)) {
          // Can't reflect from this side - it blocks us
          points.push(targetPoint);
          totalDistance += Vec2.distance(currentPoint, targetPoint);
          stoppedByObstruction = true;
          stoppingSurface = plannedSurface;
          break;
        }

        // Can reflect - add point and calculate PHYSICAL reflected direction
        points.push(targetPoint);
        totalDistance += Vec2.distance(currentPoint, targetPoint);
        currentPoint = targetPoint;

        // First Principle: Actual path uses REAL PHYSICS (reflected direction)
        currentDirection = this.reflectDirection(currentDirection, plannedSurface);

        // For ON-SEGMENT hits, continue to the next planned point
        // The actual path continues following the plan as long as hits are on-segment
      } else {
        // OFF-SEGMENT HIT: The planned hit is not on the actual surface
        // In actual path, we diverge here - continue in current direction (forward physics)
        const forwardResult = this.extendWithForwardPhysics(
          currentPoint,
          currentDirection,
          allSurfaces,
          totalDistance
        );

        for (const p of forwardResult.path) {
          points.push(p);
        }
        totalDistance += forwardResult.distance;
        stoppedByObstruction = true; // Mark as stopped to prevent cursor addition
        stoppingSurface = forwardResult.stoppingSurface;
        break;
      }
    }

    // If we processed all planned points without stopping and didn't already reach cursor, try to reach it
    if (!stoppedByObstruction && !reachedCursorInLoop) {
      const lastPoint = points[points.length - 1] ?? player;
      const distToCursor = Vec2.distance(lastPoint, cursor);

      const ray = RayUtils.create(lastPoint, currentDirection);
      const hit = this.findClosestHit(ray, allSurfaces, distToCursor);

      if (!hit) {
        // Can reach cursor
        points.push(cursor);
        totalDistance += distToCursor;
      } else {
        // Something in the way
        points.push(hit.point);
        totalDistance += hit.distance;

        if (!hit.surface.isPlannable() || !hit.surface.canReflectFrom(currentDirection)) {
          stoppedByObstruction = true;
          stoppingSurface = hit.surface;
        } else {
          // Continue with forward physics after bounce
          const forwardResult = this.extendWithForwardPhysics(
            hit.point,
            this.reflectDirection(currentDirection, hit.surface),
            allSurfaces,
            totalDistance
          );
          for (const p of forwardResult.path) {
            points.push(p);
          }
          totalDistance += forwardResult.distance;
          stoppedByObstruction = forwardResult.stopped;
          stoppingSurface = forwardResult.stoppingSurface;
        }
      }
    }

    return {
      points,
      bypassedSurfaces: [], // Actual path doesn't track bypasses
      usedSurfaces: [],
      totalDistance,
      reachedCursor: points[points.length - 1]
        ? Vec2.distance(points[points.length - 1], cursor) < 1
        : false,
      stoppedByObstruction,
      stoppingSurface,
    };
  }

  /**
   * Find which surface (if any) contains a given point
   */
  private findSurfaceAtPoint(
    point: Vector2,
    surfaces: readonly Surface[]
  ): Surface | undefined {
    for (const surface of surfaces) {
      const { start, end } = surface.segment;

      // Check if point is on the segment (within tolerance)
      const segVec = Vec2.subtract(end, start);
      const toPoint = Vec2.subtract(point, start);

      // Project point onto segment
      const segLengthSq = Vec2.dot(segVec, segVec);
      if (segLengthSq < 0.001) continue;

      const t = Vec2.dot(toPoint, segVec) / segLengthSq;

      // Point is on segment if t is between 0 and 1
      if (t >= -0.01 && t <= 1.01) {
        const closestPoint = Vec2.add(start, Vec2.scale(segVec, Math.max(0, Math.min(1, t))));
        const distance = Vec2.distance(point, closestPoint);

        if (distance < 1) {
          return surface;
        }
      }
    }

    return undefined;
  }

  /**
   * Extend path with forward physics simulation
   */
  private extendWithForwardPhysics(
    start: Vector2,
    direction: Vector2,
    allSurfaces: readonly Surface[],
    currentDistance: number
  ): { path: Vector2[]; distance: number; stopped: boolean; stoppingSurface?: Surface } {
    const path: Vector2[] = [];
    let pos = start;
    let dir = direction;
    let totalDist = 0;

    for (let bounce = 0; bounce < MAX_GHOST_BOUNCES; bounce++) {
      if (currentDistance + totalDist >= EXHAUSTION_DISTANCE) {
        break;
      }

      const remainingDist = EXHAUSTION_DISTANCE - currentDistance - totalDist;
      const ray = RayUtils.create(pos, dir);
      const hit = this.findClosestHit(ray, allSurfaces, remainingDist);

      if (!hit) {
        // No hit - extend to exhaustion
        const endpoint = Vec2.add(pos, Vec2.scale(dir, remainingDist));
        path.push(endpoint);
        totalDist += remainingDist;
        break;
      }

      path.push(hit.point);
      totalDist += hit.distance;

      if (!hit.surface.isPlannable() || !hit.surface.canReflectFrom(dir)) {
        return { path, distance: totalDist, stopped: true, stoppingSurface: hit.surface };
      }

      pos = hit.point;
      dir = this.reflectDirection(dir, hit.surface);
    }

    return { path, distance: totalDist, stopped: false };
  }

  /**
   * Convert PathResult to TrajectoryPath
   */
  private convertToTrajectoryPath(
    result: PathResult,
    allSurfaces: readonly Surface[]
  ): TrajectoryPath {
    const ghostPoints = result.stoppedByObstruction
      ? [] // No ghost path if stopped by obstruction
      : this.buildGhostPath(result.points, allSurfaces);

    return {
      points: result.points,
      ghostPoints,
    };
  }

  /**
   * Derive alignment by comparing planned and actual paths
   *
   * First Principles:
   * - Find the common prefix of both paths
   * - isFullyAligned = true only if both paths are identical AND cursor reached
   * - alignedSegmentCount = number of segments in common prefix
   */
  /**
   * Derive alignment by comparing planned and actual paths
   *
   * First Principle: The first direction/section must ALWAYS align
   * Alignment is based on direction matching, not just point matching
   */
  private deriveAlignment(planned: PathResult, actual: PathResult): AlignmentResult {
    // Both paths start at the same point (player)
    if (planned.points.length < 2 || actual.points.length < 2) {
      return {
        isFullyAligned: false,
        alignedSegmentCount: 0,
        firstMismatchIndex: 0,
      };
    }

    // Check if both paths start from the same point
    const plannedStart = planned.points[0];
    const actualStart = actual.points[0];
    if (!plannedStart || !actualStart || Vec2.distance(plannedStart, actualStart) > 0.001) {
      return {
        isFullyAligned: false,
        alignedSegmentCount: 0,
        firstMismatchIndex: 0,
      };
    }

    // Compare segments by direction
    let alignedSegmentCount = 0;
    let plannedIdx = 0;
    let actualIdx = 0;
    let divergencePoint: Vector2 | undefined;

    while (plannedIdx < planned.points.length - 1 && actualIdx < actual.points.length - 1) {
      const p1Start = planned.points[plannedIdx];
      const p1End = planned.points[plannedIdx + 1];
      const a1Start = actual.points[actualIdx];
      const a1End = actual.points[actualIdx + 1];

      if (!p1Start || !p1End || !a1Start || !a1End) break;

      // Check if segments start from same point
      if (Vec2.distance(p1Start, a1Start) > 0.001) {
        // Divergence at the start of this segment
        divergencePoint = p1Start;
        break;
      }

      // Get directions
      const plannedDir = Vec2.direction(p1Start, p1End);
      const actualDir = Vec2.direction(a1Start, a1End);

      // Check if directions align (dot product close to 1)
      const directionAlignment = Vec2.dot(plannedDir, actualDir);
      if (directionAlignment < 0.99) {
        // Directions don't align - divergence at segment start
        divergencePoint = p1Start;
        break;
      }

      // Directions align - check if endpoints match
      const plannedLen = Vec2.distance(p1Start, p1End);
      const actualLen = Vec2.distance(a1Start, a1End);

      if (Math.abs(plannedLen - actualLen) < 0.001 && Vec2.distance(p1End, a1End) < 0.001) {
        // Segments match exactly
        alignedSegmentCount++;
        plannedIdx++;
        actualIdx++;
      } else if (actualLen > plannedLen) {
        // Actual segment extends beyond planned endpoint
        // The planned segment is aligned (it's contained within actual)
        alignedSegmentCount++;
        plannedIdx++;
        // Divergence point is at the planned endpoint
        divergencePoint = p1End;
        break; // Paths diverge here
      } else {
        // Planned extends beyond actual
        alignedSegmentCount++;
        actualIdx++;
        // Divergence point is at the actual endpoint
        divergencePoint = a1End;
        break;
      }
    }

    // Fully aligned only if all segments match exactly
    const isFullyAligned =
      planned.points.length === actual.points.length &&
      alignedSegmentCount === planned.points.length - 1 &&
      planned.reachedCursor;

    // First mismatch index
    const firstMismatchIndex = isFullyAligned ? -1 : alignedSegmentCount;

    // Clear divergence point if fully aligned
    if (isFullyAligned) {
      divergencePoint = undefined;
    }

    return {
      isFullyAligned,
      alignedSegmentCount,
      firstMismatchIndex,
      divergencePoint,
    };
  }

  /**
   * Convert bypassed surfaces to BypassedSurfaceInfo format
   */
  private convertBypassedSurfaces(result: PathResult): BypassedSurfaceInfo[] {
    return result.bypassedSurfaces.map((b) => ({
      surfaceId: b.surface.id,
      reason: b.reason,
      index: b.index,
    }));
  }

  /**
   * Build ghost path from the end of a path
   */
  private buildGhostPath(points: Vector2[], allSurfaces: readonly Surface[]): GhostPoint[] {
    if (points.length < 2) return [];

    const lastPoint = points[points.length - 1];
    const prevPoint = points[points.length - 2];
    if (!lastPoint || !prevPoint) return [];

    const direction = Vec2.direction(prevPoint, lastPoint);
    return this.extendGhostPath(lastPoint, direction, allSurfaces);
  }

  /**
   * Extend ghost path from a point in a direction
   */
  private extendGhostPath(
    start: Vector2,
    direction: Vector2,
    allSurfaces: readonly Surface[]
  ): GhostPoint[] {
    const ghostPoints: GhostPoint[] = [];
    let currentPos = start;
    let currentDir = direction;
    let distance = 0;

    for (let bounce = 0; bounce < MAX_GHOST_BOUNCES && distance < EXHAUSTION_DISTANCE; bounce++) {
      const isExhausted = distance >= EXHAUSTION_DISTANCE;
      const remainingDistance = EXHAUSTION_DISTANCE - distance;
      const ray = RayUtils.create(currentPos, currentDir);
      const hit = this.findClosestHit(ray, allSurfaces, remainingDistance);

      if (!hit) {
        // No hit - extend and stop
        const endpoint = Vec2.add(currentPos, Vec2.scale(currentDir, remainingDistance));
        ghostPoints.push({ position: endpoint, surfaceId: null, willStick: false });
        break;
      }

      distance += hit.distance;

      // Will stick if exhausted, wall, or blocking side of ricochet
      const willStick =
        isExhausted || !hit.surface.isPlannable() || !hit.surface.canReflectFrom(currentDir);

      ghostPoints.push({
        position: hit.point,
        surfaceId: hit.surface.id,
        willStick,
      });

      if (willStick) break;

      currentPos = hit.point;
      currentDir = this.reflectDirection(currentDir, hit.surface);
    }

    return ghostPoints;
  }

  /**
   * Find closest surface hit along a ray
   */
  private findClosestHit(
    ray: ReturnType<typeof RayUtils.create>,
    surfaces: readonly Surface[],
    maxDistance: number
  ): { surface: Surface; point: Vector2; distance: number } | null {
    let closest: { surface: Surface; point: Vector2; distance: number } | null = null;

    for (const surface of surfaces) {
      const hit = raySegmentIntersect(ray, surface.segment);

      if (hit.hit && hit.point && hit.t > 0.001 && hit.t <= maxDistance) {
        if (!closest || hit.t < closest.distance) {
          closest = { surface, point: hit.point, distance: hit.t };
        }
      }
    }

    return closest;
  }

  /**
   * Reflect direction off a surface
   */
  private reflectDirection(direction: Vector2, surface: Surface): Vector2 {
    const segVec = Vec2.subtract(surface.segment.end, surface.segment.start);
    const normal = Vec2.normalize(Vec2.perpendicular(segVec));
    return Vec2.reflect(direction, normal);
  }
}
