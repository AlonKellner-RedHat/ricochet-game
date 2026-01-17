/**
 * HitDetectionStrategy - Abstraction for hit detection logic.
 *
 * The strategy pattern allows the same outer tracing loop to work with
 * different hit detection rules. This enables:
 * - Physical paths: Only on-segment hits, uses all surfaces
 * - Planned paths: Extended line hits, uses only planned surfaces
 *
 * Both strategies use the same underlying findNextHit function from
 * RayCasting.ts, but with different options and surfaces.
 */

import type { Vector2 } from "@/types";
import type { Surface } from "@/surfaces/Surface";
import type { RayPropagator } from "./RayPropagator";
import { findNextHit, type HitDetectionMode } from "@/trajectory-v2/geometry/RayCasting";
import { HitPoint } from "@/trajectory-v2/geometry/SourcePoint";
import { registerStrategySurfaces } from "./TracePath";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of a strategy's hit detection.
 *
 * Contains all information needed to:
 * - Add the hit to the path
 * - Decide whether to reflect
 * - Create provenance (HitPoint)
 */
export interface StrategyHitResult {
  /** The world-space hit point */
  readonly point: Vector2;
  /** The surface that was hit */
  readonly surface: Surface;
  /** Whether the hit is on the actual segment (true) or extended line (false) */
  readonly onSegment: boolean;
  /** Whether reflection is allowed (strategy-specific) */
  readonly canReflect: boolean;
  /** The HitPoint with full provenance */
  readonly hitPoint: HitPoint;
}

/**
 * Strategy for detecting hits on rays.
 *
 * Different strategies implement different rules for:
 * - Which surfaces to check
 * - Whether off-segment hits count
 * - Whether reflection is allowed
 */
export interface HitDetectionStrategy {
  /**
   * Find the next hit for the current propagator state.
   *
   * @param propagator The current ray propagator state
   * @returns The hit result, or null if no hit found
   */
  findNextHit(propagator: RayPropagator): StrategyHitResult | null;

  /**
   * The mode of this strategy ("physical" or "planned").
   */
  readonly mode: HitDetectionMode;
}

// =============================================================================
// PHYSICAL STRATEGY
// =============================================================================

/**
 * Create a strategy for physical hit detection.
 *
 * Physical mode:
 * - Only detects hits on actual surface segments (s in [0, 1])
 * - Uses all provided surfaces for detection
 * - Respects surface.canReflectFrom() for reflection eligibility
 *
 * @param surfaces All surfaces to check for hits
 * @returns A physical hit detection strategy
 */
export function createPhysicalStrategy(
  surfaces: readonly Surface[]
): HitDetectionStrategy {
  const mode: HitDetectionMode = "physical";

  function findNextHitImpl(propagator: RayPropagator): StrategyHitResult | null {
    const ray = propagator.getRay();
    const state = propagator.getState();

    const hit = findNextHit(ray, surfaces, {
      mode,
      startLine: state.startLine ?? undefined,
      startLineSurface: state.lastSurface ?? undefined,
    });

    if (!hit) {
      return null;
    }

    const point = hit.hitPoint.computeXY();

    return {
      point,
      surface: hit.hitPoint.hitSurface,
      onSegment: hit.onSegment,
      canReflect: hit.canReflect,
      hitPoint: hit.hitPoint,
    };
  }

  const strategy: HitDetectionStrategy = {
    findNextHit: findNextHitImpl,
    mode,
  };

  // Register surfaces for continueFromPosition support
  registerStrategySurfaces(strategy, surfaces);

  return strategy;
}

// =============================================================================
// PLANNED STRATEGY
// =============================================================================

/**
 * Create a strategy for planned path hit detection.
 *
 * Planned mode:
 * - Detects hits on extended lines (not just segments)
 * - Uses only the provided planned surfaces
 * - Always allows reflection (planned surfaces are assumed reflective)
 *
 * @param plannedSurfaces The planned surfaces to check
 * @returns A planned hit detection strategy
 */
export function createPlannedStrategy(
  plannedSurfaces: readonly Surface[]
): HitDetectionStrategy {
  const mode: HitDetectionMode = "planned";

  function findNextHitImpl(propagator: RayPropagator): StrategyHitResult | null {
    const ray = propagator.getRay();
    const state = propagator.getState();

    const hit = findNextHit(ray, plannedSurfaces, {
      mode,
      startLine: state.startLine ?? undefined,
      startLineSurface: state.lastSurface ?? undefined,
    });

    if (!hit) {
      return null;
    }

    const point = hit.hitPoint.computeXY();

    return {
      point,
      surface: hit.hitPoint.hitSurface,
      onSegment: hit.onSegment,
      // In planned mode, surfaces are always considered reflective
      canReflect: true,
      hitPoint: hit.hitPoint,
    };
  }

  const strategy: HitDetectionStrategy = {
    findNextHit: findNextHitImpl,
    mode,
  };

  // Register surfaces for continueFromPosition support
  registerStrategySurfaces(strategy, plannedSurfaces);

  return strategy;
}
