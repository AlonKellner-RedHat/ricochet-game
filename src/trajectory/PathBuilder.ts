import { RayUtils, raySegmentIntersect } from "@/math/Ray";
import { Vec2 } from "@/math/Vec2";
import type { Surface } from "@/surfaces";
import type { Vector2 } from "@/types";
import { BypassChecker, BypassReason } from "./BypassChecker";

/**
 * Information about a surface that was bypassed during path building
 */
export interface BypassedSurface {
  readonly surface: Surface;
  readonly reason: BypassReason;
  readonly index: number; // Original index in planned surfaces
}

/**
 * Result of path building
 */
export interface PathResult {
  /** The path points from player toward cursor */
  readonly points: Vector2[];

  /** Surfaces that were bypassed (skipped) during path building */
  readonly bypassedSurfaces: BypassedSurface[];

  /** Surfaces that were successfully used for reflection */
  readonly usedSurfaces: Surface[];

  /** Total distance traveled */
  readonly totalDistance: number;

  /** Whether the path reached the cursor */
  readonly reachedCursor: boolean;

  /** Whether the path was stopped by an obstruction */
  readonly stoppedByObstruction: boolean;

  /** The surface that stopped the path (if any) */
  readonly stoppingSurface?: Surface;
}

/** Configuration for path building */
export interface PathBuilderConfig {
  readonly exhaustionLimit: number;
  readonly maxBounces: number;
}

const DEFAULT_CONFIG: PathBuilderConfig = {
  exhaustionLimit: 10000,
  maxBounces: 50,
};

/**
 * PathBuilder - Builds arrow paths while automatically bypassing invalid surfaces
 *
 * First Principles:
 * - Build path incrementally from player position
 * - For each planned surface, check if it can be used
 * - If not, bypass it and continue to next
 * - Track which surfaces were bypassed for visual feedback
 * - Stop when cursor is reached, obstruction is hit, or exhaustion
 */
export class PathBuilder {
  private readonly bypassChecker: BypassChecker;
  private readonly config: PathBuilderConfig;

  constructor(config: Partial<PathBuilderConfig> = {}) {
    this.bypassChecker = new BypassChecker();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Build a path from player to cursor through planned surfaces
   *
   * @param player - Starting position
   * @param cursor - Target position
   * @param plannedSurfaces - Surfaces to try to reflect off (in order)
   * @param allSurfaces - All surfaces for obstruction checking
   */
  build(
    player: Vector2,
    cursor: Vector2,
    plannedSurfaces: readonly Surface[],
    allSurfaces: readonly Surface[]
  ): PathResult {
    const points: Vector2[] = [player];
    const bypassedSurfaces: BypassedSurface[] = [];
    const usedSurfaces: Surface[] = [];
    let totalDistance = 0;
    let currentPoint = player;
    let stoppedByObstruction = false;
    let stoppingSurface: Surface | undefined;

    // Process each planned surface
    for (let i = 0; i < plannedSurfaces.length; i++) {
      const surface = plannedSurfaces[i];
      if (!surface) continue;

      const isLastSurface = i === plannedSurfaces.length - 1;
      const nextSurface = plannedSurfaces[i + 1] ?? null;

      // Calculate where we'd hit this surface (on infinite line)
      const reflection = this.calculateReflectionPoint(
        currentPoint,
        cursor,
        surface,
        i,
        plannedSurfaces
      );
      const reflectionPoint = reflection.point;

      // Check if we should bypass this surface
      // First Principle: Off-segment hits should NOT cause a bypass
      // Only bypass for player/cursor wrong side, obstruction, or exhaustion
      const bypassResult = this.bypassChecker.shouldBypassSurface({
        surface,
        player,
        cursor,
        currentPoint,
        currentDistance: totalDistance,
        exhaustionLimit: this.config.exhaustionLimit,
        allSurfaces,
        isLastSurface,
        nextSurface,
        reflectionPoint,
      });

      if (bypassResult.shouldBypass) {
        bypassedSurfaces.push({
          surface,
          reason: bypassResult.reason,
          index: i,
        });

        // If exhausted, stop building path entirely
        if (bypassResult.reason === BypassReason.Exhausted) {
          stoppedByObstruction = true;
          break;
        }

        continue; // Skip to next surface
      }

      // Check for obstructions between current point and reflection point
      const obstruction = this.findObstruction(
        currentPoint,
        reflectionPoint,
        surface,
        allSurfaces
      );

      if (obstruction) {
        // Hit an obstruction before reaching the planned surface
        points.push(obstruction.point);
        totalDistance += Vec2.distance(currentPoint, obstruction.point);
        stoppedByObstruction = true;
        stoppingSurface = obstruction.surface;
        break;
      }

      // Successfully reach the surface (even if off-segment for planned path)
      // First Principle: Off-segment reflection points are INCLUDED in planned path
      points.push(reflectionPoint);
      totalDistance += Vec2.distance(currentPoint, reflectionPoint);
      usedSurfaces.push(surface);
      currentPoint = reflectionPoint;
    }

    // After processing planned surfaces, try to reach cursor (with physics simulation)
    let reachedCursor = false;
    if (!stoppedByObstruction) {
      const result = this.tryReachCursor(currentPoint, cursor, allSurfaces, totalDistance);

      // Add any intermediate bounce points
      for (const p of result.path) {
        points.push(p);
        totalDistance += Vec2.distance(currentPoint, p);
        currentPoint = p;
      }

      if (result.reached) {
        points.push(cursor);
        totalDistance += Vec2.distance(currentPoint, cursor);
        reachedCursor = true;
      } else if (result.obstruction) {
        // The obstruction point is already in result.path
        stoppedByObstruction = true;
        stoppingSurface = result.obstruction.surface;
      }
    }

    return {
      points,
      bypassedSurfaces,
      usedSurfaces,
      totalDistance,
      reachedCursor,
      stoppedByObstruction,
      stoppingSurface,
    };
  }

  /**
   * Calculate where the arrow would hit a surface using image reflection
   * This creates the correct reflection geometry
   *
   * First Principle: Off-segment reflection points should be INCLUDED in the planned path
   * (not bypassed), but the actual path will ignore them.
   *
   * @returns Object containing the reflection point and whether it's on the segment
   */
  private calculateReflectionPoint(
    currentPoint: Vector2,
    cursor: Vector2,
    surface: Surface,
    surfaceIndex: number,
    allPlannedSurfaces: readonly Surface[]
  ): { point: Vector2; isOnSegment: boolean } {
    // Build cursor image by reflecting through remaining surfaces (backwards)
    let cursorImage = cursor;
    for (let i = allPlannedSurfaces.length - 1; i >= surfaceIndex; i--) {
      const s = allPlannedSurfaces[i];
      if (s) {
        cursorImage = Vec2.reflectPointThroughLine(cursorImage, s.segment.start, s.segment.end);
      }
    }

    // Find intersection of line from currentPoint to cursorImage with surface LINE (infinite)
    const direction = Vec2.subtract(cursorImage, currentPoint);
    const dirLength = Vec2.length(direction);

    if (dirLength < 0.001) {
      // Degenerate case - use surface midpoint
      const midpoint = Vec2.scale(Vec2.add(surface.segment.start, surface.segment.end), 0.5);
      return { point: midpoint, isOnSegment: true };
    }

    // Use line-line intersection to get the hit on the infinite line
    const { start, end } = surface.segment;
    const intersection = this.lineLineIntersection(currentPoint, cursorImage, start, end);

    if (!intersection) {
      // Lines are parallel - use surface midpoint
      const midpoint = Vec2.scale(Vec2.add(start, end), 0.5);
      return { point: midpoint, isOnSegment: false };
    }

    // Check if hit is on the segment (s in [0,1])
    const isOnSegment = intersection.s >= 0 && intersection.s <= 1;

    return { point: intersection.point, isOnSegment };
  }

  /**
   * Calculate intersection of two lines (not segments)
   * Returns the intersection point and parameters t and s
   * where the point = p1 + t*(p2-p1) = p3 + s*(p4-p3)
   */
  private lineLineIntersection(
    p1: Vector2,
    p2: Vector2,
    p3: Vector2,
    p4: Vector2
  ): { point: Vector2; t: number; s: number } | null {
    const d1 = Vec2.subtract(p2, p1);
    const d2 = Vec2.subtract(p4, p3);
    const d3 = Vec2.subtract(p1, p3);

    const denom = d1.x * d2.y - d1.y * d2.x;

    if (Math.abs(denom) < 0.0001) {
      return null; // Lines are parallel
    }

    const t = (d2.x * d3.y - d2.y * d3.x) / denom;
    const s = (d1.x * d3.y - d1.y * d3.x) / denom;

    const point = Vec2.add(p1, Vec2.scale(d1, t));

    return { point, t, s };
  }

  /**
   * Find any obstruction between two points
   */
  private findObstruction(
    from: Vector2,
    to: Vector2,
    excludeSurface: Surface,
    allSurfaces: readonly Surface[]
  ): { point: Vector2; surface: Surface } | null {
    const direction = Vec2.direction(from, to);
    const distance = Vec2.distance(from, to);

    if (distance < 0.001) return null;

    const ray = RayUtils.create(from, direction);
    let closest: { point: Vector2; surface: Surface; t: number } | null = null;

    for (const surface of allSurfaces) {
      if (surface.id === excludeSurface.id) continue;

      const hit = raySegmentIntersect(ray, surface.segment);

      if (hit.hit && hit.point && hit.t > 0.001 && hit.t < distance - 0.001) {
        // Check if this blocks the path
        const blocks = !surface.isPlannable() || !surface.canReflectFrom(direction);

        if (blocks && (!closest || hit.t < closest.t)) {
          closest = { point: hit.point, surface, t: hit.t };
        }
      }
    }

    return closest;
  }

  /**
   * Try to reach the cursor from current point, simulating physics
   * This bounces off ricochet surfaces and stops at walls
   *
   * First Principles:
   * - Arrow travels in the direction toward cursor
   * - If it hits a ricochet surface (from front), it bounces
   * - After bouncing, the arrow continues in the reflected direction (NOT toward cursor)
   * - If the reflected direction doesn't lead to cursor, cursor is unreachable
   */
  private tryReachCursor(
    currentPoint: Vector2,
    cursor: Vector2,
    allSurfaces: readonly Surface[],
    currentDistance: number
  ): {
    reached: boolean;
    obstruction?: { point: Vector2; surface: Surface };
    path: Vector2[];
  } {
    const path: Vector2[] = [];
    let pos = currentPoint;
    let dir = Vec2.direction(currentPoint, cursor);
    let totalDist = currentDistance;
    const maxBounces = 50;
    let headingTowardCursor = true;

    for (let bounce = 0; bounce < maxBounces; bounce++) {
      // Check exhaustion
      if (totalDist >= this.config.exhaustionLimit) {
        return { reached: false, path };
      }

      // Determine max distance for this ray segment
      let maxRayDist: number;
      if (headingTowardCursor) {
        const distToCursor = Vec2.distance(pos, cursor);
        if (distToCursor < 0.001) {
          return { reached: true, path };
        }
        maxRayDist = distToCursor;
      } else {
        // After bouncing away from cursor, use remaining exhaustion distance
        maxRayDist = this.config.exhaustionLimit - totalDist;
      }

      const ray = RayUtils.create(pos, dir);
      const hit = this.findClosestHit(ray, allSurfaces, maxRayDist);

      if (!hit) {
        if (headingTowardCursor) {
          // No surface hit before cursor - we reach it
          return { reached: true, path };
        } else {
          // Going away from cursor with nothing hit - cursor unreachable
          // Add endpoint at max distance
          const endpoint = Vec2.add(pos, Vec2.scale(dir, maxRayDist));
          path.push(endpoint);
          return { reached: false, path };
        }
      }

      // Hit something
      path.push(hit.point);
      totalDist += hit.distance;

      // Check if it blocks
      if (!hit.surface.isPlannable()) {
        // Wall - stop
        return { reached: false, obstruction: { point: hit.point, surface: hit.surface }, path };
      }

      if (!hit.surface.canReflectFrom(dir)) {
        // Ricochet from wrong side - stop
        return { reached: false, obstruction: { point: hit.point, surface: hit.surface }, path };
      }

      // Reflect and continue
      pos = hit.point;
      dir = this.reflectDirection(dir, hit.surface);

      // After bouncing, we're no longer necessarily heading toward cursor
      headingTowardCursor = false;
    }

    return { reached: false, path };
  }

  /**
   * Find the closest surface hit along a ray
   */
  private findClosestHit(
    ray: ReturnType<typeof RayUtils.create>,
    surfaces: readonly Surface[],
    maxDistance: number
  ): { surface: Surface; point: Vector2; distance: number } | null {
    let closest: { surface: Surface; point: Vector2; distance: number } | null = null;

    for (const surface of surfaces) {
      const hit = raySegmentIntersect(ray, surface.segment);

      if (hit.hit && hit.point && hit.t > 0.001 && hit.t <= maxDistance - 0.001) {
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
