/**
 * IPathCalculator - Strategy Interface for Path Calculation
 *
 * Defines the contract for trajectory path calculation.
 * Implementations can use different algorithms (point-based, ray-based, etc.)
 * while maintaining the same interface.
 *
 * First Principles:
 * - Planned path uses bidirectional images
 * - Actual path uses forward physics
 * - Paths diverge when hit is off-segment or obstructed
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";
import type { ImageChain } from "@/trajectory-v2/engine/ImageChain";

/**
 * Information about a surface hit along the path.
 */
export interface PathHitInfo {
  /** The intersection point */
  readonly point: Vector2;
  /** The surface that was hit */
  readonly surface: Surface;
  /** Parametric position along the surface segment (0=start, 1=end) */
  readonly segmentT: number;
  /** Whether the hit is on the actual segment (not extended line) */
  readonly onSegment: boolean;
  /** Whether the path reflected at this hit */
  readonly reflected: boolean;
}

/**
 * Result of path calculation.
 */
export interface PathCalculationResult {
  /** Ordered waypoints from player to cursor/termination */
  readonly points: readonly Vector2[];
  /** Information about each surface hit */
  readonly hitInfo: readonly PathHitInfo[];
  /** Whether the path reached the cursor */
  readonly reachedCursor: boolean;
  /** Total path length */
  readonly totalLength: number;
  /** Surface that blocked the path (if any) */
  readonly blockedBy?: Surface;
  /** Forward projection points beyond cursor */
  readonly forwardProjection?: readonly Vector2[];
}

/**
 * Result of path alignment check.
 */
export interface AlignmentCheckResult {
  /** Whether paths are fully aligned (no divergence) */
  readonly isFullyAligned: boolean;
  /** Number of segments that are aligned */
  readonly alignedSegmentCount: number;
  /** Index of first mismatched segment (-1 if fully aligned) */
  readonly firstMismatchIndex: number;
  /** Point where divergence occurs */
  readonly divergencePoint?: Vector2;
}

/**
 * Strategy interface for path calculation.
 *
 * Implementations should:
 * 1. Use ImageChain for reflection geometry
 * 2. Build both planned and actual paths
 * 3. Compare paths to detect divergence
 */
export interface IPathCalculator {
  /**
   * Build the planned path from player to cursor through planned surfaces.
   *
   * The planned path uses bidirectional image reflection - it represents
   * the ideal trajectory assuming all reflections happen as planned.
   *
   * @param chain ImageChain containing player/cursor images
   * @returns Planned path result
   */
  buildPlannedPath(chain: ImageChain): PathCalculationResult;

  /**
   * Build the actual path using forward physics simulation.
   *
   * The actual path uses forward ray casting - it represents what
   * actually happens when the arrow is shot (obstacles, off-segment hits).
   *
   * @param chain ImageChain for initial direction
   * @param allSurfaces All surfaces in the scene
   * @returns Actual path result
   */
  buildActualPath(
    chain: ImageChain,
    allSurfaces: readonly Surface[]
  ): PathCalculationResult;

  /**
   * Check if the planned path is aligned with the actual path.
   *
   * Aligned means: all planned reflections happen on-segment and
   * no obstacles block the path.
   *
   * @param chain ImageChain for the paths
   * @param allSurfaces All surfaces in the scene
   * @returns Alignment check result
   */
  checkAlignment(
    chain: ImageChain,
    allSurfaces: readonly Surface[]
  ): AlignmentCheckResult;
}

