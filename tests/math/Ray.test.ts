import { RayUtils, raySegmentIntersect } from "@/math/Ray";
import { Segment } from "@/math/Segment";
import { Vec2 } from "@/math/Vec2";
import { describe, expect, it } from "vitest";

describe("RayUtils", () => {
  describe("create", () => {
    it("should create ray with normalized direction", () => {
      const ray = RayUtils.create({ x: 0, y: 0 }, { x: 10, y: 0 });
      expect(ray.origin).toEqual({ x: 0, y: 0 });
      expect(ray.direction).toEqual({ x: 1, y: 0 });
    });

    it("should normalize non-unit direction", () => {
      const ray = RayUtils.create({ x: 0, y: 0 }, { x: 3, y: 4 });
      expect(ray.direction.x).toBeCloseTo(0.6);
      expect(ray.direction.y).toBeCloseTo(0.8);
    });
  });

  describe("fromPoints", () => {
    it("should create ray pointing from origin to target", () => {
      const ray = RayUtils.fromPoints({ x: 0, y: 0 }, { x: 10, y: 0 });
      expect(ray.direction).toEqual({ x: 1, y: 0 });
    });

    it("should handle diagonal direction", () => {
      const ray = RayUtils.fromPoints({ x: 0, y: 0 }, { x: 3, y: 4 });
      expect(ray.direction.x).toBeCloseTo(0.6);
      expect(ray.direction.y).toBeCloseTo(0.8);
    });
  });

  describe("pointAt", () => {
    it("should return point along ray at parameter t", () => {
      const ray = RayUtils.create({ x: 0, y: 0 }, { x: 1, y: 0 });
      expect(RayUtils.pointAt(ray, 5)).toEqual({ x: 5, y: 0 });
    });

    it("should return origin at t=0", () => {
      const ray = RayUtils.create({ x: 10, y: 20 }, { x: 1, y: 1 });
      expect(RayUtils.pointAt(ray, 0)).toEqual({ x: 10, y: 20 });
    });
  });
});

describe("Segment", () => {
  describe("create", () => {
    it("should create segment from two points", () => {
      const seg = Segment.create({ x: 0, y: 0 }, { x: 10, y: 10 });
      expect(seg.start).toEqual({ x: 0, y: 0 });
      expect(seg.end).toEqual({ x: 10, y: 10 });
    });
  });

  describe("direction", () => {
    it("should return normalized direction", () => {
      const seg = Segment.create({ x: 0, y: 0 }, { x: 10, y: 0 });
      expect(Segment.direction(seg)).toEqual({ x: 1, y: 0 });
    });
  });

  describe("normal", () => {
    it("should return normal for horizontal segment", () => {
      const segment = Segment.create({ x: 0, y: 0 }, { x: 10, y: 0 });
      const normal = Segment.normal(segment);

      // Normal should be perpendicular (pointing up or down)
      expect(normal.x).toBeCloseTo(0);
      expect(Math.abs(normal.y)).toBeCloseTo(1);
    });

    it("should return normal for vertical segment", () => {
      const segment = Segment.create({ x: 0, y: 0 }, { x: 0, y: 10 });
      const normal = Segment.normal(segment);

      expect(Math.abs(normal.x)).toBeCloseTo(1);
      expect(normal.y).toBeCloseTo(0);
    });

    it("should return unit vector", () => {
      const segment = Segment.create({ x: 0, y: 0 }, { x: 3, y: 4 });
      const normal = Segment.normal(segment);

      expect(Vec2.length(normal)).toBeCloseTo(1);
    });
  });

  describe("length", () => {
    it("should calculate segment length", () => {
      const segment = Segment.create({ x: 0, y: 0 }, { x: 3, y: 4 });
      expect(Segment.length(segment)).toBe(5);
    });
  });

  describe("midpoint", () => {
    it("should return midpoint", () => {
      const segment = Segment.create({ x: 0, y: 0 }, { x: 10, y: 10 });
      expect(Segment.midpoint(segment)).toEqual({ x: 5, y: 5 });
    });
  });
});

describe("raySegmentIntersect", () => {
  describe("basic intersections", () => {
    it("should detect intersection with horizontal segment", () => {
      const ray = RayUtils.create({ x: 5, y: 0 }, { x: 0, y: 1 });
      const segment = Segment.create({ x: 0, y: 10 }, { x: 10, y: 10 });

      const result = raySegmentIntersect(ray, segment);

      expect(result.hit).toBe(true);
      expect(result.point).toEqual({ x: 5, y: 10 });
      expect(result.t).toBe(10);
    });

    it("should detect intersection with vertical segment", () => {
      const ray = RayUtils.create({ x: 0, y: 5 }, { x: 1, y: 0 });
      const segment = Segment.create({ x: 10, y: 0 }, { x: 10, y: 10 });

      const result = raySegmentIntersect(ray, segment);

      expect(result.hit).toBe(true);
      expect(result.point).toEqual({ x: 10, y: 5 });
    });

    it("should detect intersection with diagonal segment", () => {
      const ray = RayUtils.create({ x: 0, y: 0 }, Vec2.normalize({ x: 1, y: 1 }));
      const segment = Segment.create({ x: 5, y: 10 }, { x: 10, y: 5 });

      const result = raySegmentIntersect(ray, segment);

      expect(result.hit).toBe(true);
      expect(result.point?.x).toBeCloseTo(7.5);
      expect(result.point?.y).toBeCloseTo(7.5);
    });
  });

  describe("no intersection cases", () => {
    it("should return no hit for parallel ray and segment", () => {
      const ray = RayUtils.create({ x: 0, y: 0 }, { x: 1, y: 0 });
      const segment = Segment.create({ x: 0, y: 10 }, { x: 10, y: 10 });

      const result = raySegmentIntersect(ray, segment);

      expect(result.hit).toBe(false);
    });

    it("should return no hit when ray points away from segment", () => {
      const ray = RayUtils.create({ x: 5, y: 5 }, { x: 0, y: -1 });
      const segment = Segment.create({ x: 0, y: 10 }, { x: 10, y: 10 });

      const result = raySegmentIntersect(ray, segment);

      expect(result.hit).toBe(false);
    });

    it("should return no hit when intersection is outside segment bounds", () => {
      const ray = RayUtils.create({ x: 15, y: 0 }, { x: 0, y: 1 });
      const segment = Segment.create({ x: 0, y: 10 }, { x: 10, y: 10 });

      const result = raySegmentIntersect(ray, segment);

      expect(result.hit).toBe(false);
    });

    it("should return no hit when ray origin is past segment", () => {
      const ray = RayUtils.create({ x: 5, y: 15 }, { x: 0, y: 1 }); // Origin past segment, going away
      const segment = Segment.create({ x: 0, y: 10 }, { x: 10, y: 10 });

      const result = raySegmentIntersect(ray, segment);

      expect(result.hit).toBe(false);
    });
  });

  describe("edge cases", () => {
    it("should handle ray starting on segment (t ≈ 0)", () => {
      const ray = RayUtils.create({ x: 5, y: 10 }, { x: 0, y: 1 });
      const segment = Segment.create({ x: 0, y: 10 }, { x: 10, y: 10 });

      const result = raySegmentIntersect(ray, segment);

      expect(result.hit).toBe(true);
      expect(result.t).toBeCloseTo(0);
    });

    it("should handle intersection at segment start endpoint", () => {
      const ray = RayUtils.create({ x: 0, y: 0 }, Vec2.normalize({ x: 1, y: 1 }));
      const segment = Segment.create({ x: 5, y: 5 }, { x: 10, y: 0 });

      const result = raySegmentIntersect(ray, segment);

      expect(result.hit).toBe(true);
      expect(result.point?.x).toBeCloseTo(5);
      expect(result.point?.y).toBeCloseTo(5);
      expect(result.s).toBeCloseTo(0);
    });

    it("should handle intersection at segment end endpoint", () => {
      const ray = RayUtils.create({ x: 0, y: 0 }, Vec2.normalize({ x: 10, y: 0 }));
      const segment = Segment.create({ x: 5, y: 5 }, { x: 10, y: 0 });

      const result = raySegmentIntersect(ray, segment);

      expect(result.hit).toBe(true);
      expect(result.s).toBeCloseTo(1);
    });
  });

  describe("normal calculation", () => {
    it("should return normal pointing toward ray origin", () => {
      const ray = RayUtils.create({ x: 5, y: 0 }, { x: 0, y: 1 });
      const segment = Segment.create({ x: 0, y: 10 }, { x: 10, y: 10 });

      const result = raySegmentIntersect(ray, segment);

      expect(result.normal).not.toBeNull();
      expect(result.normal?.y).toBeLessThan(0); // Pointing up (toward origin which is below)
    });

    it("should flip normal when segment faces away", () => {
      // Ray coming from above
      const ray = RayUtils.create({ x: 5, y: 20 }, { x: 0, y: -1 });
      const segment = Segment.create({ x: 0, y: 10 }, { x: 10, y: 10 });

      const result = raySegmentIntersect(ray, segment);

      expect(result.normal).not.toBeNull();
      expect(result.normal?.y).toBeGreaterThan(0); // Pointing down (toward origin which is above)
    });
  });
});
