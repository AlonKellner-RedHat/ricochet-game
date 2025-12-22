/**
 * GeometryOps Tests
 *
 * Comprehensive tests for all geometry functions.
 * Verifies first principles:
 * - No normalization errors
 * - Reflection reversibility
 * - Correct parametric values
 */

import { describe, expect, it } from "vitest";
import {
  add,
  distance,
  distanceSquared,
  dot,
  isOnSegment,
  lineLineIntersection,
  pointSideOfLine,
  raySegmentIntersect,
  reflectPointThroughLine,
  scale,
  subtract,
} from "@/trajectory-v2/geometry/GeometryOps";
import type { Ray, Vector2 } from "@/trajectory-v2/geometry/types";

describe("GeometryOps", () => {
  describe("lineLineIntersection", () => {
    it("should find intersection of perpendicular lines", () => {
      // Horizontal line from (0, 0) to (10, 0)
      // Vertical line from (5, -5) to (5, 5)
      const result = lineLineIntersection(
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: -5 },
        { x: 5, y: 5 }
      );

      expect(result.valid).toBe(true);
      expect(result.point.x).toBeCloseTo(5);
      expect(result.point.y).toBeCloseTo(0);
      expect(result.t).toBeCloseTo(0.5); // Midpoint of first line
      expect(result.s).toBeCloseTo(0.5); // Midpoint of second line
    });

    it("should find intersection of diagonal lines", () => {
      // Line from (0, 0) to (10, 10)
      // Line from (0, 10) to (10, 0)
      const result = lineLineIntersection(
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 10, y: 0 }
      );

      expect(result.valid).toBe(true);
      expect(result.point.x).toBeCloseTo(5);
      expect(result.point.y).toBeCloseTo(5);
      expect(result.t).toBeCloseTo(0.5);
      expect(result.s).toBeCloseTo(0.5);
    });

    it("should return invalid for parallel lines", () => {
      // Two horizontal parallel lines
      const result = lineLineIntersection(
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 5 },
        { x: 10, y: 5 }
      );

      expect(result.valid).toBe(false);
    });

    it("should return invalid for collinear lines", () => {
      // Same line, different points
      const result = lineLineIntersection(
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 0 },
        { x: 15, y: 0 }
      );

      expect(result.valid).toBe(false);
    });

    it("should handle intersection outside segments (t > 1)", () => {
      // Lines that intersect beyond segment ends
      const result = lineLineIntersection(
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 5, y: -1 },
        { x: 5, y: 1 }
      );

      expect(result.valid).toBe(true);
      expect(result.point.x).toBeCloseTo(5);
      expect(result.point.y).toBeCloseTo(0);
      expect(result.t).toBeCloseTo(5); // Beyond the segment
    });

    it("should handle intersection behind ray start (t < 0)", () => {
      const result = lineLineIntersection(
        { x: 5, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: -5 },
        { x: 0, y: 5 }
      );

      expect(result.valid).toBe(true);
      expect(result.point.x).toBeCloseTo(0);
      expect(result.t).toBeCloseTo(-1); // Behind the start
    });

    it("should handle near-parallel lines (floating-point edge case)", () => {
      // Lines that are almost parallel
      const result = lineLineIntersection(
        { x: 0, y: 0 },
        { x: 1000000, y: 1 },
        { x: 0, y: 10 },
        { x: 1000000, y: 11 }
      );

      expect(result.valid).toBe(false);
    });
  });

  describe("reflectPointThroughLine", () => {
    it("should reflect point through horizontal line", () => {
      const point = { x: 50, y: 10 };
      const lineP1 = { x: 0, y: 0 };
      const lineP2 = { x: 100, y: 0 };

      const reflected = reflectPointThroughLine(point, lineP1, lineP2);

      expect(reflected.x).toBeCloseTo(50);
      expect(reflected.y).toBeCloseTo(-10);
    });

    it("should reflect point through vertical line", () => {
      const point = { x: 20, y: 50 };
      const lineP1 = { x: 0, y: 0 };
      const lineP2 = { x: 0, y: 100 };

      const reflected = reflectPointThroughLine(point, lineP1, lineP2);

      expect(reflected.x).toBeCloseTo(-20);
      expect(reflected.y).toBeCloseTo(50);
    });

    it("should reflect point through diagonal line (y=x)", () => {
      // Reflecting (0, 100) through y=x should give (100, 0)
      const point = { x: 0, y: 100 };
      const lineP1 = { x: 0, y: 0 };
      const lineP2 = { x: 100, y: 100 };

      const reflected = reflectPointThroughLine(point, lineP1, lineP2);

      expect(reflected.x).toBeCloseTo(100);
      expect(reflected.y).toBeCloseTo(0);
    });

    it("should return same point if point is on the line", () => {
      const point = { x: 50, y: 50 };
      const lineP1 = { x: 0, y: 0 };
      const lineP2 = { x: 100, y: 100 };

      const reflected = reflectPointThroughLine(point, lineP1, lineP2);

      expect(reflected.x).toBeCloseTo(50);
      expect(reflected.y).toBeCloseTo(50);
    });

    it("FIRST PRINCIPLE: double reflection returns original point", () => {
      const point = { x: 37, y: 83 };
      const lineP1 = { x: 15, y: 25 };
      const lineP2 = { x: 85, y: 60 };

      const reflected = reflectPointThroughLine(point, lineP1, lineP2);
      const doubleReflected = reflectPointThroughLine(
        reflected,
        lineP1,
        lineP2
      );

      expect(doubleReflected.x).toBeCloseTo(point.x);
      expect(doubleReflected.y).toBeCloseTo(point.y);
    });

    it("should preserve distance from line after reflection", () => {
      const point = { x: 30, y: 80 };
      const lineP1 = { x: 10, y: 20 };
      const lineP2 = { x: 90, y: 60 };

      const reflected = reflectPointThroughLine(point, lineP1, lineP2);

      // Calculate distances (using line distance formula)
      const distanceToLine = (p: Vector2) => {
        const a = lineP2.y - lineP1.y;
        const b = lineP1.x - lineP2.x;
        const c = lineP2.x * lineP1.y - lineP1.x * lineP2.y;
        return Math.abs(a * p.x + b * p.y + c) / Math.sqrt(a * a + b * b);
      };

      expect(distanceToLine(reflected)).toBeCloseTo(distanceToLine(point));
    });

    it("should handle degenerate line (same points)", () => {
      const point = { x: 50, y: 50 };
      const lineP1 = { x: 25, y: 25 };
      const lineP2 = { x: 25, y: 25 };

      const reflected = reflectPointThroughLine(point, lineP1, lineP2);

      // Should return original point for degenerate line
      expect(reflected.x).toBeCloseTo(50);
      expect(reflected.y).toBeCloseTo(50);
    });

    it("should handle offset lines correctly", () => {
      // Horizontal line at y=50
      const point = { x: 30, y: 70 };
      const lineP1 = { x: 0, y: 50 };
      const lineP2 = { x: 100, y: 50 };

      const reflected = reflectPointThroughLine(point, lineP1, lineP2);

      expect(reflected.x).toBeCloseTo(30);
      expect(reflected.y).toBeCloseTo(30); // 20 below y=50
    });
  });

  describe("pointSideOfLine", () => {
    it("should return positive for point on left side", () => {
      // Line from (0,0) to (10,0), point above at (5, 5)
      const result = pointSideOfLine(
        { x: 5, y: 5 },
        { x: 0, y: 0 },
        { x: 10, y: 0 }
      );

      expect(result).toBeGreaterThan(0);
    });

    it("should return negative for point on right side", () => {
      // Line from (0,0) to (10,0), point below at (5, -5)
      const result = pointSideOfLine(
        { x: 5, y: -5 },
        { x: 0, y: 0 },
        { x: 10, y: 0 }
      );

      expect(result).toBeLessThan(0);
    });

    it("should return zero for point on line", () => {
      const result = pointSideOfLine(
        { x: 5, y: 0 },
        { x: 0, y: 0 },
        { x: 10, y: 0 }
      );

      expect(result).toBeCloseTo(0);
    });

    it("should handle diagonal lines", () => {
      // Line from (0,0) to (10,10)
      // Point at (0, 10) is on the left
      const leftResult = pointSideOfLine(
        { x: 0, y: 10 },
        { x: 0, y: 0 },
        { x: 10, y: 10 }
      );
      expect(leftResult).toBeGreaterThan(0);

      // Point at (10, 0) is on the right
      const rightResult = pointSideOfLine(
        { x: 10, y: 0 },
        { x: 0, y: 0 },
        { x: 10, y: 10 }
      );
      expect(rightResult).toBeLessThan(0);
    });

    it("should flip sign when line direction is reversed", () => {
      const point = { x: 5, y: 5 };

      const forwardResult = pointSideOfLine(
        point,
        { x: 0, y: 0 },
        { x: 10, y: 0 }
      );

      const backwardResult = pointSideOfLine(
        point,
        { x: 10, y: 0 },
        { x: 0, y: 0 }
      );

      expect(forwardResult).toBeCloseTo(-backwardResult);
    });
  });

  describe("isOnSegment", () => {
    it("should return true for t = 0 (start)", () => {
      expect(isOnSegment(0)).toBe(true);
    });

    it("should return true for t = 1 (end)", () => {
      expect(isOnSegment(1)).toBe(true);
    });

    it("should return true for t = 0.5 (middle)", () => {
      expect(isOnSegment(0.5)).toBe(true);
    });

    it("should return false for t < 0", () => {
      expect(isOnSegment(-0.1)).toBe(false);
    });

    it("should return false for t > 1", () => {
      expect(isOnSegment(1.1)).toBe(false);
    });

    it("should handle floating-point tolerance at boundaries", () => {
      expect(isOnSegment(1 + 1e-10)).toBe(true);
      expect(isOnSegment(-1e-10)).toBe(true);
      expect(isOnSegment(1 + 1e-8)).toBe(false);
    });
  });

  describe("raySegmentIntersect", () => {
    it("should detect hit when ray intersects segment", () => {
      const ray: Ray = { from: { x: 0, y: 5 }, to: { x: 10, y: 5 } };
      const result = raySegmentIntersect(
        ray,
        { x: 5, y: 0 },
        { x: 5, y: 10 }
      );

      expect(result.hit).toBe(true);
      expect(result.point.x).toBeCloseTo(5);
      expect(result.point.y).toBeCloseTo(5);
      expect(result.onSegment).toBe(true);
    });

    it("should not hit when ray misses segment", () => {
      const ray: Ray = { from: { x: 0, y: 5 }, to: { x: 10, y: 5 } };
      const result = raySegmentIntersect(
        ray,
        { x: 5, y: 10 },
        { x: 5, y: 20 }
      );

      expect(result.hit).toBe(false);
      expect(result.onSegment).toBe(false);
    });

    it("should not hit when intersection is behind ray", () => {
      const ray: Ray = { from: { x: 10, y: 5 }, to: { x: 20, y: 5 } };
      const result = raySegmentIntersect(
        ray,
        { x: 5, y: 0 },
        { x: 5, y: 10 }
      );

      expect(result.hit).toBe(false);
      expect(result.t).toBeLessThan(0);
    });

    it("should report onSegment correctly for extended line hit", () => {
      const ray: Ray = { from: { x: 0, y: 5 }, to: { x: 10, y: 5 } };
      // Segment is short, ray extends beyond and hits the infinite line
      const result = raySegmentIntersect(
        ray,
        { x: 5, y: 0 },
        { x: 5, y: 4 } // Segment ends at y=4, ray is at y=5
      );

      expect(result.hit).toBe(false);
      expect(result.onSegment).toBe(false);
      expect(result.s).toBeGreaterThan(1); // Beyond segment end
    });

    it("should return correct t value (parametric distance)", () => {
      // Ray from (0,0) to (10,0), segment at x=5
      const ray: Ray = { from: { x: 0, y: 0 }, to: { x: 10, y: 0 } };
      const result = raySegmentIntersect(
        ray,
        { x: 5, y: -5 },
        { x: 5, y: 5 }
      );

      expect(result.hit).toBe(true);
      expect(result.t).toBeCloseTo(0.5); // Half way along the ray direction
    });
  });

  describe("vector operations", () => {
    describe("add", () => {
      it("should add two vectors", () => {
        expect(add({ x: 1, y: 2 }, { x: 3, y: 4 })).toEqual({ x: 4, y: 6 });
      });
    });

    describe("subtract", () => {
      it("should subtract two vectors", () => {
        expect(subtract({ x: 5, y: 7 }, { x: 2, y: 3 })).toEqual({ x: 3, y: 4 });
      });
    });

    describe("scale", () => {
      it("should scale a vector", () => {
        expect(scale({ x: 2, y: 3 }, 2)).toEqual({ x: 4, y: 6 });
      });
    });

    describe("dot", () => {
      it("should calculate dot product", () => {
        expect(dot({ x: 1, y: 2 }, { x: 3, y: 4 })).toBe(11);
      });

      it("should return zero for perpendicular vectors", () => {
        expect(dot({ x: 1, y: 0 }, { x: 0, y: 1 })).toBe(0);
      });
    });

    describe("distance", () => {
      it("should calculate distance", () => {
        expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
      });
    });

    describe("distanceSquared", () => {
      it("should calculate squared distance", () => {
        expect(distanceSquared({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(25);
      });
    });
  });

  describe("first principles integration", () => {
    it("should find exact intersection using point-based ray", () => {
      // Player at (0, 0), cursor at (100, 100)
      // Surface from (50, 0) to (50, 100)
      // Ray should hit at (50, 50)

      const ray: Ray = { from: { x: 0, y: 0 }, to: { x: 100, y: 100 } };
      const result = raySegmentIntersect(
        ray,
        { x: 50, y: 0 },
        { x: 50, y: 100 }
      );

      expect(result.hit).toBe(true);
      expect(result.point.x).toBeCloseTo(50);
      expect(result.point.y).toBeCloseTo(50);
    });

    it("should calculate reflection point using image reflection", () => {
      // Player at (0, 0)
      // Cursor at (100, 0)
      // Surface is a horizontal line at y = 50

      const player = { x: 0, y: 0 };
      const cursor = { x: 100, y: 0 };
      const surfaceP1 = { x: 0, y: 50 };
      const surfaceP2 = { x: 100, y: 50 };

      // Reflect cursor through surface
      const cursorImage = reflectPointThroughLine(cursor, surfaceP1, surfaceP2);
      expect(cursorImage.y).toBeCloseTo(100);

      // Ray from player to cursor image
      const ray: Ray = { from: player, to: cursorImage };
      const hit = raySegmentIntersect(ray, surfaceP1, surfaceP2);

      expect(hit.hit).toBe(true);
      expect(hit.point.y).toBeCloseTo(50);
    });

    it("should verify bidirectional reflection geometry", () => {
      // Player and cursor with a horizontal surface between them
      // This is the classic "pool ball bounce" scenario

      const player = { x: 0, y: 0 };
      const cursor = { x: 100, y: 0 };

      // Horizontal surface at y=50
      const surfaceP1 = { x: -50, y: 50 };
      const surfaceP2 = { x: 150, y: 50 };

      // Reflect cursor through surface to find where to aim
      const cursorImage = reflectPointThroughLine(cursor, surfaceP1, surfaceP2);
      expect(cursorImage.x).toBeCloseTo(100);
      expect(cursorImage.y).toBeCloseTo(100); // Cursor at y=0 reflects to y=100

      // Ray from player to cursorImage should hit surface
      const hit = lineLineIntersection(player, cursorImage, surfaceP1, surfaceP2);
      expect(hit.valid).toBe(true);
      expect(hit.point.y).toBeCloseTo(50);
      // Hit should be at x=50 (midway, since cursor is at x=100 and player at x=0)
      expect(hit.point.x).toBeCloseTo(50);

      // Verify the reflected path: from hit point to cursor has same angle
      // as from player to hit point (reflected)
      const incomingDx = hit.point.x - player.x;
      const incomingDy = hit.point.y - player.y;
      const outgoingDx = cursor.x - hit.point.x;
      const outgoingDy = cursor.y - hit.point.y;

      // Horizontal surface: y-component should flip, x should stay same
      expect(Math.abs(incomingDx)).toBeCloseTo(Math.abs(outgoingDx));
      expect(incomingDy).toBeCloseTo(-outgoingDy);
    });
  });
});

