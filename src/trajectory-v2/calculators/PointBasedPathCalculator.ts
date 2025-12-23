/**
 * PointBasedPathCalculator - Adapter for Existing Path Implementation
 *
 * Wraps the existing buildPlannedPath/buildActualPath functions to implement
 * the IPathCalculator interface, enabling backward compatibility.
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
  buildPlannedPath,
  buildActualPath,
  calculateAlignment,
} from "@/trajectory-v2/engine/PathBuilder";
import { evaluateBypass } from "@/trajectory-v2/engine/BypassEvaluator";

/**
 * Adapter that wraps the point-based path calculation.
 *
 * This is the existing implementation that uses:
 * - Point-based path representation
 * - Direction vectors (normalized)
 * - Forward ray casting for actual path
 */
export class PointBasedPathCalculator implements IPathCalculator {
  /**
   * Build planned path using the existing point-based algorithm.
   */
  buildPlannedPath(chain: ImageChain): PathCalculationResult {
    // The existing buildPlannedPath expects player, cursor, and surfaces separately
    // It also performs bypass evaluation internally
    const result = buildPlannedPath(
      chain.player,
      chain.cursor,
      chain.surfaces,
      [] // No allSurfaces for planned path calculation
    );

    return this.convertToPathResult(result);
  }

  /**
   * Build actual path using the existing point-based forward physics.
   */
  buildActualPath(
    chain: ImageChain,
    allSurfaces: readonly Surface[]
  ): PathCalculationResult {
    // Pre-compute bypass to share with both paths
    const bypassResult = evaluateBypass(
      chain.player,
      chain.cursor,
      chain.surfaces,
      allSurfaces
    );

    const result = buildActualPath(
      chain.player,
      chain.cursor,
      chain.surfaces,
      allSurfaces,
      10, // maxReflections
      bypassResult
    );

    return this.convertToPathResult(result);
  }

  /**
   * Check alignment between planned and actual paths.
   */
  checkAlignment(
    chain: ImageChain,
    allSurfaces: readonly Surface[]
  ): AlignmentCheckResult {
    // Pre-compute bypass for consistency
    const bypassResult = evaluateBypass(
      chain.player,
      chain.cursor,
      chain.surfaces,
      allSurfaces
    );

    const planned = buildPlannedPath(
      chain.player,
      chain.cursor,
      chain.surfaces,
      allSurfaces,
      bypassResult
    );

    const actual = buildActualPath(
      chain.player,
      chain.cursor,
      chain.surfaces,
      allSurfaces,
      10,
      bypassResult
    );

    const alignment = calculateAlignment(planned, actual);

    return {
      isFullyAligned: alignment.isFullyAligned,
      alignedSegmentCount: alignment.alignedSegmentCount,
      firstMismatchIndex: alignment.firstMismatchIndex,
      divergencePoint: alignment.divergencePoint,
    };
  }

  /**
   * Convert existing PathResult to PathCalculationResult.
   */
  private convertToPathResult(
    result: import("@/trajectory-v2/engine/types").PathResult
  ): PathCalculationResult {
    const hitInfo: PathHitInfo[] = result.hitInfo.map((hit) => ({
      point: hit.point,
      surface: hit.surface,
      segmentT: hit.segmentT,
      onSegment: hit.onSegment,
      reflected: hit.reflected,
    }));

    return {
      points: result.points,
      hitInfo,
      reachedCursor: result.reachedCursor,
      totalLength: result.totalLength,
      blockedBy: result.blockedBy,
      forwardProjection: result.forwardProjection,
    };
  }
}

