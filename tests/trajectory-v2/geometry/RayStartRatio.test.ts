/**
 * TDD Tests for Ray startRatio functionality
 *
 * The startRatio property defines where a ray actually starts:
 * - startRatio = 0: ray starts at source (default behavior)
 * - startRatio = 0.5: ray starts at midpoint between source and target
 * - startRatio = 1: ray starts at target
 *
 * Key use case: When origin is off-screen (reflected player image),
 * set startRatio so the ray starts ON the reflecting surface.
 */

import { describe, it, expect } from "vitest";
import {
  createRay,
  createRayWithStart,
  effectiveStart,
  intersectRaySegment,
  reflectRayThroughLine,
  type Ray,
  type Segment,
} from "@/trajectory-v2/geometry/RayCore";

describe("Ray with startRatio", () => {
  describe("effectiveStart", () => {
    it("startRatio=0 returns source (default behavior)", () => {
      const ray = createRay({ x: 0, y: 0 }, { x: 100, y: 100 });
      const start = effectiveStart(ray);
      expect(start.x).toBe(0);
      expect(start.y).toBe(0);
    });

    it("startRatio=0.5 returns midpoint", () => {
      const ray = createRayWithStart({ x: 0, y: 0 }, { x: 100, y: 100 }, 0.5);
      const start = effectiveStart(ray);
      expect(start.x).toBe(50);
      expect(start.y).toBe(50);
    });

    it("startRatio=1 returns target", () => {
      const ray = createRayWithStart({ x: 0, y: 0 }, { x: 100, y: 100 }, 1);
      const start = effectiveStart(ray);
      expect(start.x).toBe(100);
      expect(start.y).toBe(100);
    });

    it("effectiveStart is computed exactly (no sqrt)", () => {
      // Use values that would be inexact with sqrt but exact with multiplication
      const ray = createRayWithStart({ x: 0, y: 0 }, { x: 300, y: 400 }, 0.25);
      const start = effectiveStart(ray);
      // 0.25 * 300 = 75, 0.25 * 400 = 100 (exact)
      expect(start.x).toBe(75);
      expect(start.y).toBe(100);
    });

    it("handles negative startRatio (behind source)", () => {
      const ray = createRayWithStart({ x: 100, y: 100 }, { x: 200, y: 200 }, -0.5);
      const start = effectiveStart(ray);
      expect(start.x).toBe(50);
      expect(start.y).toBe(50);
    });

    it("handles startRatio > 1 (beyond target)", () => {
      const ray = createRayWithStart({ x: 0, y: 0 }, { x: 100, y: 100 }, 1.5);
      const start = effectiveStart(ray);
      expect(start.x).toBe(150);
      expect(start.y).toBe(150);
    });
  });

  describe("createRayWithStart", () => {
    it("creates ray with specified startRatio", () => {
      const ray = createRayWithStart({ x: 10, y: 20 }, { x: 30, y: 40 }, 0.3);
      expect(ray.source).toEqual({ x: 10, y: 20 });
      expect(ray.target).toEqual({ x: 30, y: 40 });
      expect(ray.startRatio).toBe(0.3);
    });
  });

  describe("intersectRaySegment with startRatio", () => {
    const segment: Segment = {
      start: { x: 50, y: 0 },
      end: { x: 50, y: 100 },
    };

    it("startRatio=0 behaves like current implementation", () => {
      const ray = createRay({ x: 0, y: 50 }, { x: 100, y: 50 });
      const hit = intersectRaySegment(ray, segment);
      expect(hit).not.toBeNull();
      expect(hit!.point.x).toBe(50);
      expect(hit!.point.y).toBe(50);
      expect(hit!.t).toBe(0.5);
    });

    it("ignores hits before startRatio", () => {
      // Ray from (0,50) to (100,50), segment at x=50 (t=0.5)
      // With startRatio=0.6, the ray starts AFTER the segment
      const ray = createRayWithStart({ x: 0, y: 50 }, { x: 100, y: 50 }, 0.6);
      const hit = intersectRaySegment(ray, segment);
      expect(hit).toBeNull(); // Hit at t=0.5 is before startRatio=0.6
    });

    it("finds hits after startRatio", () => {
      // Ray from (0,50) to (100,50), segment at x=50 (t=0.5)
      // With startRatio=0.3, the ray starts BEFORE the segment
      const ray = createRayWithStart({ x: 0, y: 50 }, { x: 100, y: 50 }, 0.3);
      const hit = intersectRaySegment(ray, segment);
      expect(hit).not.toBeNull();
      expect(hit!.point.x).toBe(50);
      expect(hit!.t).toBe(0.5);
    });

    it("exact boundary: hit at exactly startRatio is included", () => {
      // Ray from (0,50) to (100,50), segment at x=50 (t=0.5)
      const ray = createRayWithStart({ x: 0, y: 50 }, { x: 100, y: 50 }, 0.5);
      const hit = intersectRaySegment(ray, segment);
      // Hit at t=0.5 equals startRatio=0.5, should be included
      expect(hit).not.toBeNull();
    });
  });

  describe("reflectRayThroughLine with startRatio", () => {
    const surface: Segment = {
      start: { x: 50, y: 0 },
      end: { x: 50, y: 100 },
    };

    it("preserves startRatio through reflection", () => {
      const ray = createRayWithStart({ x: 0, y: 50 }, { x: 100, y: 50 }, 0.4);
      const reflected = reflectRayThroughLine(ray, surface);
      expect(reflected.startRatio).toBe(0.4);
    });

    it("reflects source and target correctly", () => {
      // Ray from (0,50) to (100,50), reflecting off vertical line at x=50
      const ray = createRayWithStart({ x: 0, y: 50 }, { x: 100, y: 50 }, 0.5);
      const reflected = reflectRayThroughLine(ray, surface);

      // Source (0,50) reflected through x=50 line becomes (100,50)
      expect(reflected.source.x).toBe(100);
      expect(reflected.source.y).toBe(50);

      // Target (100,50) reflected through x=50 line becomes (0,50)
      expect(reflected.target.x).toBe(0);
      expect(reflected.target.y).toBe(50);
    });

    it("startRatio maintains same effective position after reflection", () => {
      // Ray from (0,50) to (100,50) with startRatio=0.5
      // Effective start is (50,50) - ON the surface
      const ray = createRayWithStart({ x: 0, y: 50 }, { x: 100, y: 50 }, 0.5);
      const originalStart = effectiveStart(ray);
      expect(originalStart.x).toBe(50);
      expect(originalStart.y).toBe(50);

      const reflected = reflectRayThroughLine(ray, surface);
      const reflectedStart = effectiveStart(reflected);

      // After reflection, effective start should still be (50,50) - ON the surface
      expect(reflectedStart.x).toBe(50);
      expect(reflectedStart.y).toBe(50);
    });
  });

  describe("off-screen origin use case", () => {
    it("off-screen origin with startRatio on surface finds correct hits", () => {
      // Simulate: origin at x=1500 (off-screen), surface at x=850
      // Target at x=0 (left side of screen)
      // Without startRatio, ray would hit screen boundary at x=1280 first
      // With startRatio placing effective start at x=850, ray starts on-screen

      const origin = { x: 1500, y: 500 };
      const target = { x: 0, y: 500 };
      
      // Calculate startRatio to place effective start at x=850 (on surface)
      // effectiveStart.x = origin.x + startRatio * (target.x - origin.x)
      // 850 = 1500 + startRatio * (0 - 1500)
      // 850 - 1500 = startRatio * -1500
      // -650 = startRatio * -1500
      // startRatio = 650/1500 = 0.4333...
      const startRatio = (850 - origin.x) / (target.x - origin.x);
      expect(startRatio).toBeCloseTo(0.4333, 3);

      const ray = createRayWithStart(origin, target, startRatio);
      const start = effectiveStart(ray);
      expect(start.x).toBeCloseTo(850, 6);
      expect(start.y).toBe(500);

      // Now an obstacle at x=400 should be found
      const obstacle: Segment = {
        start: { x: 400, y: 0 },
        end: { x: 400, y: 1000 },
      };

      const hit = intersectRaySegment(ray, obstacle);
      expect(hit).not.toBeNull();
      expect(hit!.point.x).toBeCloseTo(400, 6);

      // But an obstacle at x=1000 (between origin and surface) should NOT be found
      const obstacleBeforeSurface: Segment = {
        start: { x: 1000, y: 0 },
        end: { x: 1000, y: 1000 },
      };

      const hitBefore = intersectRaySegment(ray, obstacleBeforeSurface);
      expect(hitBefore).toBeNull(); // Should be ignored (before startRatio)
    });
  });
});

