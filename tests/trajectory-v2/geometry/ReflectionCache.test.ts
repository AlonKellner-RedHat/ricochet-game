/**
 * Tests for the ReflectionCache.
 *
 * TDD: These tests define the expected behavior of a reflection cache that:
 * - Computes point reflections through surfaces
 * - Caches results to avoid recalculation
 * - Stores bidirectional associations (reflecting the reflection returns the original)
 * - Guarantees reflect(reflect(P, S), S) === P by identity (same object reference)
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createReflectionCache,
  type ReflectionCache,
} from "@/trajectory-v2/geometry/ReflectionCache";
import { createMockSurface } from "@test/helpers/surfaceHelpers";
import type { Surface } from "@/surfaces/Surface";

describe("ReflectionCache", () => {
  let cache: ReflectionCache;
  let surfaceA: Surface;

  beforeEach(() => {
    cache = createReflectionCache();
    // Vertical surface at x=100
    surfaceA = createMockSurface("A", { x: 100, y: 0 }, { x: 100, y: 200 });
  });

  describe("basic reflection", () => {
    it("should compute reflection when not cached", () => {
      const point = { x: 50, y: 100 };
      const reflected = cache.reflect(point, surfaceA);

      // Point at x=50 reflected through x=100 line should be at x=150
      expect(reflected.x).toBe(150);
      expect(reflected.y).toBe(100);
    });

    it("should return cached result on second call", () => {
      const point = { x: 50, y: 100 };
      const first = cache.reflect(point, surfaceA);
      const second = cache.reflect(point, surfaceA);

      // Same object reference (not just equal values)
      expect(second).toBe(first);
    });

    it("should handle points already on the surface line", () => {
      const point = { x: 100, y: 50 };
      const reflected = cache.reflect(point, surfaceA);

      // Point on the line should reflect to itself
      expect(reflected.x).toBe(100);
      expect(reflected.y).toBe(50);
    });

    it("should handle points on the other side of the surface", () => {
      const point = { x: 150, y: 100 };
      const reflected = cache.reflect(point, surfaceA);

      // Point at x=150 reflected through x=100 line should be at x=50
      expect(reflected.x).toBe(50);
      expect(reflected.y).toBe(100);
    });
  });

  describe("bidirectional association", () => {
    it("should store bidirectional mapping", () => {
      const point = { x: 50, y: 100 };
      const reflected = cache.reflect(point, surfaceA);

      // Reflecting the reflected point should return original
      const backToOriginal = cache.reflect(reflected, surfaceA);

      expect(backToOriginal.x).toBe(point.x);
      expect(backToOriginal.y).toBe(point.y);
    });

    it("should return original by reference, not recalculation", () => {
      const point = { x: 50, y: 100 };
      const reflected = cache.reflect(point, surfaceA);

      // Reflect the reflected point back
      const backToOriginal = cache.reflect(reflected, surfaceA);

      // Should be a cache hit - the original point by reference
      expect(backToOriginal).toBe(point);
    });

    it("should guarantee reflect(reflect(P, S), S) === P by identity", () => {
      const point = { x: 50, y: 100 };
      const reflected = cache.reflect(point, surfaceA);
      const doubleReflected = cache.reflect(reflected, surfaceA);

      // Must be the SAME object, not just equal
      expect(doubleReflected).toBe(point);
    });
  });

  describe("different surfaces", () => {
    it("should not interfere between different surfaces", () => {
      const surfaceB = createMockSurface("B", { x: 200, y: 0 }, { x: 200, y: 200 });
      const point = { x: 50, y: 100 };

      const reflectedA = cache.reflect(point, surfaceA);
      const reflectedB = cache.reflect(point, surfaceB);

      expect(reflectedA.x).toBe(150); // Through x=100
      expect(reflectedB.x).toBe(350); // Through x=200
    });

    it("should cache independently per surface", () => {
      const surfaceB = createMockSurface("B", { x: 200, y: 0 }, { x: 200, y: 200 });
      const point = { x: 50, y: 100 };

      cache.reflect(point, surfaceA);
      cache.reflect(point, surfaceB);

      // Each should be cached separately
      expect(cache.has(point, surfaceA)).toBe(true);
      expect(cache.has(point, surfaceB)).toBe(true);
    });
  });

  describe("cache operations", () => {
    it("should report has() correctly", () => {
      const point = { x: 50, y: 100 };

      expect(cache.has(point, surfaceA)).toBe(false);
      cache.reflect(point, surfaceA);
      expect(cache.has(point, surfaceA)).toBe(true);
    });

    it("should return undefined from get() for uncached points", () => {
      const point = { x: 50, y: 100 };

      expect(cache.get(point, surfaceA)).toBeUndefined();
    });

    it("should return cached value from get()", () => {
      const point = { x: 50, y: 100 };
      const reflected = cache.reflect(point, surfaceA);

      expect(cache.get(point, surfaceA)).toBe(reflected);
    });

    it("should track hits and misses", () => {
      const point = { x: 50, y: 100 };

      cache.reflect(point, surfaceA); // miss
      cache.reflect(point, surfaceA); // hit
      cache.reflect(point, surfaceA); // hit

      const stats = cache.stats();
      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(2);
    });

    it("should clear all entries", () => {
      const point = { x: 50, y: 100 };
      cache.reflect(point, surfaceA);

      cache.clear();

      expect(cache.has(point, surfaceA)).toBe(false);
      expect(cache.stats().size).toBe(0);
    });

    it("should report size correctly", () => {
      const point1 = { x: 50, y: 100 };
      const point2 = { x: 60, y: 100 };

      expect(cache.stats().size).toBe(0);

      cache.reflect(point1, surfaceA);
      // Each reflection creates a bidirectional pair
      expect(cache.stats().size).toBe(2);

      cache.reflect(point2, surfaceA);
      expect(cache.stats().size).toBe(4);
    });
  });

  describe("non-axis-aligned surfaces", () => {
    it("should handle diagonal surfaces", () => {
      // 45-degree surface from (0,0) to (100,100)
      const diagonalSurface = createMockSurface(
        "diagonal",
        { x: 0, y: 0 },
        { x: 100, y: 100 }
      );

      // Point at (100, 0) should reflect to (0, 100) through the diagonal
      const point = { x: 100, y: 0 };
      const reflected = cache.reflect(point, diagonalSurface);

      expect(reflected.x).toBeCloseTo(0);
      expect(reflected.y).toBeCloseTo(100);
    });

    it("should maintain bidirectionality for diagonal surfaces", () => {
      const diagonalSurface = createMockSurface(
        "diagonal",
        { x: 0, y: 0 },
        { x: 100, y: 100 }
      );

      const point = { x: 100, y: 0 };
      const reflected = cache.reflect(point, diagonalSurface);
      const backToOriginal = cache.reflect(reflected, diagonalSurface);

      // Should return the original by identity
      expect(backToOriginal).toBe(point);
    });
  });
});
