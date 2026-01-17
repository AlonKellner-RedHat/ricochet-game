/**
 * Tests for ReflectionCache integration with visibility system.
 *
 * Phase 1: Origin reflections use ReflectionCache for memoization.
 * Phase 2+: Target reflections also use ReflectionCache.
 */

import { describe, it, expect } from "vitest";
import { createMockBidirectionalSurface } from "@test/helpers/surfaceHelpers";
import { createReflectionCache, type ReflectionCache } from "@/trajectory-v2/geometry/ReflectionCache";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

describe("ReflectionCache Integration with Visibility", () => {
  // Helper to create a horizontal surface
  function createHorizontalSurface(id: string, y: number, xStart: number, xEnd: number): Surface {
    return createMockBidirectionalSurface(id, { x: xStart, y }, { x: xEnd, y });
  }

  describe("Phase 1: Origin reflection memoization", () => {
    it("should cache origin reflection through a surface", () => {
      const cache = createReflectionCache();
      const origin: Vector2 = { x: 100, y: 100 };
      const surface = createHorizontalSurface("s1", 150, 0, 200);

      // First reflection - should be a cache miss
      const reflected1 = cache.reflect(origin, surface);
      const stats1 = cache.stats();
      expect(stats1.misses).toBe(1);
      expect(stats1.hits).toBe(0);

      // Second reflection of same point - should be a cache hit
      const reflected2 = cache.reflect(origin, surface);
      const stats2 = cache.stats();
      expect(stats2.misses).toBe(1);
      expect(stats2.hits).toBe(1);

      // Both should return the same reflected point
      expect(reflected2).toEqual(reflected1);
    });

    it("should return original point when reflecting back (bidirectional)", () => {
      const cache = createReflectionCache();
      const origin: Vector2 = { x: 100, y: 100 };
      const surface = createHorizontalSurface("s1", 150, 0, 200);

      // Reflect origin through surface
      const reflected = cache.reflect(origin, surface);

      // Reflect the reflected point back through the same surface
      const backToOriginal = cache.reflect(reflected, surface);

      // Should be the original point by identity
      expect(backToOriginal).toBe(origin);
    });

    it("should handle multiple surfaces independently", () => {
      const cache = createReflectionCache();
      const origin: Vector2 = { x: 100, y: 100 };
      const surface1 = createHorizontalSurface("s1", 150, 0, 200);
      const surface2 = createHorizontalSurface("s2", 200, 0, 200);

      // Reflect through surface1
      const reflected1 = cache.reflect(origin, surface1);

      // Reflect through surface2
      const reflected2 = cache.reflect(origin, surface2);

      // Should be different reflections
      expect(reflected1).not.toEqual(reflected2);

      // Both should be cached
      const stats = cache.stats();
      expect(stats.misses).toBe(2);
    });

    it("should maintain cache across multiple origins", () => {
      const cache = createReflectionCache();
      const origin1: Vector2 = { x: 100, y: 100 };
      const origin2: Vector2 = { x: 200, y: 100 };
      const surface = createHorizontalSurface("s1", 150, 0, 300);

      // Reflect both origins
      cache.reflect(origin1, surface);
      cache.reflect(origin2, surface);

      // Both should be cached (2 misses)
      const stats1 = cache.stats();
      expect(stats1.misses).toBe(2);

      // Reflecting again should hit cache
      cache.reflect(origin1, surface);
      cache.reflect(origin2, surface);

      const stats2 = cache.stats();
      expect(stats2.hits).toBe(2);
    });

    it("should correctly reflect origin for visibility polygon calculation", () => {
      const cache = createReflectionCache();
      const player: Vector2 = { x: 100, y: 100 };
      const surface = createHorizontalSurface("s1", 150, 0, 200);

      // Reflect player through surface (simulating visibility Stage 2)
      const reflectedPlayer = cache.reflect(player, surface);

      // Player at y=100, surface at y=150, so reflected player should be at y=200
      expect(reflectedPlayer.x).toBe(player.x);
      expect(reflectedPlayer.y).toBe(200);
    });
  });

  describe("Phase 2: Target reflection infrastructure", () => {
    it("should cache endpoint reflection through a surface", () => {
      const cache = createReflectionCache();
      const endpoint: Vector2 = { x: 50, y: 50 };
      const surface = createHorizontalSurface("s1", 150, 0, 200);

      // Reflect endpoint
      const reflectedEndpoint = cache.reflect(endpoint, surface);

      // Should be cached
      expect(cache.has(endpoint, surface)).toBe(true);

      // Endpoint at y=50, surface at y=150, so reflected should be at y=250
      expect(reflectedEndpoint.y).toBe(250);
    });

    it("should reflect multiple targets efficiently", () => {
      const cache = createReflectionCache();
      const surface = createHorizontalSurface("s1", 100, 0, 200);

      // Simulate reflecting many visibility targets
      const targets: Vector2[] = [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 75 },
        { x: 150, y: 25 },
        { x: 200, y: 50 },
      ];

      // First pass - all misses
      for (const target of targets) {
        cache.reflect(target, surface);
      }
      expect(cache.stats().misses).toBe(5);

      // Second pass - all hits
      for (const target of targets) {
        cache.reflect(target, surface);
      }
      expect(cache.stats().hits).toBe(5);
    });

    it("should share cache between origin and target reflections", () => {
      const cache = createReflectionCache();
      const surface = createHorizontalSurface("s1", 100, 0, 200);

      // This point could be either origin or target
      const point: Vector2 = { x: 100, y: 50 };

      // Use as origin reflection
      const reflected1 = cache.reflect(point, surface);

      // Use same point as target reflection later
      const reflected2 = cache.reflect(point, surface);

      // Should be cache hit
      expect(reflected2).toBe(reflected1);
      expect(cache.stats().hits).toBe(1);
    });
  });

  describe("Visibility polygon correctness", () => {
    it("reflected origin should produce same ray directions to reflected targets", () => {
      const cache = createReflectionCache();
      const origin: Vector2 = { x: 100, y: 100 };
      const target: Vector2 = { x: 200, y: 50 };
      const surface = createHorizontalSurface("s1", 150, 0, 300);

      // Reflect both through surface
      const reflectedOrigin = cache.reflect(origin, surface);
      const reflectedTarget = cache.reflect(target, surface);

      // Original direction
      const origDx = target.x - origin.x;
      const origDy = target.y - origin.y;
      const origLen = Math.sqrt(origDx * origDx + origDy * origDy);

      // Reflected direction
      const refDx = reflectedTarget.x - reflectedOrigin.x;
      const refDy = reflectedTarget.y - reflectedOrigin.y;
      const refLen = Math.sqrt(refDx * refDx + refDy * refDy);

      // Directions should have same magnitude (distance preserved)
      expect(refLen).toBeCloseTo(origLen, 10);

      // X component should be same (horizontal surface preserves X)
      expect(refDx).toBeCloseTo(origDx, 10);

      // Y component should be negated (reflection flips Y direction relative to surface)
      expect(refDy).toBeCloseTo(-origDy, 10);
    });
  });
});
