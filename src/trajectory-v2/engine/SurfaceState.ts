/**
 * SurfaceState - Centralized surface information
 *
 * This module provides a unified view of all surface information:
 * - Plan order (null if not in plan)
 * - Bypass reason (null if active)
 * - Hit result (null if not hit yet)
 *
 * DESIGN PRINCIPLE: Eliminate state fragmentation.
 * Instead of tracking planned surfaces, bypassed surfaces, and hit surfaces
 * in separate arrays, we track ALL surface state in one immutable Map.
 */

import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { BypassReason } from "./types";
import { evaluateBypass, type BypassResult } from "./BypassEvaluator";

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
 * Complete state of a surface in the trajectory calculation.
 *
 * All surface information lives here, not scattered across
 * multiple arrays (plannedSurfaces, bypassedSurfaces, hitInfo).
 */
export interface SurfaceState {
  /** The surface itself */
  readonly surface: Surface;

  /**
   * Position in the plan (1-indexed).
   * null = not in plan.
   */
  readonly planOrder: number | null;

  /**
   * Reason this surface was bypassed.
   * null = not bypassed (active in plan or not in plan).
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
 * @param plannedSurfaces Ordered list of surfaces in the plan
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
      planOrder: null,
      bypassReason: null,
      hitResult: null,
    });
  }

  // Mark planned surfaces with their order
  for (let i = 0; i < plannedSurfaces.length; i++) {
    const surface = plannedSurfaces[i]!;
    const existing = states.get(surface.id);
    if (existing) {
      states.set(surface.id, {
        ...existing,
        planOrder: i + 1, // 1-indexed
      });
    } else {
      // Surface is planned but not in allSurfaces - add it
      states.set(surface.id, {
        surface,
        planOrder: i + 1,
        bypassReason: null,
        hitResult: null,
      });
    }
  }

  // Evaluate bypass using the existing evaluator
  const bypassResult = evaluateBypass(player, cursor, plannedSurfaces, allSurfaces);

  // Mark bypassed surfaces
  for (const bypassed of bypassResult.bypassedSurfaces) {
    const existing = states.get(bypassed.surface.id);
    if (existing) {
      states.set(bypassed.surface.id, {
        ...existing,
        bypassReason: bypassed.reason,
      });
    }
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
 * Returns surfaces in plan order.
 */
export function getActivePlannedSurfaces(states: SurfaceStateMap): Surface[] {
  const planned: { surface: Surface; order: number }[] = [];

  for (const state of states.values()) {
    if (state.planOrder !== null && state.bypassReason === null) {
      planned.push({ surface: state.surface, order: state.planOrder });
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
    if (state.planOrder === planIndex && state.bypassReason === null) {
      return state.surface;
    }
  }
  return null;
}

/**
 * Check if a surface is in the plan and not bypassed.
 */
export function isActivePlannedSurface(
  states: SurfaceStateMap,
  surfaceId: string
): boolean {
  const state = states.get(surfaceId);
  return state !== null && state !== undefined && 
         state.planOrder !== null && 
         state.bypassReason === null;
}

/**
 * Get the plan order of a surface, or null if not planned/bypassed.
 */
export function getPlanOrder(
  states: SurfaceStateMap,
  surfaceId: string
): number | null {
  const state = states.get(surfaceId);
  if (!state || state.bypassReason !== null) {
    return null;
  }
  return state.planOrder;
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

