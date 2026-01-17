/**
 * RayCasting Module Tests
 *
 * Tests for the unified ray casting primitives used by both
 * trajectory and visibility systems.
 */

import { RicochetSurface } from "@/surfaces/RicochetSurface";
import type { Surface } from "@/surfaces/Surface";
import { WallSurface } from "@/surfaces/WallSurface";
import {
  castContinuationRay,
  castRay,
  castRayToEndpoint,
  findClosestHit,
  pointsEqual,
  raycastForwardWithProvenance,
  toOriginPoint,
  toVector2Array,
} from "@/trajectory-v2/geometry/RayCasting";
import { Endpoint, HitPoint, OriginPoint } from "@/trajectory-v2/geometry/SourcePoint";
import type { Ray, Vector2 } from "@/trajectory-v2/geometry/types";
import { describe, expect, it } from "vitest";

// Helper to create a test surface
function createTestSurface(id: string, start: Vector2, end: Vector2, reflective = true): Surface {
  if (reflective) {
    return new RicochetSurface(id, { start, end });
  } else {
    return new WallSurface(id, { start, end });
  }
}

describe("RayCasting", () => {
  describe("pointsEqual", () => {
    it("should return true for identical points", () => {
      expect(pointsEqual({ x: 100, y: 200 }, { x: 100, y: 200 })).toBe(true);
    });

    it("should return false for different points", () => {
      expect(pointsEqual({ x: 100, y: 200 }, { x: 100, y: 201 })).toBe(false);
      expect(pointsEqual({ x: 101, y: 200 }, { x: 100, y: 200 })).toBe(false);
    });
  });

  describe("findClosestHit", () => {
    it("should find hit on a single surface", () => {
      const surface = createTestSurface("s1", { x: 200, y: 0 }, { x: 200, y: 400 });
      const ray: Ray = { source: { x: 0, y: 200 }, target: { x: 400, y: 200 } };

      const hit = findClosestHit(ray, [surface]);

      expect(hit).not.toBeNull();
      expect(hit!.surface.id).toBe("s1");
      expect(hit!.point.x).toBeCloseTo(200);
      expect(hit!.point.y).toBeCloseTo(200);
      expect(hit!.s).toBeCloseTo(0.5); // Midpoint of surface
    });

    it("should find the closest of multiple hits", () => {
      const s1 = createTestSurface("s1", { x: 100, y: 0 }, { x: 100, y: 400 });
      const s2 = createTestSurface("s2", { x: 200, y: 0 }, { x: 200, y: 400 });
      const s3 = createTestSurface("s3", { x: 300, y: 0 }, { x: 300, y: 400 });
      const ray: Ray = { source: { x: 0, y: 200 }, target: { x: 400, y: 200 } };

      const hit = findClosestHit(ray, [s1, s2, s3]);

      expect(hit).not.toBeNull();
      expect(hit!.surface.id).toBe("s1");
      expect(hit!.point.x).toBeCloseTo(100);
    });

    it("should respect excludeIds", () => {
      const s1 = createTestSurface("s1", { x: 100, y: 0 }, { x: 100, y: 400 });
      const s2 = createTestSurface("s2", { x: 200, y: 0 }, { x: 200, y: 400 });
      const ray: Ray = { source: { x: 0, y: 200 }, target: { x: 400, y: 200 } };

      const hit = findClosestHit(ray, [s1, s2], { excludeIds: new Set(["s1"]) });

      expect(hit).not.toBeNull();
      expect(hit!.surface.id).toBe("s2");
    });

    it("should respect minT", () => {
      const surface = createTestSurface("s1", { x: 200, y: 0 }, { x: 200, y: 400 });
      const ray: Ray = { source: { x: 0, y: 200 }, target: { x: 400, y: 200 } };

      // minT of 0.6 means hits before x=240 are ignored
      const hit = findClosestHit(ray, [surface], { minT: 0.6 });

      expect(hit).toBeNull(); // Surface at x=200 is before minT
    });

    it("should return null for parallel ray and surface", () => {
      const surface = createTestSurface("s1", { x: 100, y: 100 }, { x: 200, y: 100 });
      const ray: Ray = { source: { x: 0, y: 100 }, target: { x: 300, y: 100 } }; // Same line

      const hit = findClosestHit(ray, [surface]);

      expect(hit).toBeNull();
    });

    it("should return null when ray misses surface", () => {
      const surface = createTestSurface("s1", { x: 200, y: 0 }, { x: 200, y: 100 });
      const ray: Ray = { source: { x: 0, y: 200 }, target: { x: 400, y: 200 } }; // Below surface

      const hit = findClosestHit(ray, [surface]);

      expect(hit).toBeNull();
    });
  });

  describe("castRay", () => {
    it("should return HitPoint with provenance", () => {
      const surface = createTestSurface("s1", { x: 200, y: 0 }, { x: 200, y: 400 });
      const origin = { x: 0, y: 200 };
      const target = { x: 400, y: 200 };

      const hit = castRay(origin, target, [surface]);

      expect(hit).not.toBeNull();
      expect(hit).toBeInstanceOf(HitPoint);
      expect(hit!.hitSurface.id).toBe("s1");
      expect(hit!.s).toBeCloseTo(0.5);
    });

    it("should return null when no hit", () => {
      const surface = createTestSurface("s1", { x: 200, y: 0 }, { x: 200, y: 100 });
      const origin = { x: 0, y: 200 };
      const target = { x: 400, y: 200 };

      const hit = castRay(origin, target, [surface]);

      expect(hit).toBeNull();
    });
  });

  describe("castRayToEndpoint", () => {
    it("should return Endpoint when unobstructed", () => {
      const s1 = createTestSurface("s1", { x: 200, y: 0 }, { x: 200, y: 400 });
      const endpoint = new Endpoint(s1, "start");
      const origin = { x: 0, y: 0 };

      const result = castRayToEndpoint(origin, endpoint, [s1]);

      expect(result).toBeInstanceOf(Endpoint);
      expect((result as Endpoint).surface.id).toBe("s1");
    });

    it("should return HitPoint when obstructed", () => {
      const target = createTestSurface("target", { x: 300, y: 0 }, { x: 300, y: 400 });
      const blocker = createTestSurface("blocker", { x: 150, y: 0 }, { x: 150, y: 400 });
      const endpoint = new Endpoint(target, "start");
      const origin = { x: 0, y: 0 };

      const result = castRayToEndpoint(origin, endpoint, [target, blocker]);

      expect(result).toBeInstanceOf(HitPoint);
      expect((result as HitPoint).hitSurface.id).toBe("blocker");
    });
  });

  describe("castContinuationRay", () => {
    it("should find hit beyond endpoint", () => {
      const s1 = createTestSurface("s1", { x: 100, y: 0 }, { x: 100, y: 200 });
      const s2 = createTestSurface("s2", { x: 200, y: 0 }, { x: 200, y: 400 });
      const endpoint = new Endpoint(s1, "end"); // At (100, 200)
      const origin = { x: 0, y: 200 };

      const hit = castContinuationRay(origin, endpoint, [s1, s2]);

      expect(hit).not.toBeNull();
      expect(hit!.hitSurface.id).toBe("s2");
    });

    it("should exclude the endpoint's surface", () => {
      // Create a surface that the continuation ray would hit if not excluded
      const s1 = createTestSurface("s1", { x: 100, y: 0 }, { x: 100, y: 400 });
      const endpoint = new Endpoint(s1, "end");
      const origin = { x: 0, y: 200 };

      const hit = castContinuationRay(origin, endpoint, [s1]);

      expect(hit).toBeNull(); // s1 is excluded, no other surfaces
    });
  });

  describe("raycastForwardWithProvenance", () => {
    it("should return RayHitResult with provenance", () => {
      const surface = createTestSurface("s1", { x: 200, y: 0 }, { x: 200, y: 400 });
      const from = { x: 0, y: 200 };
      const direction = { x: 1, y: 0 };

      const result = raycastForwardWithProvenance(from, direction, [surface]);

      expect(result).not.toBeNull();
      expect(result!.hitPoint).toBeInstanceOf(HitPoint);
      expect(result!.hitPoint.hitSurface.id).toBe("s1");
      expect(result!.canReflect).toBe(true); // Reflective surface
    });

    it("should return canReflect=false for walls", () => {
      const wall = createTestSurface("wall", { x: 200, y: 0 }, { x: 200, y: 400 }, false);
      const from = { x: 0, y: 200 };
      const direction = { x: 1, y: 0 };

      const result = raycastForwardWithProvenance(from, direction, [wall]);

      expect(result).not.toBeNull();
      expect(result!.canReflect).toBe(false);
    });

    it("should exclude specified surfaces", () => {
      const s1 = createTestSurface("s1", { x: 100, y: 0 }, { x: 100, y: 400 });
      const s2 = createTestSurface("s2", { x: 200, y: 0 }, { x: 200, y: 400 });
      const from = { x: 0, y: 200 };
      const direction = { x: 1, y: 0 };

      const result = raycastForwardWithProvenance(from, direction, [s1, s2], [s1]);

      expect(result).not.toBeNull();
      expect(result!.hitPoint.hitSurface.id).toBe("s2");
    });
  });

  describe("toOriginPoint", () => {
    it("should create OriginPoint from Vector2", () => {
      const v = { x: 100, y: 200 };
      const origin = toOriginPoint(v);

      expect(origin).toBeInstanceOf(OriginPoint);
      expect(origin.computeXY()).toEqual(v);
    });
  });

  describe("toVector2Array", () => {
    it("should convert SourcePoint array to Vector2 array", () => {
      const surface = createTestSurface("s1", { x: 100, y: 0 }, { x: 200, y: 400 });
      const points = [
        new OriginPoint({ x: 0, y: 0 }),
        new Endpoint(surface, "start"),
        new Endpoint(surface, "end"),
      ];

      const vectors = toVector2Array(points);

      expect(vectors).toHaveLength(3);
      expect(vectors[0]).toEqual({ x: 0, y: 0 });
      expect(vectors[1]).toEqual({ x: 100, y: 0 });
      expect(vectors[2]).toEqual({ x: 200, y: 400 });
    });
  });
});
