/**
 * Tests for line-circle intersection computation.
 *
 * Uses exact quadratic formula (no epsilon) per project rules.
 */
import { describe, it, expect } from "vitest";
import { computeLineCircleIntersections } from "@/trajectory-v2/geometry/RangeLimitOps";

describe("computeLineCircleIntersections", () => {
  describe("no intersection", () => {
    it("should return empty array when segment is entirely outside circle", () => {
      // Segment from (200, 0) to (300, 0) - far from circle at origin with radius 50
      const result = computeLineCircleIntersections(
        { x: 200, y: 0 },
        { x: 300, y: 0 },
        { x: 0, y: 0 },
        50
      );

      expect(result).toHaveLength(0);
    });

    it("should return empty array when segment is entirely inside circle", () => {
      // Segment from (10, 0) to (20, 0) - inside circle at origin with radius 100
      const result = computeLineCircleIntersections(
        { x: 10, y: 0 },
        { x: 20, y: 0 },
        { x: 0, y: 0 },
        100
      );

      expect(result).toHaveLength(0);
    });

    it("should return empty array for parallel segment that misses circle", () => {
      // Horizontal segment at y=100, circle at origin with radius 50
      const result = computeLineCircleIntersections(
        { x: -100, y: 100 },
        { x: 100, y: 100 },
        { x: 0, y: 0 },
        50
      );

      expect(result).toHaveLength(0);
    });
  });

  describe("one intersection", () => {
    it("should return one intersection when segment enters circle", () => {
      // Segment from (100, 0) to (0, 0) - enters circle at origin with radius 50
      const result = computeLineCircleIntersections(
        { x: 100, y: 0 },
        { x: 0, y: 0 },
        { x: 0, y: 0 },
        50
      );

      expect(result).toHaveLength(1);
      expect(result[0]!.t).toBeCloseTo(0.5); // Crosses at x=50 (t=0.5)
      expect(result[0]!.point.x).toBeCloseTo(50);
      expect(result[0]!.point.y).toBeCloseTo(0);
    });

    it("should return one intersection when segment exits circle", () => {
      // Segment from (0, 0) to (100, 0) - exits circle at origin with radius 50
      const result = computeLineCircleIntersections(
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 0, y: 0 },
        50
      );

      expect(result).toHaveLength(1);
      expect(result[0]!.t).toBeCloseTo(0.5); // Crosses at x=50 (t=0.5)
      expect(result[0]!.point.x).toBeCloseTo(50);
      expect(result[0]!.point.y).toBeCloseTo(0);
    });

    it("should handle tangent (single intersection point)", () => {
      // Segment tangent to circle: from (-100, 50) to (100, 50), circle at origin with radius 50
      const result = computeLineCircleIntersections(
        { x: -100, y: 50 },
        { x: 100, y: 50 },
        { x: 0, y: 0 },
        50
      );

      expect(result).toHaveLength(1);
      expect(result[0]!.point.x).toBeCloseTo(0);
      expect(result[0]!.point.y).toBeCloseTo(50);
    });
  });

  describe("two intersections", () => {
    it("should return two intersections when segment crosses through circle", () => {
      // Segment from (-100, 0) to (100, 0) - passes through circle at origin with radius 50
      const result = computeLineCircleIntersections(
        { x: -100, y: 0 },
        { x: 100, y: 0 },
        { x: 0, y: 0 },
        50
      );

      expect(result).toHaveLength(2);
      // First intersection at x=-50 (t=0.25)
      expect(result[0]!.t).toBeCloseTo(0.25);
      expect(result[0]!.point.x).toBeCloseTo(-50);
      // Second intersection at x=50 (t=0.75)
      expect(result[1]!.t).toBeCloseTo(0.75);
      expect(result[1]!.point.x).toBeCloseTo(50);
    });

    it("should return intersections in ascending t order", () => {
      // Segment from (100, 0) to (-100, 0) - reversed direction
      const result = computeLineCircleIntersections(
        { x: 100, y: 0 },
        { x: -100, y: 0 },
        { x: 0, y: 0 },
        50
      );

      expect(result).toHaveLength(2);
      expect(result[0]!.t).toBeLessThan(result[1]!.t);
    });

    it("should handle diagonal segments through circle", () => {
      // Diagonal segment through origin
      const result = computeLineCircleIntersections(
        { x: -100, y: -100 },
        { x: 100, y: 100 },
        { x: 0, y: 0 },
        50
      );

      expect(result).toHaveLength(2);
      // Both points should be on the circle (distance from origin = 50)
      for (const { point } of result) {
        const dist = Math.sqrt(point.x ** 2 + point.y ** 2);
        expect(dist).toBeCloseTo(50);
      }
    });
  });

  describe("edge cases", () => {
    it("should handle segment starting exactly on circle", () => {
      // Segment from (50, 0) to (100, 0) - starts on circle boundary
      const result = computeLineCircleIntersections(
        { x: 50, y: 0 },
        { x: 100, y: 0 },
        { x: 0, y: 0 },
        50
      );

      // t=0 is ON the segment but AT the boundary
      expect(result).toHaveLength(1);
      expect(result[0]!.t).toBeCloseTo(0);
    });

    it("should handle segment ending exactly on circle", () => {
      // Segment from (100, 0) to (50, 0) - ends on circle boundary
      const result = computeLineCircleIntersections(
        { x: 100, y: 0 },
        { x: 50, y: 0 },
        { x: 0, y: 0 },
        50
      );

      expect(result).toHaveLength(1);
      expect(result[0]!.t).toBeCloseTo(1);
    });

    it("should handle zero-length segment", () => {
      // Zero-length segment at (50, 0) - on circle boundary
      const result = computeLineCircleIntersections(
        { x: 50, y: 0 },
        { x: 50, y: 0 },
        { x: 0, y: 0 },
        50
      );

      // Degenerate case - either empty or single point
      expect(result.length).toBeLessThanOrEqual(1);
    });

    it("should handle circle not at origin", () => {
      // Circle at (100, 100) with radius 50, segment from (50, 100) to (200, 100)
      const result = computeLineCircleIntersections(
        { x: 50, y: 100 },
        { x: 200, y: 100 },
        { x: 100, y: 100 },
        50
      );

      expect(result).toHaveLength(2);
      expect(result[0]!.point.x).toBeCloseTo(50); // Left intersection
      expect(result[1]!.point.x).toBeCloseTo(150); // Right intersection
    });
  });

  describe("only returns intersections within segment (t in [0, 1])", () => {
    it("should exclude intersections outside segment range", () => {
      // Short segment that would intersect extended line but not the segment
      // Segment from (60, 0) to (70, 0) - both outside circle at origin with radius 50
      const result = computeLineCircleIntersections(
        { x: 60, y: 0 },
        { x: 70, y: 0 },
        { x: 0, y: 0 },
        50
      );

      expect(result).toHaveLength(0);
    });
  });
});
