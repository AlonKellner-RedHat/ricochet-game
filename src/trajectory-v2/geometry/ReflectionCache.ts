/**
 * ReflectionCache - Memoized point reflection through surfaces.
 *
 * Provides cached point reflections with bidirectional associations:
 * - If point P is reflected through surface S to get P', then
 *   reflecting P' through S returns P (by identity, not just equal values)
 *
 * This ensures:
 * 1. reflect(reflect(P, S), S) === P (exact identity)
 * 2. No redundant calculations
 * 3. Consistent point references for provenance tracking
 */

import type { Vector2 } from "./types";
import type { Surface } from "@/surfaces/Surface";
import { reflectPointThroughLine } from "./GeometryOps";

/**
 * Statistics about cache usage.
 */
export interface ReflectionCacheStats {
  /** Number of cache hits */
  readonly hits: number;
  /** Number of cache misses (new computations) */
  readonly misses: number;
  /** Total number of cached entries (point-surface pairs) */
  readonly size: number;
}

/**
 * A cache for point reflections through surfaces.
 */
export interface ReflectionCache {
  /**
   * Reflect a point through a surface.
   * If the reflection was already computed, returns the cached result.
   * Otherwise computes, caches, and returns the reflection.
   *
   * The result is stored bidirectionally: reflecting the result through
   * the same surface will return the original point by identity.
   *
   * @param point The point to reflect
   * @param surface The surface to reflect through
   * @returns The reflected point
   */
  reflect(point: Vector2, surface: Surface): Vector2;

  /**
   * Get a cached reflection if it exists.
   * @param point The point to look up
   * @param surface The surface it was reflected through
   * @returns The cached reflection, or undefined if not cached
   */
  get(point: Vector2, surface: Surface): Vector2 | undefined;

  /**
   * Check if a reflection is cached.
   * @param point The point to check
   * @param surface The surface to check
   * @returns True if the reflection is cached
   */
  has(point: Vector2, surface: Surface): boolean;

  /**
   * Clear all cached reflections.
   */
  clear(): void;

  /**
   * Get cache statistics.
   */
  stats(): ReflectionCacheStats;
}

/**
 * Create a key for the point-surface pair.
 * Uses object identity via WeakMap for the surface, and a nested Map for point identity.
 */
function createPointKey(point: Vector2): string {
  // Using exact coordinates as key - assumes same point objects are reused
  return `${point.x},${point.y}`;
}

/**
 * Create a new ReflectionCache instance.
 */
export function createReflectionCache(): ReflectionCache {
  // Per-surface cache: surfaceId -> Map<pointKey, reflectedPoint>
  let surfaceToPointCache = new Map<string, Map<string, Vector2>>();

  // Reverse lookup: surfaceId -> Map<reflected pointKey, originalPoint>
  // This allows us to return the original by identity when reflecting back
  let surfaceToReverseCache = new Map<string, Map<string, Vector2>>();

  // Stats
  let hits = 0;
  let misses = 0;
  let size = 0;

  function getOrCreatePointCache(surface: Surface): Map<string, Vector2> {
    let cache = surfaceToPointCache.get(surface.id);
    if (!cache) {
      cache = new Map();
      surfaceToPointCache.set(surface.id, cache);
    }
    return cache;
  }

  function getOrCreateReverseCache(surface: Surface): Map<string, Vector2> {
    let cache = surfaceToReverseCache.get(surface.id);
    if (!cache) {
      cache = new Map();
      surfaceToReverseCache.set(surface.id, cache);
    }
    return cache;
  }

  function reflect(point: Vector2, surface: Surface): Vector2 {
    const pointKey = createPointKey(point);
    const pointCache = getOrCreatePointCache(surface);
    const reverseCache = getOrCreateReverseCache(surface);

    // Check forward cache first
    const cached = pointCache.get(pointKey);
    if (cached !== undefined) {
      hits++;
      return cached;
    }

    // Check reverse cache - if this point was a reflection result, return the original
    const original = reverseCache.get(pointKey);
    if (original !== undefined) {
      hits++;
      return original;
    }

    // Cache miss - compute the reflection
    misses++;

    const { segment } = surface;
    const reflected = reflectPointThroughLine(point, segment.start, segment.end);

    // Store in forward cache
    pointCache.set(pointKey, reflected);
    size++;

    // Store in reverse cache for bidirectional lookup
    const reflectedKey = createPointKey(reflected);
    reverseCache.set(reflectedKey, point);
    size++;

    return reflected;
  }

  function get(point: Vector2, surface: Surface): Vector2 | undefined {
    const pointKey = createPointKey(point);
    const pointCache = surfaceToPointCache.get(surface.id);
    if (pointCache) {
      const cached = pointCache.get(pointKey);
      if (cached !== undefined) {
        return cached;
      }
    }

    // Also check reverse cache
    const reverseCache = surfaceToReverseCache.get(surface.id);
    if (reverseCache) {
      const original = reverseCache.get(pointKey);
      if (original !== undefined) {
        return original;
      }
    }

    return undefined;
  }

  function has(point: Vector2, surface: Surface): boolean {
    const pointKey = createPointKey(point);

    const pointCache = surfaceToPointCache.get(surface.id);
    if (pointCache?.has(pointKey)) {
      return true;
    }

    const reverseCache = surfaceToReverseCache.get(surface.id);
    if (reverseCache?.has(pointKey)) {
      return true;
    }

    return false;
  }

  function clear(): void {
    surfaceToPointCache = new Map();
    surfaceToReverseCache = new Map();
    hits = 0;
    misses = 0;
    size = 0;
  }

  function stats(): ReflectionCacheStats {
    return { hits, misses, size };
  }

  return {
    reflect,
    get,
    has,
    clear,
    stats,
  };
}
