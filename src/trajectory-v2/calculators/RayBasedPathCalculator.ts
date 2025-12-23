/**
 * RayBasedPathCalculator - Ray-Based Path Implementation
 *
 * Uses the ray-based core (ImageChain, RayCore, RayPathBuilder) for path
 * calculation, ensuring exact geometry and V.5 correlation.
 *
 * First Principles:
 * 1. Planned path = rays derived directly from ImageChain
 * 2. Actual path = forward physics using ray intersection
 * 3. Paths derived from same ImageChain = guaranteed consistency
 */

import type { Surface } from "@/surfaces/Surface";
import type { ImageChain } from "@/trajectory-v2/engine/ImageChain";
import type {
  IPathCalculator,
  PathCalculationResult,
  PathHitInfo,
  AlignmentCheckResult,
} from "@/trajectory-v2/interfaces/IPathCalculator";
import {
  buildPlannedRayPath,
  buildActualRayPath,
  rayPathToPoints,
  type RayPath,
} from "@/trajectory-v2/engine/RayPathBuilder";

/**
 * Ray-based path calculator implementation.
 *
 * Uses rays as the core primitive for all path calculations,
 * ensuring exact matching between planned and actual paths.
 */
export class RayBasedPathCalculator implements IPathCalculator {
  /**
   * Build planned path from ImageChain rays.
   *
   * The planned path is purely geometric - it follows the reflection points
   * computed by ImageChain without considering obstacles.
   */
  buildPlannedPath(chain: ImageChain): PathCalculationResult {
    const rayPath = buildPlannedRayPath(chain);
    return this.convertRayPath(rayPath, chain);
  }

  /**
   * Build actual path using ray-based forward physics.
   *
   * Uses ImageChain for initial direction, then performs forward ray casting
   * against all surfaces. Only reflects at on-segment hits.
   */
  buildActualPath(
    chain: ImageChain,
    allSurfaces: readonly Surface[]
  ): PathCalculationResult {
    const rayPath = buildActualRayPath(chain, allSurfaces);
    return this.convertRayPath(rayPath, chain);
  }

  /**
   * Check alignment between planned and actual paths.
   *
   * Uses ray-based calculations to determine if paths align.
   * Aligned means: all planned reflections happen on-segment and
   * no obstacles block the path.
   */
  checkAlignment(
    chain: ImageChain,
    allSurfaces: readonly Surface[]
  ): AlignmentCheckResult {
    const planned = buildPlannedRayPath(chain);
    const actual = buildActualRayPath(chain, allSurfaces);

    // Check if all planned hits are on-segment
    const allOnSegment = planned.hits.every((hit) => hit.onSegment);

    // Check if actual path reached cursor
    const reachedCursor = actual.termination === "cursor";

    // Check if paths have same number of reflections
    const sameReflectionCount = planned.hits.length === actual.hits.length;

    // Check if hit points match
    let alignedCount = 0;
    let divergencePoint: import("@/trajectory-v2/geometry/types").Vector2 | undefined;

    for (let i = 0; i < Math.min(planned.hits.length, actual.hits.length); i++) {
      const plannedHit = planned.hits[i]!;
      const actualHit = actual.hits[i]!;

      // Check if same surface was hit
      if (plannedHit.surface.id !== actualHit.surface.id) {
        divergencePoint = plannedHit.point;
        break;
      }

      // Check if hit was on-segment
      if (!actualHit.onSegment) {
        divergencePoint = actualHit.point;
        break;
      }

      alignedCount++;
    }

    const isFullyAligned =
      allOnSegment &&
      reachedCursor &&
      sameReflectionCount &&
      alignedCount === planned.hits.length;

    return {
      isFullyAligned,
      alignedSegmentCount: alignedCount,
      firstMismatchIndex: isFullyAligned ? -1 : alignedCount,
      divergencePoint,
    };
  }

  /**
   * Convert RayPath to PathCalculationResult.
   */
  private convertRayPath(
    rayPath: RayPath,
    _chain: ImageChain
  ): PathCalculationResult {
    const points = rayPathToPoints(rayPath);

    const hitInfo: PathHitInfo[] = rayPath.hits.map((hit) => ({
      point: hit.point,
      surface: hit.surface,
      segmentT: hit.segmentT,
      onSegment: hit.onSegment,
      reflected: hit.onSegment, // Only reflects if on segment
    }));

    // Calculate total length
    let totalLength = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1]!.x - points[i]!.x;
      const dy = points[i + 1]!.y - points[i]!.y;
      totalLength += Math.sqrt(dx * dx + dy * dy);
    }

    // Determine if cursor was reached
    const reachedCursor = rayPath.cursorPosition !== null;

    // Forward projection is remaining rays after cursor
    let forwardProjection: import("@/trajectory-v2/geometry/types").Vector2[] = [];
    if (rayPath.cursorPosition !== null) {
      const cursorRayIndex = rayPath.cursorPosition.rayIndex;
      for (let i = cursorRayIndex + 1; i < rayPath.rays.length; i++) {
        forwardProjection.push(rayPath.rays[i]!.target);
      }
    }

    // Determine blocked surface (if terminated by wall)
    let blockedBy: Surface | undefined;
    if (rayPath.termination === "wall" && rayPath.hits.length > 0) {
      blockedBy = rayPath.hits[rayPath.hits.length - 1]!.surface;
    }

    return {
      points,
      hitInfo,
      reachedCursor,
      totalLength,
      blockedBy,
      forwardProjection,
    };
  }
}

