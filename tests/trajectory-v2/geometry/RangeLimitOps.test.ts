/**
 * Tests for RangeLimitOps - Semi-circle geometry operations for range limits.
 *
 * Refactored to use coordinate sign checks instead of atan2 for project rule compliance.
 */

import { describe, it, expect } from "vitest";
import {
  isDirectionInSemiCircle,
  isInsideCircle,
  computeRangeLimitHitPoint,
} from "@/trajectory-v2/geometry/RangeLimitOps";

describe("isDirectionInSemiCircle", () => {
  describe("top semi-circle (directions pointing upward, y <= 0 in screen coords)", () => {
    it("should return true for direction pointing up", () => {
      expect(isDirectionInSemiCircle({ x: 0, y: -1 }, "top")).toBe(true);
    });

    it("should return true for direction pointing up-right", () => {
      expect(isDirectionInSemiCircle({ x: 1, y: -1 }, "top")).toBe(true);
    });

    it("should return true for direction pointing up-left", () => {
      expect(isDirectionInSemiCircle({ x: -1, y: -1 }, "top")).toBe(true);
    });

    it("should return true for direction pointing horizontally right (y=0 boundary)", () => {
      expect(isDirectionInSemiCircle({ x: 1, y: 0 }, "top")).toBe(true);
    });

    it("should return true for direction pointing horizontally left (y=0 boundary)", () => {
      expect(isDirectionInSemiCircle({ x: -1, y: 0 }, "top")).toBe(true);
    });

    it("should return false for direction pointing down", () => {
      expect(isDirectionInSemiCircle({ x: 0, y: 1 }, "top")).toBe(false);
    });

    it("should return false for direction pointing down-right", () => {
      expect(isDirectionInSemiCircle({ x: 1, y: 1 }, "top")).toBe(false);
    });
  });

  describe("bottom semi-circle (directions pointing downward, y >= 0 in screen coords)", () => {
    it("should return true for direction pointing down", () => {
      expect(isDirectionInSemiCircle({ x: 0, y: 1 }, "bottom")).toBe(true);
    });

    it("should return true for direction pointing down-right", () => {
      expect(isDirectionInSemiCircle({ x: 1, y: 1 }, "bottom")).toBe(true);
    });

    it("should return true for direction pointing down-left", () => {
      expect(isDirectionInSemiCircle({ x: -1, y: 1 }, "bottom")).toBe(true);
    });

    it("should return true for direction pointing horizontally right (y=0 boundary)", () => {
      expect(isDirectionInSemiCircle({ x: 1, y: 0 }, "bottom")).toBe(true);
    });

    it("should return false for direction pointing up", () => {
      expect(isDirectionInSemiCircle({ x: 0, y: -1 }, "bottom")).toBe(false);
    });

    it("should return false for direction pointing up-left", () => {
      expect(isDirectionInSemiCircle({ x: -1, y: -1 }, "bottom")).toBe(false);
    });
  });

  describe("right semi-circle (directions pointing right, x >= 0)", () => {
    it("should return true for direction pointing right", () => {
      expect(isDirectionInSemiCircle({ x: 1, y: 0 }, "right")).toBe(true);
    });

    it("should return true for direction pointing up-right", () => {
      expect(isDirectionInSemiCircle({ x: 1, y: -1 }, "right")).toBe(true);
    });

    it("should return true for direction pointing down-right", () => {
      expect(isDirectionInSemiCircle({ x: 1, y: 1 }, "right")).toBe(true);
    });

    it("should return true for direction pointing vertically up (x=0 boundary)", () => {
      expect(isDirectionInSemiCircle({ x: 0, y: -1 }, "right")).toBe(true);
    });

    it("should return false for direction pointing left", () => {
      expect(isDirectionInSemiCircle({ x: -1, y: 0 }, "right")).toBe(false);
    });

    it("should return false for direction pointing up-left", () => {
      expect(isDirectionInSemiCircle({ x: -1, y: -1 }, "right")).toBe(false);
    });
  });

  describe("left semi-circle (directions pointing left, x <= 0)", () => {
    it("should return true for direction pointing left", () => {
      expect(isDirectionInSemiCircle({ x: -1, y: 0 }, "left")).toBe(true);
    });

    it("should return true for direction pointing up-left", () => {
      expect(isDirectionInSemiCircle({ x: -1, y: -1 }, "left")).toBe(true);
    });

    it("should return true for direction pointing down-left", () => {
      expect(isDirectionInSemiCircle({ x: -1, y: 1 }, "left")).toBe(true);
    });

    it("should return true for direction pointing vertically up (x=0 boundary)", () => {
      expect(isDirectionInSemiCircle({ x: 0, y: -1 }, "left")).toBe(true);
    });

    it("should return false for direction pointing right", () => {
      expect(isDirectionInSemiCircle({ x: 1, y: 0 }, "left")).toBe(false);
    });

    it("should return false for direction pointing down-right", () => {
      expect(isDirectionInSemiCircle({ x: 1, y: 1 }, "left")).toBe(false);
    });
  });
});

describe("isInsideCircle", () => {
  const center = { x: 100, y: 100 };
  const radius = 50;

  it("should return true for point at center", () => {
    expect(isInsideCircle({ x: 100, y: 100 }, center, radius)).toBe(true);
  });

  it("should return true for point inside circle", () => {
    expect(isInsideCircle({ x: 120, y: 100 }, center, radius)).toBe(true);
  });

  it("should return false for point outside circle", () => {
    expect(isInsideCircle({ x: 200, y: 100 }, center, radius)).toBe(false);
  });

  it("should return true for point exactly on boundary", () => {
    // Point at distance exactly R
    expect(isInsideCircle({ x: 150, y: 100 }, center, radius)).toBe(true);
  });
});

describe("computeRangeLimitHitPoint", () => {
  const originImage = { x: 100, y: 100 };
  const radius = 50;

  describe("when start is inside circle", () => {
    it("should return hit point at distance R from origin in ray direction", () => {
      const rayDirection = { x: 1, y: 0 }; // pointing right
      const startPosition = { x: 100, y: 100 }; // at origin

      const result = computeRangeLimitHitPoint(
        originImage,
        radius,
        rayDirection,
        startPosition
      );

      expect(result.wasInsideCircle).toBe(true);
      expect(result.point.x).toBeCloseTo(150); // 100 + 50
      expect(result.point.y).toBeCloseTo(100);
    });

    it("should work for diagonal direction", () => {
      const rayDirection = { x: 1, y: 1 }; // pointing down-right
      const startPosition = { x: 100, y: 100 };

      const result = computeRangeLimitHitPoint(
        originImage,
        radius,
        rayDirection,
        startPosition
      );

      expect(result.wasInsideCircle).toBe(true);
      // Distance from origin to hit point should be R
      const dx = result.point.x - originImage.x;
      const dy = result.point.y - originImage.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      expect(dist).toBeCloseTo(radius);
    });
  });

  describe("when start is outside circle", () => {
    it("should return hit point at start position (immediately blocked)", () => {
      const rayDirection = { x: 1, y: 0 };
      const startPosition = { x: 200, y: 100 }; // outside circle

      const result = computeRangeLimitHitPoint(
        originImage,
        radius,
        rayDirection,
        startPosition
      );

      expect(result.wasInsideCircle).toBe(false);
      expect(result.point.x).toBeCloseTo(200);
      expect(result.point.y).toBeCloseTo(100);
    });
  });

  describe("when start is on the boundary", () => {
    it("should return hit point at distance R from origin", () => {
      const rayDirection = { x: 1, y: 0 };
      const startPosition = { x: 150, y: 100 }; // on boundary

      const result = computeRangeLimitHitPoint(
        originImage,
        radius,
        rayDirection,
        startPosition
      );

      // On boundary counts as inside
      expect(result.wasInsideCircle).toBe(true);
      expect(result.point.x).toBeCloseTo(150);
      expect(result.point.y).toBeCloseTo(100);
    });
  });
});
