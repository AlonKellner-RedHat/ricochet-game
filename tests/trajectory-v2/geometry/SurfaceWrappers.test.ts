/**
 * Tests for Surface convenience wrappers in RayCore.
 *
 * These wrappers provide a convenient API for reflecting points and rays
 * through Surface objects (instead of raw segments).
 */

import { describe, it, expect } from "vitest";
import {
  type Ray,
  reflectRayThroughSurface,
  reflectPointThroughSurface,
} from "@/trajectory-v2/geometry/RayCore";
import { createMockSurface } from "@test/helpers/surfaceHelpers";

describe("Surface convenience wrappers", () => {
  describe("reflectRayThroughSurface", () => {
    it("should reflect ray through vertical surface", () => {
      const surface = createMockSurface("test", { x: 100, y: 0 }, { x: 100, y: 200 });
      const ray: Ray = { source: { x: 50, y: 100 }, target: { x: 80, y: 100 } };

      const reflected = reflectRayThroughSurface(ray, surface);

      // Source at x=50 reflected through x=100 -> x=150
      expect(reflected.source.x).toBe(150);
      expect(reflected.source.y).toBe(100);
      // Target at x=80 reflected through x=100 -> x=120
      expect(reflected.target.x).toBe(120);
      expect(reflected.target.y).toBe(100);
    });

    it("should reflect ray through horizontal surface", () => {
      const surface = createMockSurface("test", { x: 0, y: 100 }, { x: 200, y: 100 });
      const ray: Ray = { source: { x: 100, y: 50 }, target: { x: 100, y: 80 } };

      const reflected = reflectRayThroughSurface(ray, surface);

      // Source at y=50 reflected through y=100 -> y=150
      expect(reflected.source.x).toBe(100);
      expect(reflected.source.y).toBe(150);
      // Target at y=80 reflected through y=100 -> y=120
      expect(reflected.target.x).toBe(100);
      expect(reflected.target.y).toBe(120);
    });

    it("should reflect ray through diagonal surface", () => {
      const surface = createMockSurface("test", { x: 0, y: 0 }, { x: 100, y: 100 });
      const ray: Ray = { source: { x: 100, y: 0 }, target: { x: 80, y: 0 } };

      const reflected = reflectRayThroughSurface(ray, surface);

      // Point at (100, 0) reflected through diagonal -> (0, 100)
      expect(reflected.source.x).toBeCloseTo(0);
      expect(reflected.source.y).toBeCloseTo(100);
    });

    it("should preserve startRatio", () => {
      const surface = createMockSurface("test", { x: 100, y: 0 }, { x: 100, y: 200 });
      const ray: Ray = { source: { x: 50, y: 100 }, target: { x: 80, y: 100 }, startRatio: 0.5 };

      const reflected = reflectRayThroughSurface(ray, surface);

      expect(reflected.startRatio).toBe(0.5);
    });
  });

  describe("reflectPointThroughSurface", () => {
    it("should reflect point through vertical surface", () => {
      const surface = createMockSurface("test", { x: 100, y: 0 }, { x: 100, y: 200 });
      const point = { x: 50, y: 100 };

      const reflected = reflectPointThroughSurface(point, surface);

      expect(reflected.x).toBe(150);
      expect(reflected.y).toBe(100);
    });

    it("should reflect point through horizontal surface", () => {
      const surface = createMockSurface("test", { x: 0, y: 100 }, { x: 200, y: 100 });
      const point = { x: 100, y: 50 };

      const reflected = reflectPointThroughSurface(point, surface);

      expect(reflected.x).toBe(100);
      expect(reflected.y).toBe(150);
    });

    it("should return same position for point on surface line", () => {
      const surface = createMockSurface("test", { x: 100, y: 0 }, { x: 100, y: 200 });
      const point = { x: 100, y: 50 };

      const reflected = reflectPointThroughSurface(point, surface);

      expect(reflected.x).toBe(100);
      expect(reflected.y).toBe(50);
    });

    it("should reflect point through diagonal surface", () => {
      const surface = createMockSurface("test", { x: 0, y: 0 }, { x: 100, y: 100 });
      const point = { x: 100, y: 0 };

      const reflected = reflectPointThroughSurface(point, surface);

      expect(reflected.x).toBeCloseTo(0);
      expect(reflected.y).toBeCloseTo(100);
    });
  });
});
