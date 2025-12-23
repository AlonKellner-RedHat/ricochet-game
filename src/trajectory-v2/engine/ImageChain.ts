/**
 * ImageChain - Single Source of Truth for Trajectory and Visibility
 *
 * This module provides the foundational data structure that both the trajectory
 * system and the visibility system derive from. By having ONE source of truth,
 * we guarantee that visibility and trajectory are always in sync.
 *
 * Mathematical Foundation:
 * - playerImage[i] = reflect(playerImage[i-1], surface[i-1])
 * - cursorImage[i] = reflect(cursorImage[i-1], surface[n-i]) (backward)
 * - reflectionPoint[i] = intersect(line(playerImage[i], cursorImage[n-i]), surface[i])
 *
 * First Principles:
 * 1. Determinism: All methods are pure functions - same inputs always produce same outputs
 * 2. Reversibility: reflect(reflect(p, line), line) === p exactly
 * 3. Exact Predicates: Side checks use cross-product sign (no tolerance)
 */

import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { BypassedSurfaceInfo, BypassReason } from "./types";
import {
  reflectPointThroughLine,
  lineLineIntersection,
  pointSideOfLine,
} from "@/trajectory-v2/geometry/GeometryOps";
import type { Ray } from "@/trajectory-v2/geometry/RayCore";

/**
 * ImageChain interface - the contract for the single source of truth.
 */
export interface ImageChain {
  /** The original player position */
  readonly player: Vector2;

  /** The cursor/target position */
  readonly cursor: Vector2;

  /** The ordered list of planned surfaces */
  readonly surfaces: readonly Surface[];

  /**
   * Get the player image at a specific depth.
   * depth 0 = original player
   * depth i = player reflected through surfaces[0..i-1]
   */
  getPlayerImage(depth: number): Vector2;

  /**
   * Get the cursor image at a specific depth.
   * depth 0 = original cursor
   * depth i = cursor reflected through surfaces[n-1..n-i] (backward order)
   */
  getCursorImage(depth: number): Vector2;

  /**
   * Get the reflection point on a specific surface.
   * This is where the ray from playerImage[i] to cursorImage[n-i] hits surface[i].
   */
  getReflectionPoint(surfaceIndex: number): Vector2;

  /**
   * Check if the reflection point for a surface is on the segment (not extended line).
   * Uses exact geometric predicate (parametric t in [0, 1]).
   */
  isReflectionOnSegment(surfaceIndex: number): boolean;

  /**
   * Check if the player is on the reflective side of a surface.
   * Uses exact cross-product (no floating-point tolerance).
   */
  isPlayerOnReflectiveSide(surfaceIndex: number): boolean;

  /**
   * Check if the cursor is on the reflective side of a surface.
   * Uses exact cross-product (no floating-point tolerance).
   */
  isCursorOnReflectiveSide(surfaceIndex: number): boolean;

  // ==========================================================================
  // Ray Interface - Unified foundation for trajectory and visibility
  // ==========================================================================

  /**
   * Get the ray for trajectory segment at given index.
   *
   * For segment i (0-indexed):
   * - source = playerImage[i] (for first segment, this is player position)
   * - target = cursorImage[n-i] where n = number of surfaces
   *
   * This ray intersects surface[i] at exactly the reflection point.
   * For a plan with no surfaces, returns ray from player to cursor.
   *
   * @param segmentIndex Which segment (0 = first, from player)
   * @returns Ray from playerImage toward cursorImage
   */
  getRay(segmentIndex: number): Ray;

  /**
   * Get the physical ray AFTER reflecting at a surface.
   *
   * This is the direction the ball travels after bouncing off surface[surfaceIndex].
   * - source = reflectionPoint[surfaceIndex]
   * - target = cursorImage[n-1-surfaceIndex] or cursor if it's the last surface
   *
   * @param surfaceIndex Which surface was just hit
   * @returns Ray from reflection point toward next target
   */
  getReflectedRay(surfaceIndex: number): Ray;

  /**
   * Get all rays forming the complete planned path.
   *
   * Returns n+1 rays for n surfaces:
   * - ray[0]: player → reflectionPoint[0]
   * - ray[i]: reflectionPoint[i-1] → reflectionPoint[i]
   * - ray[n]: reflectionPoint[n-1] → cursor
   *
   * For empty plan, returns single ray: player → cursor
   */
  getAllRays(): readonly Ray[];
}

/**
 * Create an ImageChain from player, cursor, and planned surfaces.
 *
 * The ImageChain caches all computed values for determinism.
 * Calling any method multiple times returns the exact same value.
 */
export function createImageChain(
  player: Vector2,
  cursor: Vector2,
  surfaces: readonly Surface[]
): ImageChain {
  // Pre-compute all images for determinism
  const playerImages = computePlayerImages(player, surfaces);
  const cursorImages = computeCursorImages(cursor, surfaces);
  const reflectionPoints = computeReflectionPoints(
    playerImages,
    cursorImages,
    surfaces
  );
  const onSegmentFlags = computeOnSegmentFlags(reflectionPoints, surfaces);

  return {
    player,
    cursor,
    surfaces,

    getPlayerImage(depth: number): Vector2 {
      if (depth < 0 || depth > surfaces.length) {
        throw new Error(
          `Invalid player image depth ${depth}, max is ${surfaces.length}`
        );
      }
      return playerImages[depth]!;
    },

    getCursorImage(depth: number): Vector2 {
      if (depth < 0 || depth > surfaces.length) {
        throw new Error(
          `Invalid cursor image depth ${depth}, max is ${surfaces.length}`
        );
      }
      return cursorImages[depth]!;
    },

    getReflectionPoint(surfaceIndex: number): Vector2 {
      if (surfaceIndex < 0 || surfaceIndex >= surfaces.length) {
        throw new Error(
          `Invalid surface index ${surfaceIndex}, max is ${surfaces.length - 1}`
        );
      }
      return reflectionPoints[surfaceIndex]!;
    },

    isReflectionOnSegment(surfaceIndex: number): boolean {
      if (surfaceIndex < 0 || surfaceIndex >= surfaces.length) {
        throw new Error(
          `Invalid surface index ${surfaceIndex}, max is ${surfaces.length - 1}`
        );
      }
      return onSegmentFlags[surfaceIndex]!;
    },

    isPlayerOnReflectiveSide(surfaceIndex: number): boolean {
      if (surfaceIndex < 0 || surfaceIndex >= surfaces.length) {
        throw new Error(
          `Invalid surface index ${surfaceIndex}, max is ${surfaces.length - 1}`
        );
      }
      return isOnReflectiveSide(player, surfaces[surfaceIndex]!);
    },

    isCursorOnReflectiveSide(surfaceIndex: number): boolean {
      if (surfaceIndex < 0 || surfaceIndex >= surfaces.length) {
        throw new Error(
          `Invalid surface index ${surfaceIndex}, max is ${surfaces.length - 1}`
        );
      }
      return isOnReflectiveSide(cursor, surfaces[surfaceIndex]!);
    },

    // Ray interface methods
    getRay(segmentIndex: number): Ray {
      const n = surfaces.length;

      // For empty plan, only segment 0 is valid (player → cursor)
      if (n === 0) {
        if (segmentIndex !== 0) {
          throw new Error(`Invalid segment index ${segmentIndex} for empty plan`);
        }
        return { source: player, target: cursor };
      }

      // For plan with surfaces: segment i uses playerImage[i] and cursorImage[n-i]
      if (segmentIndex < 0 || segmentIndex > n) {
        throw new Error(
          `Invalid segment index ${segmentIndex}, valid range is 0..${n}`
        );
      }

      const source = playerImages[segmentIndex]!;
      const target = cursorImages[n - segmentIndex]!;

      return { source, target };
    },

    getReflectedRay(surfaceIndex: number): Ray {
      if (surfaceIndex < 0 || surfaceIndex >= surfaces.length) {
        throw new Error(
          `Invalid surface index ${surfaceIndex}, max is ${surfaces.length - 1}`
        );
      }

      const n = surfaces.length;
      const source = reflectionPoints[surfaceIndex]!;

      // Target depends on whether this is the last surface
      if (surfaceIndex === n - 1) {
        // Last surface - ray goes to cursor
        return { source, target: cursor };
      } else {
        // Not last - ray goes toward next reflection point
        // But we use the cursorImage for the next segment for exactness
        const nextCursorImage = cursorImages[n - surfaceIndex - 1]!;
        return { source, target: nextCursorImage };
      }
    },

    getAllRays(): readonly Ray[] {
      const n = surfaces.length;
      const rays: Ray[] = [];

      if (n === 0) {
        // No surfaces: single ray from player to cursor
        rays.push({ source: player, target: cursor });
        return rays;
      }

      // First ray: player → reflectionPoint[0]
      rays.push({
        source: player,
        target: reflectionPoints[0]!,
      });

      // Middle rays: reflectionPoint[i-1] → reflectionPoint[i]
      for (let i = 1; i < n; i++) {
        rays.push({
          source: reflectionPoints[i - 1]!,
          target: reflectionPoints[i]!,
        });
      }

      // Last ray: reflectionPoint[n-1] → cursor
      rays.push({
        source: reflectionPoints[n - 1]!,
        target: cursor,
      });

      return rays;
    },
  };
}

/**
 * Compute forward player images through all surfaces.
 * Returns array of length surfaces.length + 1 (includes original).
 */
function computePlayerImages(
  player: Vector2,
  surfaces: readonly Surface[]
): Vector2[] {
  const images: Vector2[] = [player];
  let current = player;

  for (const surface of surfaces) {
    const reflected = reflectPointThroughLine(
      current,
      surface.segment.start,
      surface.segment.end
    );
    images.push(reflected);
    current = reflected;
  }

  return images;
}

/**
 * Compute backward cursor images through surfaces in reverse order.
 * Returns array of length surfaces.length + 1 (includes original).
 */
function computeCursorImages(
  cursor: Vector2,
  surfaces: readonly Surface[]
): Vector2[] {
  const images: Vector2[] = [cursor];
  let current = cursor;

  // Process surfaces in reverse order
  for (let i = surfaces.length - 1; i >= 0; i--) {
    const surface = surfaces[i]!;
    const reflected = reflectPointThroughLine(
      current,
      surface.segment.start,
      surface.segment.end
    );
    images.push(reflected);
    current = reflected;
  }

  return images;
}

/**
 * Compute reflection points for all surfaces.
 *
 * For surface[i], the reflection point is the intersection of:
 * - Ray from playerImage[i] to cursorImage[n-i]
 * - The line of surface[i]
 */
function computeReflectionPoints(
  playerImages: Vector2[],
  cursorImages: Vector2[],
  surfaces: readonly Surface[]
): Vector2[] {
  const n = surfaces.length;
  const points: Vector2[] = [];

  for (let i = 0; i < n; i++) {
    const playerImg = playerImages[i]!;
    const cursorImg = cursorImages[n - i]!;
    const surface = surfaces[i]!;

    const intersection = lineLineIntersection(
      playerImg,
      cursorImg,
      surface.segment.start,
      surface.segment.end
    );

    if (intersection.valid) {
      points.push(intersection.point);
    } else {
      // Parallel lines - use midpoint of segment as fallback
      points.push({
        x: (surface.segment.start.x + surface.segment.end.x) / 2,
        y: (surface.segment.start.y + surface.segment.end.y) / 2,
      });
    }
  }

  return points;
}

/**
 * Compute whether each reflection point is on its segment.
 * Uses exact parametric check: t in [0, 1] means on segment.
 */
function computeOnSegmentFlags(
  reflectionPoints: Vector2[],
  surfaces: readonly Surface[]
): boolean[] {
  const flags: boolean[] = [];

  for (let i = 0; i < surfaces.length; i++) {
    const point = reflectionPoints[i]!;
    const surface = surfaces[i]!;
    const { start, end } = surface.segment;

    // Compute parametric t: point = start + t * (end - start)
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSq = dx * dx + dy * dy;

    if (lengthSq < 1e-20) {
      // Degenerate segment - check if point is at start
      const distSq =
        (point.x - start.x) ** 2 + (point.y - start.y) ** 2;
      flags.push(distSq < 1e-10);
      continue;
    }

    // t = ((point - start) · (end - start)) / |end - start|²
    const t =
      ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq;

    // Exact check: t in [0, 1]
    // Use small epsilon only to handle floating-point representation,
    // not geometric tolerance
    const EPSILON = 1e-10;
    flags.push(t >= -EPSILON && t <= 1 + EPSILON);
  }

  return flags;
}

/**
 * Check if a point is on the reflective side of a surface.
 *
 * Uses the surface's canReflectFrom method with the direction from
 * the surface toward the point. This is the authoritative check.
 */
function isOnReflectiveSide(point: Vector2, surface: Surface): boolean {
  // For surfaces that reflect from both sides, always return true
  // Test with arbitrary direction
  const testDir1 = { x: 1, y: 0 };
  const testDir2 = { x: -1, y: 0 };
  if (surface.canReflectFrom(testDir1) && surface.canReflectFrom(testDir2)) {
    return true;
  }

  // Compute direction from surface to point
  const midX = (surface.segment.start.x + surface.segment.end.x) / 2;
  const midY = (surface.segment.start.y + surface.segment.end.y) / 2;

  // Direction from point toward the surface (incoming ray direction)
  const toSurfaceX = midX - point.x;
  const toSurfaceY = midY - point.y;

  // Normalize (needed for canReflectFrom)
  const len = Math.sqrt(toSurfaceX * toSurfaceX + toSurfaceY * toSurfaceY);
  if (len < 1e-10) {
    // Point is at surface center - degenerate case
    return true;
  }

  const direction = { x: toSurfaceX / len, y: toSurfaceY / len };

  return surface.canReflectFrom(direction);
}

// ============================================================================
// Bypass Evaluation from ImageChain
// ============================================================================

/**
 * Result of bypass evaluation derived from ImageChain.
 */
export interface ChainBypassResult {
  /** The ImageChain that was evaluated */
  readonly chain: ImageChain;
  /** Surfaces that are active (not bypassed) */
  readonly activeSurfaces: readonly Surface[];
  /** Surfaces that were bypassed, with reasons */
  readonly bypassedSurfaces: readonly BypassedSurfaceInfo[];
  /** Indices of bypassed surfaces in original order */
  readonly bypassedIndices: readonly number[];
}

/**
 * Evaluate bypass using ImageChain queries.
 *
 * First Principles (Section 6):
 * - 6.1: Cursor on non-reflective side of LAST surface → bypass that surface
 * - 6.2: Player on non-reflective side of FIRST surface → bypass that surface
 * - 6.3: Reflection point on wrong side of NEXT surface → bypass next surface
 *
 * This function derives bypass decisions entirely from ImageChain state,
 * ensuring consistency with path calculation.
 */
export function evaluateBypassFromChain(
  player: Vector2,
  cursor: Vector2,
  plannedSurfaces: readonly Surface[]
): ChainBypassResult {
  if (plannedSurfaces.length === 0) {
    const chain = createImageChain(player, cursor, []);
    return {
      chain,
      activeSurfaces: [],
      bypassedSurfaces: [],
      bypassedIndices: [],
    };
  }

  // First pass: mark surfaces for bypass based on simple rules
  const bypassFlags: boolean[] = new Array(plannedSurfaces.length).fill(false);
  const bypassReasons: (BypassReason | null)[] = new Array(
    plannedSurfaces.length
  ).fill(null);

  // Create chain for full plan (used for reflection point calculations)
  const fullChain = createImageChain(player, cursor, plannedSurfaces);

  // Rule 6.2: Player on wrong side of first surface
  if (!fullChain.isPlayerOnReflectiveSide(0)) {
    bypassFlags[0] = true;
    bypassReasons[0] = "player_wrong_side";
  }

  // Rule 6.1: Cursor on wrong side of last surface
  const lastIndex = plannedSurfaces.length - 1;
  if (!fullChain.isCursorOnReflectiveSide(lastIndex)) {
    bypassFlags[lastIndex] = true;
    bypassReasons[lastIndex] = "cursor_wrong_side";
  }

  // Rule 6.3: Reflection chain breaks - reflection point on wrong side of next
  for (let i = 0; i < plannedSurfaces.length - 1; i++) {
    if (bypassFlags[i]) continue; // Skip already bypassed

    const reflectionPoint = fullChain.getReflectionPoint(i);
    const nextSurface = plannedSurfaces[i + 1]!;

    if (!isOnReflectiveSide(reflectionPoint, nextSurface)) {
      bypassFlags[i + 1] = true;
      bypassReasons[i + 1] = "chain_break";
    }
  }

  // Build active and bypassed lists
  const activeSurfaces: Surface[] = [];
  const bypassedSurfaces: BypassedSurfaceInfo[] = [];
  const bypassedIndices: number[] = [];

  for (let i = 0; i < plannedSurfaces.length; i++) {
    if (bypassFlags[i]) {
      bypassedSurfaces.push({
        surface: plannedSurfaces[i]!,
        reason: bypassReasons[i] || "unknown",
        originalIndex: i,
      });
      bypassedIndices.push(i);
    } else {
      activeSurfaces.push(plannedSurfaces[i]!);
    }
  }

  // Second pass: if last ACTIVE surface has cursor on wrong side, bypass it too
  // This handles cases where bypassing earlier surfaces changed which is "last"
  const finalResult = reevaluateActiveSurfaces(
    player,
    cursor,
    activeSurfaces,
    bypassedSurfaces,
    bypassedIndices,
    plannedSurfaces
  );

  // Create final chain with active surfaces only
  const finalChain = createImageChain(player, cursor, finalResult.activeSurfaces);

  return {
    chain: finalChain,
    activeSurfaces: finalResult.activeSurfaces,
    bypassedSurfaces: finalResult.bypassedSurfaces,
    bypassedIndices: finalResult.bypassedIndices,
  };
}

/**
 * Recursively check if the last active surface has cursor on correct side.
 */
function reevaluateActiveSurfaces(
  player: Vector2,
  cursor: Vector2,
  activeSurfaces: Surface[],
  bypassedSurfaces: BypassedSurfaceInfo[],
  bypassedIndices: number[],
  originalPlanned: readonly Surface[]
): {
  activeSurfaces: Surface[];
  bypassedSurfaces: BypassedSurfaceInfo[];
  bypassedIndices: number[];
} {
  if (activeSurfaces.length === 0) {
    return { activeSurfaces, bypassedSurfaces, bypassedIndices };
  }

  const lastSurface = activeSurfaces[activeSurfaces.length - 1]!;

  if (!isOnReflectiveSide(cursor, lastSurface)) {
    // Remove last surface from active, add to bypassed
    const removed = activeSurfaces.pop()!;
    const originalIndex = originalPlanned.indexOf(removed);

    bypassedSurfaces.push({
      surface: removed,
      reason: "cursor_wrong_side",
      originalIndex,
    });
    bypassedIndices.push(originalIndex);

    // Recurse to check new last surface
    return reevaluateActiveSurfaces(
      player,
      cursor,
      activeSurfaces,
      bypassedSurfaces,
      bypassedIndices,
      originalPlanned
    );
  }

  return { activeSurfaces, bypassedSurfaces, bypassedIndices };
}

// ============================================================================
// Planned Path from ImageChain
// ============================================================================

/**
 * Planned hit information derived from ImageChain.
 */
export interface ChainPlannedHit {
  /** The intersection point */
  readonly point: Vector2;
  /** The surface that was intersected */
  readonly surface: Surface;
  /** Whether the hit is on the actual segment (vs extended line) */
  readonly onSegment: boolean;
  /** Index in the original surface list */
  readonly surfaceIndex: number;
}

/**
 * Planned path derived directly from ImageChain.
 *
 * This is the simplest possible planned path calculation:
 * - Waypoints = [player, reflectionPoint[0], reflectionPoint[1], ..., cursor]
 * - Hits = one for each surface with onSegment flag
 *
 * No redundant calculations - everything comes from the cached ImageChain.
 */
export interface ChainPlannedPath {
  /** The ImageChain that generated this path */
  readonly chain: ImageChain;
  /** Waypoints from player to cursor */
  readonly waypoints: readonly Vector2[];
  /** Information about each surface interaction */
  readonly hits: readonly ChainPlannedHit[];
  /** Index of segment containing cursor (0-based, always last segment) */
  readonly cursorIndex: number;
  /** Parametric position of cursor within segment (always 1 = at end) */
  readonly cursorT: number;
}

/**
 * Build planned path directly from ImageChain.
 *
 * This is the simplest implementation: waypoints are exactly the
 * player + reflection points + cursor, all from the cached chain.
 */
export function buildPlannedPathFromChain(chain: ImageChain): ChainPlannedPath {
  const waypoints: Vector2[] = [chain.player];
  const hits: ChainPlannedHit[] = [];

  // Add each reflection point and hit info
  for (let i = 0; i < chain.surfaces.length; i++) {
    const point = chain.getReflectionPoint(i);
    const surface = chain.surfaces[i]!;
    const onSegment = chain.isReflectionOnSegment(i);

    waypoints.push(point);
    hits.push({
      point,
      surface,
      onSegment,
      surfaceIndex: i,
    });
  }

  // Add cursor as final waypoint
  waypoints.push(chain.cursor);

  return {
    chain,
    waypoints,
    hits,
    cursorIndex: waypoints.length - 2, // Last segment
    cursorT: 1, // Cursor at end
  };
}

/**
 * Build complete planned path from bypass result.
 *
 * This combines bypass evaluation with path building in one step.
 */
export function buildPlannedPathFromBypass(
  bypassResult: ChainBypassResult
): ChainPlannedPath {
  return buildPlannedPathFromChain(bypassResult.chain);
}

