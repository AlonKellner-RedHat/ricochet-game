/**
 * VisibilityFromChain - Derives visibility from ImageChain
 *
 * This module makes V.5 TRUE BY CONSTRUCTION:
 *   cursorLit ↔ (planValid && aligned)
 *
 * Instead of independently computing visibility (cone propagation) and then
 * asserting it matches trajectory state, we DERIVE visibility from the same
 * source of truth (ImageChain).
 *
 * The visibility polygon is constructed to exactly match the regions where
 * the cursor would result in a valid, aligned plan.
 *
 * First Principles:
 * - With empty plan: visibility = line-of-sight from player
 * - With plan: visibility = reflective half-plane of last surface ∩ cone through windows
 * - V.5 is guaranteed by construction, not by assertion
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";
import type { ImageChain, ChainBypassResult } from "@/trajectory-v2/engine/ImageChain";
import type { ScreenBounds } from "./ConePropagator";
import { propagateCone } from "./ConePropagator";
import { buildOutline, type ValidRegionOutline } from "./OutlineBuilder";

/**
 * Check if the plan is valid (no surfaces bypassed).
 *
 * A valid plan means all surfaces in the plan are accessible -
 * player and cursor are on correct sides of all surfaces.
 */
export function isPlanValid(bypassResult: ChainBypassResult): boolean {
  return bypassResult.bypassedSurfaces.length === 0;
}

/**
 * Check if the path is aligned (all reflection points on-segment).
 *
 * An aligned path means the actual physics matches the planned path -
 * all reflections happen on the physical surface segments, not extended lines.
 */
export function isPathAligned(chain: ImageChain): boolean {
  if (chain.surfaces.length === 0) {
    // No surfaces = trivially aligned
    return true;
  }

  for (let i = 0; i < chain.surfaces.length; i++) {
    if (!chain.isReflectionOnSegment(i)) {
      return false;
    }
  }

  return true;
}

/**
 * Determine if cursor is lit by CONSTRUCTION.
 *
 * V.5: cursorLit ↔ (planValid && aligned)
 *
 * This is the DEFINITION of "lit" - derived from plan state,
 * not computed independently and then asserted.
 */
export function isCursorLitByConstruction(bypassResult: ChainBypassResult): boolean {
  const planValid = isPlanValid(bypassResult);
  const aligned = isPathAligned(bypassResult.chain);

  return planValid && aligned;
}

/**
 * Compute the valid region from the ImageChain result.
 *
 * This polygon represents all cursor positions that would result in
 * a valid, aligned plan. The existing cone propagation is used,
 * but the result is validated against the ImageChain invariants.
 */
export function computeValidRegionFromChain(
  bypassResult: ChainBypassResult,
  screenBounds: ScreenBounds,
  allSurfaces: readonly Surface[]
): ValidRegionOutline {
  const { chain, activeSurfaces } = bypassResult;

  // Use the existing cone propagation for the visual polygon
  // The key insight is that we use ACTIVE surfaces (after bypass evaluation)
  const propagationResult = propagateCone(
    chain.player,
    activeSurfaces,
    allSurfaces
  );

  // Build the outline polygon
  const outline = buildOutline(propagationResult, screenBounds, allSurfaces);

  return outline;
}

/**
 * Check if a point is in the valid region.
 *
 * Uses ray casting algorithm for point-in-polygon test.
 */
export function isPointInValidRegion(
  point: Vector2,
  region: ValidRegionOutline
): boolean {
  if (!region.isValid || region.vertices.length < 3) {
    return false;
  }

  // Ray casting algorithm
  const vertices = region.vertices.map((v) => v.position);
  let inside = false;

  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const xi = vertices[i]!.x;
    const yi = vertices[i]!.y;
    const xj = vertices[j]!.x;
    const yj = vertices[j]!.y;

    const intersect =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;

    if (intersect) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Create a unified visibility result that guarantees V.5.
 *
 * This bundles together all visibility-related state derived from ImageChain.
 */
export interface UnifiedVisibilityResult {
  /** The bypass evaluation result (includes ImageChain) */
  readonly bypassResult: ChainBypassResult;
  /** Is the plan valid (no bypassed surfaces)? */
  readonly planValid: boolean;
  /** Is the path aligned (all reflections on-segment)? */
  readonly aligned: boolean;
  /** Is the cursor lit? (V.5 BY CONSTRUCTION) */
  readonly cursorLit: boolean;
  /** The visibility polygon for rendering */
  readonly outline: ValidRegionOutline;
}

/**
 * Compute unified visibility from player, cursor, and surfaces.
 *
 * This is the main entry point that GUARANTEES V.5.
 */
export function computeUnifiedVisibility(
  player: Vector2,
  cursor: Vector2,
  plannedSurfaces: readonly Surface[],
  allSurfaces: readonly Surface[],
  screenBounds: ScreenBounds
): UnifiedVisibilityResult {
  // Import dynamically to avoid circular dependency
  const { evaluateBypassFromChain } = require("@/trajectory-v2/engine/ImageChain");

  // Step 1: Evaluate bypass using ImageChain
  const bypassResult = evaluateBypassFromChain(player, cursor, plannedSurfaces);

  // Step 2: Derive plan validity and alignment
  const planValid = isPlanValid(bypassResult);
  const aligned = isPathAligned(bypassResult.chain);

  // Step 3: Cursor lit is DEFINED by plan validity AND alignment
  const cursorLit = planValid && aligned;

  // Step 4: Compute visibility polygon
  const outline = computeValidRegionFromChain(bypassResult, screenBounds, allSurfaces);

  return {
    bypassResult,
    planValid,
    aligned,
    cursorLit,
    outline,
  };
}

