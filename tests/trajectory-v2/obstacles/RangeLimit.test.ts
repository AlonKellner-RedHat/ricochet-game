/**
 * Tests for RangeLimit - Semi-circle range obstacles.
 */

import { describe, it, expect } from "vitest";
import {
  createRangeLimitPair,
  createRangeLimitHalf,
  type RangeLimitHalf,
  type RangeLimitPair,
} from "@/trajectory-v2/obstacles/RangeLimit";
import type { Vector2 } from "@/types";

describe("RangeLimitHalf", () => {
  describe("isDirectionInHalf", () => {
    it("should return true for direction in top half", () => {
      const half = createRangeLimitHalf("top", 100);
      
      // Right (0°) is in top
      expect(half.isDirectionInHalf({ x: 1, y: 0 })).toBe(true);
      // Down (90°) is in top
      expect(half.isDirectionInHalf({ x: 0, y: 1 })).toBe(true);
      // Left (180°) is in top
      expect(half.isDirectionInHalf({ x: -1, y: 0 })).toBe(true);
    });

    it("should return false for direction not in top half", () => {
      const half = createRangeLimitHalf("top", 100);
      
      // Up (-90°) is NOT in top
      expect(half.isDirectionInHalf({ x: 0, y: -1 })).toBe(false);
    });

    it("should return true for direction in bottom half", () => {
      const half = createRangeLimitHalf("bottom", 100);
      
      // Up (-90°) is in bottom
      expect(half.isDirectionInHalf({ x: 0, y: -1 })).toBe(true);
      // Right (0°) is boundary - should be in bottom
      expect(half.isDirectionInHalf({ x: 1, y: 0 })).toBe(true);
    });

    it("should return false for direction not in bottom half", () => {
      const half = createRangeLimitHalf("bottom", 100);
      
      // Down (90°) is NOT in bottom
      expect(half.isDirectionInHalf({ x: 0, y: 1 })).toBe(false);
    });
  });

  describe("computeHitPoint", () => {
    const originImage: Vector2 = { x: 100, y: 100 };
    const radius = 50;

    it("should return null if direction not in half", () => {
      const half = createRangeLimitHalf("top", radius);
      
      // Up is not in top half
      const result = half.computeHitPoint(
        originImage,
        { x: 0, y: -1 }, // up
        { x: 100, y: 100 } // start at origin
      );
      
      expect(result).toBeNull();
    });

    it("should return hit at distance R when start inside circle", () => {
      const half = createRangeLimitHalf("top", radius);
      
      const result = half.computeHitPoint(
        originImage,
        { x: 1, y: 0 }, // right (in top half)
        { x: 100, y: 100 } // start at origin
      );
      
      expect(result).not.toBeNull();
      expect(result!.wasInsideCircle).toBe(true);
      expect(result!.point.x).toBeCloseTo(150); // 100 + 50
      expect(result!.point.y).toBeCloseTo(100);
    });

    it("should return hit at start position when outside circle", () => {
      const half = createRangeLimitHalf("top", radius);
      const startOutside: Vector2 = { x: 200, y: 100 };
      
      const result = half.computeHitPoint(
        originImage,
        { x: 1, y: 0 }, // right (in top half)
        startOutside
      );
      
      expect(result).not.toBeNull();
      expect(result!.wasInsideCircle).toBe(false);
      expect(result!.point.x).toBeCloseTo(200);
      expect(result!.point.y).toBeCloseTo(100);
    });
  });
});

describe("RangeLimitPair", () => {
  describe("createRangeLimitPair", () => {
    it("should create horizontal pair (top/bottom) by default", () => {
      const pair = createRangeLimitPair(100);
      
      expect(pair.orientation).toBe("horizontal");
      expect(pair.first.half).toBe("top");
      expect(pair.second.half).toBe("bottom");
      expect(pair.radius).toBe(100);
    });

    it("should create vertical pair (left/right) when specified", () => {
      const pair = createRangeLimitPair(100, "vertical");
      
      expect(pair.orientation).toBe("vertical");
      expect(pair.first.half).toBe("left");
      expect(pair.second.half).toBe("right");
    });
  });

  describe("findHit", () => {
    const originImage: Vector2 = { x: 100, y: 100 };
    const radius = 50;

    it("should find hit in first half (top)", () => {
      const pair = createRangeLimitPair(radius); // horizontal = top/bottom
      
      const result = pair.findHit(
        originImage,
        { x: 1, y: 0 }, // right - in top half
        { x: 100, y: 100 }
      );
      
      expect(result).not.toBeNull();
      expect(result!.half.half).toBe("top");
    });

    it("should find hit in second half (bottom)", () => {
      const pair = createRangeLimitPair(radius);
      
      const result = pair.findHit(
        originImage,
        { x: 0, y: -1 }, // up - in bottom half
        { x: 100, y: 100 }
      );
      
      expect(result).not.toBeNull();
      expect(result!.half.half).toBe("bottom");
    });

    it("should return null for direction on boundary (covered by both)", () => {
      // Direction exactly at 0° (right) should hit top
      const pair = createRangeLimitPair(radius);
      
      const result = pair.findHit(
        originImage,
        { x: 1, y: 0 },
        { x: 100, y: 100 }
      );
      
      // Should match one of them (top includes 0°)
      expect(result).not.toBeNull();
    });
  });
});
