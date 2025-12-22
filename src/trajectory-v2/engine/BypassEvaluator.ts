/**
 * BypassEvaluator - Determines which surfaces should be bypassed
 *
 * First Principles (Section 6):
 * 6.1 Cursor Side Rule: Cursor on non-reflective side → bypass
 * 6.2 Player Side Rule: Player on non-reflective side of first surface → bypass
 * 6.3 Reflection Chain Rule: Reflection point on wrong side of next surface → bypass next
 * 6.4 No Reflect-Through: Path may never "reflect through" a surface
 * 6.5 Dynamic Bypass: Bypass evaluated dynamically based on cursor position
 *
 * The BypassEvaluator filters planned surfaces to create an "effective plan"
 * that contains only surfaces the arrow can physically interact with.
 */

import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import { lineLineIntersection } from "@/trajectory-v2/geometry/GeometryOps";
import type { BypassedSurfaceInfo, BypassReason } from "./types";
import {
  findFirstObstruction,
  isOnReflectiveSide,
} from "./ValidityChecker";
import {
  buildBackwardImages,
  buildForwardImages,
  getCursorImageForSurface,
  getPlayerImageForSurface,
} from "./ImageCache";

/**
 * Result of bypass evaluation.
 */
export interface BypassResult {
  /** Surfaces that are active (not bypassed) */
  readonly activeSurfaces: readonly Surface[];
  /** Surfaces that were bypassed, with reasons */
  readonly bypassedSurfaces: readonly BypassedSurfaceInfo[];
}

/**
 * Configuration for bypass evaluation.
 */
export interface BypassConfig {
  /** Maximum path length before exhaustion */
  readonly exhaustionLimit: number;
  /** Whether to check for obstructions */
  readonly checkObstructions: boolean;
}

const DEFAULT_CONFIG: BypassConfig = {
  exhaustionLimit: 2000,
  checkObstructions: true,
};

/**
 * Check if player is on the reflective side of a surface.
 *
 * First Principle 6.2: Player on wrong side → bypass first surface
 */
function checkPlayerSide(
  player: Vector2,
  surface: Surface
): BypassReason | null {
  if (!isOnReflectiveSide(player, surface)) {
    return "player_wrong_side";
  }
  return null;
}

/**
 * Check if cursor is on the reflective side of a surface.
 *
 * First Principle 6.1: Cursor on wrong side of last surface → bypass
 * 
 * IMPORTANT: This check applies to the LAST surface in the active plan.
 * For intermediate surfaces, we use the reflection chain rule instead.
 */
function checkCursorSide(
  cursor: Vector2,
  surface: Surface
): BypassReason | null {
  if (!isOnReflectiveSide(cursor, surface)) {
    return "cursor_wrong_side";
  }
  return null;
}

/**
 * Check if there's an obstruction between two points.
 *
 * First Principle: Obstructions before a surface → bypass that surface
 */
function checkObstruction(
  from: Vector2,
  to: Vector2,
  targetSurface: Surface,
  allSurfaces: readonly Surface[]
): BypassReason | null {
  const obstruction = findFirstObstruction(from, to, allSurfaces, [targetSurface]);
  if (obstruction !== null) {
    return "obstruction_before";
  }
  return null;
}

/**
 * Calculate the reflection point on a surface using bidirectional images.
 *
 * This is used to check if the reflection point can reach the next surface.
 */
function calculateReflectionPoint(
  player: Vector2,
  cursor: Vector2,
  surface: Surface,
  surfaceIndex: number,
  activeSurfaces: readonly Surface[]
): Vector2 | null {
  // Build image sequences for current active plan
  const playerImages = buildForwardImages(player, activeSurfaces);
  const cursorImages = buildBackwardImages(cursor, activeSurfaces);

  // Get appropriate images for this surface
  const playerImage = getPlayerImageForSurface(playerImages, surfaceIndex);
  const cursorImage = getCursorImageForSurface(playerImages, cursorImages, surfaceIndex);

  // Calculate intersection
  const segment = surface.segment;
  const intersection = lineLineIntersection(
    playerImage,
    cursorImage,
    segment.start,
    segment.end
  );

  if (!intersection.valid) {
    return null;
  }

  return intersection.point;
}

/**
 * Check if a reflection point can reach the next surface from its reflective side.
 *
 * First Principle 6.3: Reflection on wrong side of next surface → bypass next
 */
function checkReflectionChain(
  reflectionPoint: Vector2,
  nextSurface: Surface
): BypassReason | null {
  if (!isOnReflectiveSide(reflectionPoint, nextSurface)) {
    return "cursor_wrong_side"; // Using same reason - reflection acts like cursor for next surface
  }
  return null;
}

/**
 * Evaluate which surfaces should be bypassed.
 *
 * This is the main entry point for bypass evaluation.
 * It returns an effective plan with only active (non-bypassed) surfaces.
 *
 * The algorithm:
 * 1. Check player side for first surface
 * 2. For each surface, check obstructions from current point
 * 3. For last surface, check cursor side
 * 4. For chain surfaces, check if reflection can reach next surface
 *
 * @param player Player position
 * @param cursor Cursor position
 * @param plannedSurfaces Original planned surfaces (in order)
 * @param allSurfaces All surfaces in scene (for obstruction checks)
 * @param config Optional configuration
 * @returns Bypass result with active and bypassed surfaces
 */
export function evaluateBypass(
  player: Vector2,
  cursor: Vector2,
  plannedSurfaces: readonly Surface[],
  allSurfaces: readonly Surface[],
  config: Partial<BypassConfig> = {}
): BypassResult {
  const fullConfig = { ...DEFAULT_CONFIG, ...config };
  
  const activeSurfaces: Surface[] = [];
  const bypassedSurfaces: BypassedSurfaceInfo[] = [];

  // Track current position as we build the path
  let currentPoint = player;

  for (let i = 0; i < plannedSurfaces.length; i++) {
    const surface = plannedSurfaces[i]!;
    const isFirstSurface = i === 0;
    const isLastSurface = i === plannedSurfaces.length - 1;

    let bypassReason: BypassReason | null = null;

    // Check 1: Player side (for first surface only, or current point for subsequent)
    if (isFirstSurface) {
      bypassReason = checkPlayerSide(player, surface);
    } else {
      // For non-first surfaces, check if current point (last reflection) is on correct side
      bypassReason = checkPlayerSide(currentPoint, surface);
    }

    // Check 2: Cursor side (for last ACTIVE surface)
    // We check this tentatively - if this surface becomes last after previous bypasses
    if (!bypassReason && isLastSurface) {
      bypassReason = checkCursorSide(cursor, surface);
    }

    // FIRST PRINCIPLE: Bypass should ONLY happen based on player/cursor image positions
    // relative to the surface's reflective side. Obstructions do NOT cause bypass.
    // Obstructions cause DIVERGENCE (red path) during path calculation, not bypass.
    // 
    // The old obstruction check was removed because:
    // - "A surface must be bypassed only if either the source (player image) or 
    //    the target (cursor image) of the planned reflection is on the non-reflective 
    //    side of the planned surface"
    // - Obstructions are handled by the path builder, not the bypass evaluator

    if (bypassReason) {
      bypassedSurfaces.push({
        surface,
        reason: bypassReason,
        originalIndex: i,
      });
    } else {
      activeSurfaces.push(surface);

      // Calculate reflection point to update current position
      const reflectionPoint = calculateReflectionPoint(
        player,
        cursor,
        surface,
        activeSurfaces.length - 1,
        activeSurfaces
      );

      if (reflectionPoint) {
        currentPoint = reflectionPoint;
      }
    }
  }

  // Second pass: Check if the NEW last surface (after bypasses) has cursor on wrong side
  // This handles the case where bypassing surfaces changed which surface is "last"
  if (activeSurfaces.length > 0) {
    const lastActiveSurface = activeSurfaces[activeSurfaces.length - 1]!;
    const cursorBypass = checkCursorSide(cursor, lastActiveSurface);
    
    if (cursorBypass) {
      // Remove the last surface from active and add to bypassed
      const removed = activeSurfaces.pop()!;
      const originalIndex = plannedSurfaces.indexOf(removed);
      bypassedSurfaces.push({
        surface: removed,
        reason: cursorBypass,
        originalIndex,
      });

      // Recursively check the new last surface
      // This continues until we find a valid last surface or run out
      return reevaluateLastSurface(
        player,
        cursor,
        activeSurfaces,
        bypassedSurfaces,
        plannedSurfaces
      );
    }
  }

  return { activeSurfaces, bypassedSurfaces };
}

/**
 * Recursively check if the last active surface has cursor on correct side.
 */
function reevaluateLastSurface(
  player: Vector2,
  cursor: Vector2,
  activeSurfaces: Surface[],
  bypassedSurfaces: BypassedSurfaceInfo[],
  originalPlanned: readonly Surface[]
): BypassResult {
  if (activeSurfaces.length === 0) {
    return { activeSurfaces, bypassedSurfaces };
  }

  const lastActiveSurface = activeSurfaces[activeSurfaces.length - 1]!;
  const cursorBypass = checkCursorSide(cursor, lastActiveSurface);

  if (cursorBypass) {
    const removed = activeSurfaces.pop()!;
    const originalIndex = originalPlanned.indexOf(removed);
    bypassedSurfaces.push({
      surface: removed,
      reason: cursorBypass,
      originalIndex,
    });

    // Check again with new last surface
    return reevaluateLastSurface(
      player,
      cursor,
      activeSurfaces,
      bypassedSurfaces,
      originalPlanned
    );
  }

  return { activeSurfaces, bypassedSurfaces };
}

/**
 * Quick check if a single surface should be bypassed.
 *
 * Useful for UI feedback without full path calculation.
 */
export function shouldBypassSurface(
  player: Vector2,
  cursor: Vector2,
  surface: Surface,
  isFirst: boolean,
  isLast: boolean
): BypassReason | null {
  // Check player side for first surface
  if (isFirst) {
    const playerBypass = checkPlayerSide(player, surface);
    if (playerBypass) return playerBypass;
  }

  // Check cursor side for last surface
  if (isLast) {
    const cursorBypass = checkCursorSide(cursor, surface);
    if (cursorBypass) return cursorBypass;
  }

  return null;
}

/**
 * Check if cursor is on the reflective side of a surface.
 * 
 * Exported for external use (e.g., UI feedback).
 */
export function isCursorOnReflectiveSide(
  cursor: Vector2,
  surface: Surface
): boolean {
  return isOnReflectiveSide(cursor, surface);
}

/**
 * Check if player is on the reflective side of a surface.
 * 
 * Exported for external use.
 */
export function isPlayerOnReflectiveSide(
  player: Vector2,
  surface: Surface
): boolean {
  return isOnReflectiveSide(player, surface);
}

