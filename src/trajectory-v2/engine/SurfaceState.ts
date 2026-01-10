/**
 * SurfaceState - Centralized surface information
 *
 * This module provides a unified view of all surface information:
 * - Occurrences in the plan (with positions and bypass status)
 * - Hit result (null if not hit yet)
 *
 * DESIGN PRINCIPLE: Eliminate state fragmentation.
 * Instead of tracking planned surfaces, bypassed surfaces, and hit surfaces
 * in separate arrays, we track ALL surface state in one immutable Map.
 *
 * MULTI-BOUNCE SUPPORT: A surface can appear multiple times in the plan
 * (e.g., [A, B, A] for bouncing back and forth). Each occurrence is tracked
 * independently with its own position and bypass status.
 */

import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { BypassReason } from "./types";
import { evaluateBypass } from "./BypassEvaluator";

/**
 * Result of a ray hitting a surface.
 */
export interface SurfaceHitResult {
  /** The intersection point */
  readonly hitPoint: Vector2;
  /** Parametric position along segment (0-1 = on segment) */
  readonly segmentT: number;
  /** Whether hit was on the actual segment */
  readonly onSegment: boolean;
  /** Whether we reflected off this surface */
  readonly reflected: boolean;
}

/**
 * A single occurrence of a surface in the plan.
 * Tracks position and bypass status independently.
 */
export interface SurfaceOccurrence {
  /** Position in the plan (1-indexed) */
  readonly position: number;
  /** Reason this occurrence was bypassed, or null if active */
  readonly bypassReason: BypassReason | null;
}

/**
 * Complete state of a surface in the trajectory calculation.
 *
 * All surface information lives here, not scattered across
 * multiple arrays (plannedSurfaces, bypassedSurfaces, hitInfo).
 */
export interface SurfaceState {
  /** The surface itself */
  readonly surface: Surface;

  /**
   * All occurrences of this surface in the plan.
   * Empty array = not in plan.
   * Multiple entries = surface appears multiple times (multi-bounce).
   */
  readonly occurrences: readonly SurfaceOccurrence[];

  /**
   * Position in the plan (1-indexed).
   * For backwards compatibility, returns first occurrence's position.
   * null = not in plan.
   * @deprecated Use occurrences array for full information
   */
  readonly planOrder: number | null;

  /**
   * Reason this surface was bypassed.
   * For backwards compatibility, returns first occurrence's bypass reason.
   * null = not bypassed (active in plan or not in plan).
   * @deprecated Use occurrences array for full information
   */
  readonly bypassReason: BypassReason | null;

  /**
   * Result of checking if the path hit this surface.
   * null = not hit (or not checked yet).
   * Filled in during path tracing.
   */
  readonly hitResult: SurfaceHitResult | null;
}

/**
 * Immutable Map of surface states.
 */
export type SurfaceStateMap = ReadonlyMap<string, SurfaceState>;

/**
 * Result of preparing surface states.
 */
export interface PreparedSurfaceStates {
  /** Map of surface ID to state */
  readonly states: SurfaceStateMap;
  /** Active (non-bypassed) planned surfaces in order */
  readonly activeSurfaces: readonly Surface[];
  /** All bypassed surfaces with reasons */
  readonly bypassedSurfaces: readonly { surface: Surface; reason: BypassReason }[];
}

/**
 * Prepare surface states from player/cursor position and surfaces.
 *
 * This is the SINGLE entry point for surface state preparation.
 * It computes:
 * 1. Which surfaces are in the plan (and their order)
 * 2. Which planned surfaces should be bypassed (and why)
 * 3. Creates an immutable state map for use during path tracing
 *
 * @param player Player position
 * @param cursor Cursor position
 * @param plannedSurfaces Ordered list of surfaces in the plan (may contain duplicates)
 * @param allSurfaces All surfaces in the scene
 * @returns Prepared surface states
 */
export function prepareSurfaceStates(
  player: Vector2,
  cursor: Vector2,
  plannedSurfaces: readonly Surface[],
  allSurfaces: readonly Surface[]
): PreparedSurfaceStates {
  const states = new Map<string, SurfaceState>();

  // Initialize all surfaces (not in plan, not bypassed, not hit)
  for (const surface of allSurfaces) {
    states.set(surface.id, {
      surface,
      occurrences: [],
      planOrder: null,
      bypassReason: null,
      hitResult: null,
    });
  }

  // Build occurrences map: surface ID -> array of positions
  const occurrencesMap = new Map<string, number[]>();
  for (let i = 0; i < plannedSurfaces.length; i++) {
    const surface = plannedSurfaces[i]!;
    const positions = occurrencesMap.get(surface.id) ?? [];
    positions.push(i + 1); // 1-indexed
    occurrencesMap.set(surface.id, positions);
  }

  // Evaluate bypass using the existing evaluator
  // This already handles cascade-aware evaluation for duplicates
  const bypassResult = evaluateBypass(player, cursor, plannedSurfaces, allSurfaces);

  // Build bypass map by original index
  const bypassByIndex = new Map<number, BypassReason>();
  for (const bypassed of bypassResult.bypassedSurfaces) {
    bypassByIndex.set(bypassed.originalIndex + 1, bypassed.reason); // 1-indexed
  }

  // Update states with occurrences
  for (const [surfaceId, positions] of occurrencesMap) {
    const existing = states.get(surfaceId);
    const surface = existing?.surface ?? plannedSurfaces.find(s => s.id === surfaceId)!;
    
    const occurrences: SurfaceOccurrence[] = positions.map(position => ({
      position,
      bypassReason: bypassByIndex.get(position) ?? null,
    }));

    // For backwards compatibility, use first occurrence's values
    const firstOccurrence = occurrences[0];
    
    states.set(surfaceId, {
      surface,
      occurrences,
      planOrder: firstOccurrence?.position ?? null,
      bypassReason: firstOccurrence?.bypassReason ?? null,
      hitResult: existing?.hitResult ?? null,
    });
  }

  // Build bypassed list
  const bypassedSurfaces = bypassResult.bypassedSurfaces.map((b) => ({
    surface: b.surface,
    reason: b.reason,
  }));

  return {
    states,
    activeSurfaces: bypassResult.activeSurfaces,
    bypassedSurfaces,
  };
}

/**
 * Get the active (non-bypassed) planned surfaces from state map.
 * Returns surfaces in plan order, including duplicates.
 */
export function getActivePlannedSurfaces(states: SurfaceStateMap): Surface[] {
  const planned: { surface: Surface; order: number }[] = [];

  for (const state of states.values()) {
    for (const occurrence of state.occurrences) {
      if (occurrence.bypassReason === null) {
        planned.push({ surface: state.surface, order: occurrence.position });
      }
    }
  }

  // Sort by plan order
  planned.sort((a, b) => a.order - b.order);

  return planned.map((p) => p.surface);
}

/**
 * Get the next expected planned surface at a given plan index.
 * Returns null if index is out of range or surface is bypassed.
 *
 * @param states Surface state map
 * @param planIndex The plan index to look for (1-indexed)
 */
export function getPlannedSurfaceAtIndex(
  states: SurfaceStateMap,
  planIndex: number
): Surface | null {
  for (const state of states.values()) {
    for (const occurrence of state.occurrences) {
      if (occurrence.position === planIndex && occurrence.bypassReason === null) {
        return state.surface;
      }
    }
  }
  return null;
}

/**
 * Check if a surface is in the plan and has at least one non-bypassed occurrence.
 */
export function isActivePlannedSurface(
  states: SurfaceStateMap,
  surfaceId: string
): boolean {
  const state = states.get(surfaceId);
  if (!state) return false;
  
  return state.occurrences.some(occ => occ.bypassReason === null);
}

/**
 * Get the plan order of a surface, or null if not planned/all bypassed.
 * Returns the first active occurrence's position.
 */
export function getPlanOrder(
  states: SurfaceStateMap,
  surfaceId: string
): number | null {
  const state = states.get(surfaceId);
  if (!state) return null;
  
  const activeOccurrence = state.occurrences.find(occ => occ.bypassReason === null);
  return activeOccurrence?.position ?? null;
}

/**
 * Create a new state map with a hit result added for a surface.
 * Returns a new map (immutable update).
 */
export function withHitResult(
  states: SurfaceStateMap,
  surfaceId: string,
  hitResult: SurfaceHitResult
): SurfaceStateMap {
  const existing = states.get(surfaceId);
  if (!existing) {
    return states;
  }

  const newStates = new Map(states);
  newStates.set(surfaceId, {
    ...existing,
    hitResult,
  });

  return newStates;
}
