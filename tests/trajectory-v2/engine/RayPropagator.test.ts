/**
 * Tests for the RayPropagator.
 *
 * TDD: These tests define the expected behavior of an incremental ray propagator that:
 * - Maintains origin and target images as rays are reflected through surfaces
 * - Uses a shared ReflectionCache for memoization
 * - Returns immutable propagators (reflectThrough creates new state)
 * - Supports forking to create independent propagators that share the cache
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createRayPropagator,
  type RayPropagator,
} from "@/trajectory-v2/engine/RayPropagator";
import { createMockSurface } from "@test/helpers/surfaceHelpers";
import type { Surface } from "@/surfaces/Surface";

describe("RayPropagator", () => {
  let surfaceA: Surface;
  let surfaceB: Surface;

  beforeEach(() => {
    // Vertical surface at x=100
    surfaceA = createMockSurface("A", { x: 100, y: 0 }, { x: 100, y: 200 });
    // Vertical surface at x=200
    surfaceB = createMockSurface("B", { x: 200, y: 0 }, { x: 200, y: 200 });
  });

  describe("initial state", () => {
    it("should have origin and target as provided", () => {
      const origin = { x: 50, y: 100 };
      const target = { x: 250, y: 100 };
      const propagator = createRayPropagator(origin, target);

      const state = propagator.getState();
      expect(state.originImage).toEqual(origin);
      expect(state.targetImage).toEqual(target);
      expect(state.depth).toBe(0);
      expect(state.lastSurface).toBeNull();
    });

    it("should have ray from origin to target", () => {
      const origin = { x: 50, y: 100 };
      const target = { x: 250, y: 100 };
      const propagator = createRayPropagator(origin, target);

      const ray = propagator.getRay();
      expect(ray.source).toEqual(origin);
      expect(ray.target).toEqual(target);
    });
  });

  describe("single reflection", () => {
    it("should reflect both origin and target through surface", () => {
      const origin = { x: 50, y: 100 };
      const target = { x: 250, y: 100 };
      const propagator = createRayPropagator(origin, target);

      const reflected = propagator.reflectThrough(surfaceA);
      const state = reflected.getState();

      // Origin at x=50 reflected through x=100 -> x=150
      expect(state.originImage.x).toBe(150);
      expect(state.originImage.y).toBe(100);
      // Target at x=250 reflected through x=100 -> x=-50
      expect(state.targetImage.x).toBe(-50);
      expect(state.targetImage.y).toBe(100);
      expect(state.depth).toBe(1);
      expect(state.lastSurface).toBe(surfaceA);
    });

    it("should not mutate original propagator", () => {
      const origin = { x: 50, y: 100 };
      const target = { x: 250, y: 100 };
      const propagator = createRayPropagator(origin, target);

      propagator.reflectThrough(surfaceA);

      // Original should be unchanged
      const state = propagator.getState();
      expect(state.originImage).toEqual(origin);
      expect(state.targetImage).toEqual(target);
      expect(state.depth).toBe(0);
    });

    it("should update the ray after reflection", () => {
      const origin = { x: 50, y: 100 };
      const target = { x: 250, y: 100 };
      const propagator = createRayPropagator(origin, target);

      const reflected = propagator.reflectThrough(surfaceA);
      const ray = reflected.getRay();

      expect(ray.source.x).toBe(150);
      expect(ray.target.x).toBe(-50);
    });
  });

  describe("sequential reflections", () => {
    it("should chain reflections correctly", () => {
      const origin = { x: 50, y: 100 };
      const target = { x: 350, y: 100 };
      const propagator = createRayPropagator(origin, target);

      const afterA = propagator.reflectThrough(surfaceA);
      const afterB = afterA.reflectThrough(surfaceB);

      const state = afterB.getState();
      expect(state.depth).toBe(2);

      // After A: origin=150, target=-150 (reflected through x=100)
      // After B: origin=250, target=550 (reflected through x=200)
      expect(state.originImage.x).toBe(250);
      expect(state.targetImage.x).toBe(550);
    });

    it("should track depth accurately", () => {
      const propagator = createRayPropagator({ x: 50, y: 100 }, { x: 350, y: 100 });

      expect(propagator.getState().depth).toBe(0);
      expect(propagator.reflectThrough(surfaceA).getState().depth).toBe(1);
      expect(
        propagator.reflectThrough(surfaceA).reflectThrough(surfaceB).getState().depth
      ).toBe(2);
    });

    it("should track lastSurface correctly", () => {
      const propagator = createRayPropagator({ x: 50, y: 100 }, { x: 350, y: 100 });

      const afterA = propagator.reflectThrough(surfaceA);
      expect(afterA.getState().lastSurface).toBe(surfaceA);

      const afterB = afterA.reflectThrough(surfaceB);
      expect(afterB.getState().lastSurface).toBe(surfaceB);
    });
  });

  describe("cache sharing", () => {
    it("should use cached reflections for same point-surface pair", () => {
      const origin = { x: 50, y: 100 };
      const target = { x: 250, y: 100 };
      const propagator = createRayPropagator(origin, target);

      // Reflect through A twice (back and forth)
      const afterA = propagator.reflectThrough(surfaceA);
      const backToOriginal = afterA.reflectThrough(surfaceA);

      const state = backToOriginal.getState();
      // When reflecting back through same surface, should return to original positions
      expect(state.originImage).toEqual(origin);
      expect(state.targetImage).toEqual(target);
      expect(state.depth).toBe(2);
    });

    it("should report cache statistics", () => {
      const propagator = createRayPropagator({ x: 50, y: 100 }, { x: 250, y: 100 });

      propagator.reflectThrough(surfaceA);
      const stats = propagator.getCacheStats();

      // At least 2 misses (origin and target reflections)
      expect(stats.misses).toBeGreaterThan(0);
    });

    it("should show cache hits on repeated reflections", () => {
      const origin = { x: 50, y: 100 };
      const propagator = createRayPropagator(origin, { x: 250, y: 100 });

      // First reflection - cache miss
      const after1 = propagator.reflectThrough(surfaceA);
      const statsAfter1 = propagator.getCacheStats();

      // Reflect back - should be cache hit for the origin point
      after1.reflectThrough(surfaceA);
      const statsAfter2 = propagator.getCacheStats();

      expect(statsAfter2.hits).toBeGreaterThan(statsAfter1.hits);
    });
  });

  describe("fork", () => {
    it("should create independent propagator from same origin/target", () => {
      const propagator = createRayPropagator({ x: 50, y: 100 }, { x: 250, y: 100 });
      const forked = propagator.fork();

      // Forked should have same initial state
      expect(forked.getState().originImage).toEqual(
        propagator.getState().originImage
      );
      expect(forked.getState().targetImage).toEqual(
        propagator.getState().targetImage
      );
    });

    it("should not affect original when forked is reflected", () => {
      const propagator = createRayPropagator({ x: 50, y: 100 }, { x: 250, y: 100 });
      const forked = propagator.fork();

      forked.reflectThrough(surfaceA);

      // Original unchanged (though technically both are immutable)
      expect(propagator.getState().depth).toBe(0);
    });

    it("should share reflection cache with fork", () => {
      const origin = { x: 50, y: 100 };
      const propagator = createRayPropagator(origin, { x: 250, y: 100 });

      // Compute reflection on original
      propagator.reflectThrough(surfaceA);
      const statsAfterOriginal = propagator.getCacheStats();

      // Fork and reflect same point
      const forked = propagator.fork();
      forked.reflectThrough(surfaceA);
      const statsAfterFork = forked.getCacheStats();

      // Should have cache hit (hits should increase, misses should stay same)
      expect(statsAfterFork.hits).toBeGreaterThan(statsAfterOriginal.hits);
      expect(statsAfterFork.misses).toBe(statsAfterOriginal.misses);
    });
  });

  describe("different surface orientations", () => {
    it("should handle horizontal surfaces", () => {
      const horizontalSurface = createMockSurface(
        "horizontal",
        { x: 0, y: 100 },
        { x: 200, y: 100 }
      );

      const propagator = createRayPropagator({ x: 50, y: 50 }, { x: 50, y: 150 });
      const reflected = propagator.reflectThrough(horizontalSurface);

      const state = reflected.getState();
      // Origin at y=50 reflected through y=100 -> y=150
      expect(state.originImage.x).toBe(50);
      expect(state.originImage.y).toBe(150);
      // Target at y=150 reflected through y=100 -> y=50
      expect(state.targetImage.x).toBe(50);
      expect(state.targetImage.y).toBe(50);
    });

    it("should handle diagonal surfaces", () => {
      const diagonalSurface = createMockSurface(
        "diagonal",
        { x: 0, y: 0 },
        { x: 100, y: 100 }
      );

      const propagator = createRayPropagator({ x: 100, y: 0 }, { x: 0, y: 100 });
      const reflected = propagator.reflectThrough(diagonalSurface);

      const state = reflected.getState();
      // Origin at (100, 0) reflected through diagonal -> (0, 100)
      expect(state.originImage.x).toBeCloseTo(0);
      expect(state.originImage.y).toBeCloseTo(100);
      // Target at (0, 100) reflected through diagonal -> (100, 0)
      expect(state.targetImage.x).toBeCloseTo(100);
      expect(state.targetImage.y).toBeCloseTo(0);
    });
  });
});
