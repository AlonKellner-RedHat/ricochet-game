/**
 * RayPropagator - Incremental ray propagation with memoized reflections.
 *
 * Maintains the current state of a ray (origin image + target image) as it
 * propagates through surfaces. Uses a shared ReflectionCache to avoid
 * redundant calculations.
 *
 * Key properties:
 * - Immutable: reflectThrough() returns a new propagator, original is unchanged
 * - Shared cache: Fork and original share the same ReflectionCache
 * - Bidirectional: Reflecting back through a surface returns original points by identity
 */

import type { Vector2, Ray, Segment } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";
import {
  createReflectionCache,
  type ReflectionCache,
  type ReflectionCacheStats,
} from "@/trajectory-v2/geometry/ReflectionCache";

/**
 * State of a propagator at a given point in the reflection chain.
 */
export interface PropagatorState {
  /** Current origin image (reflected player position) */
  readonly originImage: Vector2;
  /** Current target image (reflected cursor position) */
  readonly targetImage: Vector2;
  /** Number of reflections so far */
  readonly depth: number;
  /** Surface of the last reflection (null if no reflections yet) */
  readonly lastSurface: Surface | null;
  /**
   * The startLine for hit detection.
   * 
   * After reflecting through a surface, this is set to that surface's segment.
   * Hit detection should only find hits PAST this line (higher t values).
   * This provides full provenance: we know which surface the ray started from.
   * 
   * null for the initial ray (starts from player position, no startLine).
   */
  readonly startLine: Segment | null;
}

/**
 * An immutable ray propagator.
 */
export interface RayPropagator {
  /**
   * Get the current propagator state.
   */
  getState(): PropagatorState;

  /**
   * Get the current ray (from origin image to target image).
   */
  getRay(): Ray;

  /**
   * Reflect through a surface, returning a new propagator with updated state.
   * The original propagator is not modified.
   *
   * @param surface The surface to reflect through
   * @returns A new propagator with reflected origin and target
   */
  reflectThrough(surface: Surface): RayPropagator;

  /**
   * Create an independent propagator with the same current state.
   * The forked propagator shares the reflection cache but has independent state.
   */
  fork(): RayPropagator;

  /**
   * Get statistics about the shared reflection cache.
   */
  getCacheStats(): ReflectionCacheStats;
}

/**
 * Internal function to create a propagator with given state and shared cache.
 */
function createPropagatorWithState(
  state: PropagatorState,
  cache: ReflectionCache
): RayPropagator {
  function getState(): PropagatorState {
    return state;
  }

  function getRay(): Ray {
    return {
      source: state.originImage,
      target: state.targetImage,
    };
  }

  function reflectThrough(surface: Surface): RayPropagator {
    const newOriginImage = cache.reflect(state.originImage, surface);
    const newTargetImage = cache.reflect(state.targetImage, surface);

    const newState: PropagatorState = {
      originImage: newOriginImage,
      targetImage: newTargetImage,
      depth: state.depth + 1,
      lastSurface: surface,
      // The startLine is the surface we just reflected through.
      // Hit detection will only find hits past this line.
      startLine: surface.segment,
    };

    return createPropagatorWithState(newState, cache);
  }

  function fork(): RayPropagator {
    // Create a new propagator with the same state but sharing the cache
    return createPropagatorWithState(state, cache);
  }

  function getCacheStats(): ReflectionCacheStats {
    return cache.stats();
  }

  return {
    getState,
    getRay,
    reflectThrough,
    fork,
    getCacheStats,
  };
}

/**
 * Create a new RayPropagator with initial origin and target.
 *
 * @param origin Starting point (e.g., player position)
 * @param target Target point (e.g., cursor position)
 * @param cache Optional shared ReflectionCache (creates new if not provided)
 * @returns A new RayPropagator
 */
export function createRayPropagator(
  origin: Vector2,
  target: Vector2,
  cache?: ReflectionCache
): RayPropagator {
  const sharedCache = cache ?? createReflectionCache();

  const initialState: PropagatorState = {
    originImage: origin,
    targetImage: target,
    depth: 0,
    lastSurface: null,
    startLine: null, // Initial ray starts from origin, no startLine
  };

  return createPropagatorWithState(initialState, sharedCache);
}
