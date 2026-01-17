/**
 * Tests for the unified hit detection system.
 *
 * TDD: These tests define the expected behavior of findNextHit that:
 * - Supports "physical" mode: only returns hits on actual segments
 * - Supports "planned" mode: returns hits on extended lines (for trajectory planning)
 * - Returns HitPoint with proper provenance (ray, surface, t, s parameters)
 * - Indicates whether the hit is on-segment or off-segment
 * - Supports excluding surfaces from consideration
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  findNextHit,
  type UnifiedHitResult,
} from "@/trajectory-v2/geometry/RayCasting";
import { createMockSurface } from "@test/helpers/surfaceHelpers";
import type { Surface } from "@/surfaces/Surface";
import type { Ray } from "@/trajectory-v2/geometry/types";

describe("findNextHit", () => {
  let surface: Surface;

  beforeEach(() => {
    // Short surface from (100, 50) to (100, 150) - only 100 units
    surface = createMockSurface("test", { x: 100, y: 50 }, { x: 100, y: 150 });
  });

  describe("physical mode (on-segment only)", () => {
    it("should return hit when ray intersects segment", () => {
      const ray: Ray = { source: { x: 50, y: 100 }, target: { x: 150, y: 100 } };

      const result = findNextHit(ray, [surface], { mode: "physical" });

      expect(result).not.toBeNull();
      expect(result!.onSegment).toBe(true);
      expect(result!.hitPoint.computeXY().x).toBeCloseTo(100);
      expect(result!.hitPoint.computeXY().y).toBeCloseTo(100);
    });

    it("should return null when ray misses segment (off-segment)", () => {
      // Ray at y=200, but surface only goes to y=150
      const ray: Ray = { source: { x: 50, y: 200 }, target: { x: 150, y: 200 } };

      const result = findNextHit(ray, [surface], { mode: "physical" });

      expect(result).toBeNull();
    });

    it("should return null when ray is parallel to surface", () => {
      // Ray parallel to vertical surface
      const ray: Ray = { source: { x: 50, y: 50 }, target: { x: 50, y: 150 } };

      const result = findNextHit(ray, [surface], { mode: "physical" });

      expect(result).toBeNull();
    });

    it("should return null when ray points away from surface", () => {
      // Ray pointing away from surface
      const ray: Ray = { source: { x: 50, y: 100 }, target: { x: 0, y: 100 } };

      const result = findNextHit(ray, [surface], { mode: "physical" });

      expect(result).toBeNull();
    });
  });

  describe("planned mode (extended line)", () => {
    it("should return hit even when off-segment", () => {
      // Ray at y=200, surface ends at y=150, but extended line hits
      const ray: Ray = { source: { x: 50, y: 200 }, target: { x: 150, y: 200 } };

      const result = findNextHit(ray, [surface], { mode: "planned" });

      expect(result).not.toBeNull();
      expect(result!.onSegment).toBe(false);
      expect(result!.hitPoint.computeXY().x).toBeCloseTo(100);
      expect(result!.hitPoint.computeXY().y).toBeCloseTo(200);
    });

    it("should mark onSegment=true when actually on segment", () => {
      const ray: Ray = { source: { x: 50, y: 100 }, target: { x: 150, y: 100 } };

      const result = findNextHit(ray, [surface], { mode: "planned" });

      expect(result!.onSegment).toBe(true);
    });

    it("should return hit at extended line beyond segment end", () => {
      // Ray at y=10, surface starts at y=50
      const ray: Ray = { source: { x: 50, y: 10 }, target: { x: 150, y: 10 } };

      const result = findNextHit(ray, [surface], { mode: "planned" });

      expect(result).not.toBeNull();
      expect(result!.onSegment).toBe(false);
      expect(result!.hitPoint.computeXY().y).toBeCloseTo(10);
    });
  });

  describe("HitPoint provenance", () => {
    it("should include ray in HitPoint", () => {
      const ray: Ray = { source: { x: 50, y: 100 }, target: { x: 150, y: 100 } };

      const result = findNextHit(ray, [surface], { mode: "physical" });

      expect(result!.hitPoint.ray).toBeDefined();
      expect(result!.hitPoint.ray.source).toEqual(ray.source);
      expect(result!.hitPoint.ray.target).toEqual(ray.target);
    });

    it("should include surface in HitPoint", () => {
      const ray: Ray = { source: { x: 50, y: 100 }, target: { x: 150, y: 100 } };

      const result = findNextHit(ray, [surface], { mode: "physical" });

      expect(result!.hitPoint.hitSurface.id).toBe("test");
    });

    it("should include t and s parameters in HitPoint", () => {
      const ray: Ray = { source: { x: 50, y: 100 }, target: { x: 150, y: 100 } };

      const result = findNextHit(ray, [surface], { mode: "physical" });

      // t is the parametric position along the ray
      expect(result!.hitPoint.t).toBeGreaterThan(0);
      // s is the parametric position along the surface segment
      expect(result!.hitPoint.s).toBeGreaterThanOrEqual(0);
      expect(result!.hitPoint.s).toBeLessThanOrEqual(1);
    });
  });

  describe("excludeSurfaces", () => {
    it("should skip excluded surfaces", () => {
      const ray: Ray = { source: { x: 50, y: 100 }, target: { x: 150, y: 100 } };

      const result = findNextHit(ray, [surface], {
        mode: "physical",
        excludeSurfaces: [surface],
      });

      expect(result).toBeNull();
    });

    it("should find next surface when first is excluded", () => {
      const surface2 = createMockSurface(
        "surface2",
        { x: 150, y: 50 },
        { x: 150, y: 150 }
      );
      const ray: Ray = { source: { x: 50, y: 100 }, target: { x: 200, y: 100 } };

      const result = findNextHit(ray, [surface, surface2], {
        mode: "physical",
        excludeSurfaces: [surface],
      });

      expect(result).not.toBeNull();
      expect(result!.hitPoint.hitSurface.id).toBe("surface2");
    });
  });

  describe("multiple surfaces", () => {
    it("should return closest hit", () => {
      const farSurface = createMockSurface(
        "far",
        { x: 200, y: 50 },
        { x: 200, y: 150 }
      );
      const ray: Ray = { source: { x: 50, y: 100 }, target: { x: 250, y: 100 } };

      const result = findNextHit(ray, [farSurface, surface], { mode: "physical" });

      expect(result!.hitPoint.hitSurface.id).toBe("test"); // Closer surface
    });
  });

  describe("canReflect", () => {
    it("should indicate if surface allows reflection", () => {
      const ray: Ray = { source: { x: 50, y: 100 }, target: { x: 150, y: 100 } };

      const result = findNextHit(ray, [surface], { mode: "physical" });

      expect(typeof result!.canReflect).toBe("boolean");
    });

    it("should return false for wall surfaces", () => {
      const wall = createMockSurface("wall", { x: 100, y: 50 }, { x: 100, y: 150 }, {
        canReflect: false,
      });
      const ray: Ray = { source: { x: 50, y: 100 }, target: { x: 150, y: 100 } };

      const result = findNextHit(ray, [wall], { mode: "physical" });

      expect(result!.canReflect).toBe(false);
    });
  });

  describe("default mode", () => {
    it("should default to physical mode", () => {
      // Ray at y=200, but surface only goes to y=150
      const ray: Ray = { source: { x: 50, y: 200 }, target: { x: 150, y: 200 } };

      // No mode specified - should use physical mode (return null for off-segment)
      const result = findNextHit(ray, [surface]);

      expect(result).toBeNull();
    });
  });
});
