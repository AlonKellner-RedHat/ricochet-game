/**
 * Tests for RayCore - Core Ray Operations
 *
 * TDD tests for the unified ray-based geometry system.
 * All operations use exact arithmetic (no angles, no normalization).
 */

import { describe, it, expect } from "vitest";
import {
  type Ray,
  type RayHit,
  type Segment,
  intersectRaySegment,
  reflectRay,
  isPointOnRay,
  rayContainsPoint,
  createRay,
} from "@/trajectory-v2/geometry/RayCore";

describe("RayCore", () => {
  describe("Ray type", () => {
    it("creates a ray from source to target", () => {
      const ray = createRay({ x: 0, y: 0 }, { x: 100, y: 0 });
      expect(ray.source).toEqual({ x: 0, y: 0 });
      expect(ray.target).toEqual({ x: 100, y: 0 });
    });
  });

  describe("intersectRaySegment", () => {
    it("finds intersection of horizontal ray with vertical segment", () => {
      const ray: Ray = { source: { x: 0, y: 50 }, target: { x: 100, y: 50 } };
      const segment: Segment = { start: { x: 50, y: 0 }, end: { x: 50, y: 100 } };

      const hit = intersectRaySegment(ray, segment);

      expect(hit).not.toBeNull();
      expect(hit!.point.x).toBeCloseTo(50, 10);
      expect(hit!.point.y).toBeCloseTo(50, 10);
      expect(hit!.t).toBeCloseTo(0.5, 10); // Halfway along ray
      expect(hit!.s).toBeCloseTo(0.5, 10); // Halfway along segment
      expect(hit!.onSegment).toBe(true);
    });

    it("returns null for parallel ray and segment", () => {
      const ray: Ray = { source: { x: 0, y: 50 }, target: { x: 100, y: 50 } };
      const segment: Segment = { start: { x: 0, y: 100 }, end: { x: 100, y: 100 } };

      const hit = intersectRaySegment(ray, segment);
      expect(hit).toBeNull();
    });

    it("returns null when intersection is behind ray origin", () => {
      const ray: Ray = { source: { x: 100, y: 50 }, target: { x: 200, y: 50 } };
      const segment: Segment = { start: { x: 50, y: 0 }, end: { x: 50, y: 100 } };

      const hit = intersectRaySegment(ray, segment);
      expect(hit).toBeNull(); // Intersection at x=50 is behind the ray
    });

    it("marks intersection as off-segment when s < 0", () => {
      const ray: Ray = { source: { x: 0, y: 50 }, target: { x: 100, y: 50 } };
      const segment: Segment = { start: { x: 50, y: 100 }, end: { x: 50, y: 200 } };

      const hit = intersectRaySegment(ray, segment);

      expect(hit).not.toBeNull();
      expect(hit!.onSegment).toBe(false);
      expect(hit!.s).toBeLessThan(0);
    });

    it("marks intersection as off-segment when s > 1", () => {
      const ray: Ray = { source: { x: 0, y: 250 }, target: { x: 100, y: 250 } };
      const segment: Segment = { start: { x: 50, y: 100 }, end: { x: 50, y: 200 } };

      const hit = intersectRaySegment(ray, segment);

      expect(hit).not.toBeNull();
      expect(hit!.onSegment).toBe(false);
      expect(hit!.s).toBeGreaterThan(1);
    });

    it("handles diagonal ray and segment", () => {
      const ray: Ray = { source: { x: 0, y: 0 }, target: { x: 100, y: 100 } };
      const segment: Segment = { start: { x: 50, y: 0 }, end: { x: 50, y: 100 } };

      const hit = intersectRaySegment(ray, segment);

      expect(hit).not.toBeNull();
      expect(hit!.point.x).toBeCloseTo(50, 10);
      expect(hit!.point.y).toBeCloseTo(50, 10);
      expect(hit!.onSegment).toBe(true);
    });

    it("finds intersection at segment endpoint", () => {
      const ray: Ray = { source: { x: 0, y: 0 }, target: { x: 100, y: 0 } };
      const segment: Segment = { start: { x: 50, y: 0 }, end: { x: 50, y: 100 } };

      const hit = intersectRaySegment(ray, segment);

      expect(hit).not.toBeNull();
      expect(hit!.point.x).toBeCloseTo(50, 10);
      expect(hit!.point.y).toBeCloseTo(0, 10);
      expect(hit!.s).toBeCloseTo(0, 10); // At segment start
      expect(hit!.onSegment).toBe(true);
    });
  });

  describe("reflectRay", () => {
    it("reflects horizontal ray off vertical surface", () => {
      const ray: Ray = { source: { x: 0, y: 50 }, target: { x: 100, y: 50 } };
      const surface: Segment = { start: { x: 50, y: 0 }, end: { x: 50, y: 100 } };

      const reflected = reflectRay(ray, surface);

      // Reflected ray should go leftward from the intersection point
      expect(reflected.source.x).toBeCloseTo(50, 10);
      expect(reflected.source.y).toBeCloseTo(50, 10);
      // Direction should be reversed in x
      const dx = reflected.target.x - reflected.source.x;
      const dy = reflected.target.y - reflected.source.y;
      expect(dx).toBeLessThan(0); // Now going left
      expect(Math.abs(dy)).toBeLessThan(0.001); // Still horizontal
    });

    it("reflects vertical ray off horizontal surface", () => {
      const ray: Ray = { source: { x: 50, y: 0 }, target: { x: 50, y: 100 } };
      const surface: Segment = { start: { x: 0, y: 50 }, end: { x: 100, y: 50 } };

      const reflected = reflectRay(ray, surface);

      // Reflected ray should go upward from the intersection point
      expect(reflected.source.x).toBeCloseTo(50, 10);
      expect(reflected.source.y).toBeCloseTo(50, 10);
      // Direction should be reversed in y
      const dx = reflected.target.x - reflected.source.x;
      const dy = reflected.target.y - reflected.source.y;
      expect(Math.abs(dx)).toBeLessThan(0.001); // Still vertical
      expect(dy).toBeLessThan(0); // Now going up
    });

    it("reflects diagonal ray off 45-degree surface", () => {
      // Ray going right and down
      const ray: Ray = { source: { x: 0, y: 0 }, target: { x: 100, y: 100 } };
      // 45-degree surface (going from bottom-left to top-right)
      const surface: Segment = { start: { x: 0, y: 100 }, end: { x: 100, y: 0 } };

      const reflected = reflectRay(ray, surface);

      // The intersection is at (50, 50)
      expect(reflected.source.x).toBeCloseTo(50, 5);
      expect(reflected.source.y).toBeCloseTo(50, 5);
    });

    it("preserves exactness - double reflection returns to original direction", () => {
      const ray: Ray = { source: { x: 0, y: 50 }, target: { x: 100, y: 70 } };
      const surface: Segment = { start: { x: 50, y: 0 }, end: { x: 50, y: 100 } };

      const reflected1 = reflectRay(ray, surface);
      // Reflect again off a parallel surface
      const surface2: Segment = { start: { x: 25, y: 0 }, end: { x: 25, y: 100 } };
      const reflected2 = reflectRay(reflected1, surface2);

      // Direction should be back to original (rightward with same slope)
      const origDx = ray.target.x - ray.source.x;
      const origDy = ray.target.y - ray.source.y;
      const finalDx = reflected2.target.x - reflected2.source.x;
      const finalDy = reflected2.target.y - reflected2.source.y;

      // Slopes should match (dy/dx ratio)
      const origSlope = origDy / origDx;
      const finalSlope = finalDy / finalDx;
      expect(finalSlope).toBeCloseTo(origSlope, 10);
      expect(Math.sign(finalDx)).toBe(Math.sign(origDx)); // Same direction
    });
  });

  describe("isPointOnRay", () => {
    it("returns true for point on ray", () => {
      const ray: Ray = { source: { x: 0, y: 0 }, target: { x: 100, y: 0 } };
      expect(isPointOnRay(ray, { x: 50, y: 0 })).toBe(true);
      expect(isPointOnRay(ray, { x: 200, y: 0 })).toBe(true); // Beyond target
    });

    it("returns false for point behind ray", () => {
      const ray: Ray = { source: { x: 100, y: 0 }, target: { x: 200, y: 0 } };
      expect(isPointOnRay(ray, { x: 50, y: 0 })).toBe(false);
    });

    it("returns false for point off the ray line", () => {
      const ray: Ray = { source: { x: 0, y: 0 }, target: { x: 100, y: 0 } };
      expect(isPointOnRay(ray, { x: 50, y: 10 })).toBe(false);
    });

    it("handles diagonal rays", () => {
      const ray: Ray = { source: { x: 0, y: 0 }, target: { x: 100, y: 100 } };
      expect(isPointOnRay(ray, { x: 50, y: 50 })).toBe(true);
      expect(isPointOnRay(ray, { x: 50, y: 51 })).toBe(false);
    });

    it("uses tolerance for near-misses", () => {
      const ray: Ray = { source: { x: 0, y: 0 }, target: { x: 100, y: 0 } };
      expect(isPointOnRay(ray, { x: 50, y: 0.001 }, 0.01)).toBe(true);
      expect(isPointOnRay(ray, { x: 50, y: 0.1 }, 0.01)).toBe(false);
    });
  });

  describe("rayContainsPoint", () => {
    it("returns t value for point on ray", () => {
      const ray: Ray = { source: { x: 0, y: 0 }, target: { x: 100, y: 0 } };
      const result = rayContainsPoint(ray, { x: 50, y: 0 });

      expect(result).not.toBeNull();
      expect(result!.t).toBeCloseTo(0.5, 10);
    });

    it("returns t > 1 for point beyond target", () => {
      const ray: Ray = { source: { x: 0, y: 0 }, target: { x: 100, y: 0 } };
      const result = rayContainsPoint(ray, { x: 200, y: 0 });

      expect(result).not.toBeNull();
      expect(result!.t).toBeCloseTo(2, 10);
    });

    it("returns null for point behind ray", () => {
      const ray: Ray = { source: { x: 100, y: 0 }, target: { x: 200, y: 0 } };
      const result = rayContainsPoint(ray, { x: 50, y: 0 });

      expect(result).toBeNull();
    });

    it("returns null for point off the ray line", () => {
      const ray: Ray = { source: { x: 0, y: 0 }, target: { x: 100, y: 0 } };
      const result = rayContainsPoint(ray, { x: 50, y: 10 });

      expect(result).toBeNull();
    });

    it("returns t = 0 for point at source", () => {
      const ray: Ray = { source: { x: 0, y: 0 }, target: { x: 100, y: 0 } };
      const result = rayContainsPoint(ray, { x: 0, y: 0 });

      expect(result).not.toBeNull();
      expect(result!.t).toBeCloseTo(0, 10);
    });

    it("returns t = 1 for point at target", () => {
      const ray: Ray = { source: { x: 0, y: 0 }, target: { x: 100, y: 0 } };
      const result = rayContainsPoint(ray, { x: 100, y: 0 });

      expect(result).not.toBeNull();
      expect(result!.t).toBeCloseTo(1, 10);
    });
  });
});

