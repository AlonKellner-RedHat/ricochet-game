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
import { findNextHit, type HitDetectionMode, type RangeLimitOption } from "@/trajectory-v2/geometry/RayCasting";
import { HitPoint } from "@/trajectory-v2/geometry/SourcePoint";
import { registerStrategySurfaces } from "./TracePath";
import type { RangeLimitPair } from "@/trajectory-v2/obstacles/RangeLimit";

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
  /** The surface that was hit (null for range limit hits) */
  readonly surface: Surface | null;
  /** Whether the hit is on the actual segment (true) or extended line (false) */
  readonly onSegment: boolean;
  /** Whether reflection is allowed (strategy-specific) */
  readonly canReflect: boolean;
  /** The HitPoint with full provenance */
  readonly hitPoint: HitPoint;
  /** Type of hit: surface or range_limit */
  readonly hitType: "surface" | "range_limit";
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
 * Options for physical strategy.
 */
export interface PhysicalStrategyOptions {
  /** Optional range limit pair */
  readonly rangeLimit?: RangeLimitPair;
}

/**
 * Create a strategy for physical hit detection.
 *
 * Physical mode:
 * - Only detects hits on actual surface segments (s in [0, 1])
 * - Uses all provided surfaces for detection
 * - Respects surface.canReflectFrom() for reflection eligibility
 * - Optionally checks range limit
 *
 * @param surfaces All surfaces to check for hits
 * @param options Optional configuration (e.g., range limit)
 * @returns A physical hit detection strategy
 */
export function createPhysicalStrategy(
  surfaces: readonly Surface[],
  options: PhysicalStrategyOptions = {}
): HitDetectionStrategy {
  const mode: HitDetectionMode = "physical";
  const { rangeLimit } = options;

  function findNextHitImpl(propagator: RayPropagator): StrategyHitResult | null {
    const ray = propagator.getRay();
    const state = propagator.getState();

    // Build range limit option if provided
    const rangeLimitOption: RangeLimitOption | undefined = rangeLimit
      ? { pair: rangeLimit, center: state.originImage }
      : undefined;

    const hit = findNextHit(ray, surfaces, {
      mode,
      startLine: state.startLine ?? undefined,
      startLineSurface: state.lastSurface ?? undefined,
      rangeLimit: rangeLimitOption,
    });

    if (!hit) {
      return null;
    }

    const point = hit.hitPoint.computeXY();

    // Handle range limit hits
    if (hit.hitType === "range_limit") {
      return {
        point,
        surface: null, // No surface for range limit
        onSegment: true,
        canReflect: false, // Range limit never reflects
        hitPoint: hit.hitPoint,
        hitType: "range_limit",
      };
    }

    return {
      point,
      surface: hit.hitPoint.hitSurface,
      onSegment: hit.onSegment,
      canReflect: hit.canReflect,
      hitPoint: hit.hitPoint,
      hitType: "surface",
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
 * - Does NOT use range limit (planned paths ignore range restrictions)
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
      // No range limit for planned paths
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
      hitType: "surface",
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
