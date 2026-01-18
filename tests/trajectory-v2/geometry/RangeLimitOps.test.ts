/**
 * Tests for RangeLimitOps - Semi-circle geometry operations for range limits.
 */

import { describe, it, expect } from "vitest";
import {
  directionToAngle,
  isAngleInSemiCircle,
  isInsideCircle,
  computeRangeLimitHitPoint,
} from "@/trajectory-v2/geometry/RangeLimitOps";

describe("directionToAngle", () => {
  it("should return 0 for direction pointing right", () => {
    const angle = directionToAngle({ x: 1, y: 0 });
    expect(angle).toBeCloseTo(0);
  });

  it("should return PI/2 for direction pointing up", () => {
    const angle = directionToAngle({ x: 0, y: -1 }); // -y is up in screen coords
    expect(angle).toBeCloseTo(-Math.PI / 2);
  });

  it("should return -PI/2 for direction pointing down", () => {
    const angle = directionToAngle({ x: 0, y: 1 }); // +y is down in screen coords
    expect(angle).toBeCloseTo(Math.PI / 2);
  });

  it("should return PI for direction pointing left", () => {
    const angle = directionToAngle({ x: -1, y: 0 });
    expect(Math.abs(angle)).toBeCloseTo(Math.PI);
  });

  it("should return PI/4 for direction pointing down-right", () => {
    const angle = directionToAngle({ x: 1, y: 1 });
    expect(angle).toBeCloseTo(Math.PI / 4);
  });
});

describe("isAngleInSemiCircle", () => {
  describe("top semi-circle (0 to PI)", () => {
    it("should return true for angle 0 (right)", () => {
      expect(isAngleInSemiCircle(0, "top")).toBe(true);
    });

    it("should return true for angle PI/2 (down in screen coords)", () => {
      expect(isAngleInSemiCircle(Math.PI / 2, "top")).toBe(true);
    });

    it("should return true for angle PI (left)", () => {
      expect(isAngleInSemiCircle(Math.PI, "top")).toBe(true);
    });

    it("should return false for angle -PI/2 (up in screen coords)", () => {
      expect(isAngleInSemiCircle(-Math.PI / 2, "top")).toBe(false);
    });
  });

  describe("bottom semi-circle (-PI to 0)", () => {
    it("should return true for angle -PI/2 (up in screen coords)", () => {
      expect(isAngleInSemiCircle(-Math.PI / 2, "bottom")).toBe(true);
    });

    it("should return true for angle 0 (right)", () => {
      expect(isAngleInSemiCircle(0, "bottom")).toBe(true);
    });

    it("should return false for angle PI/2 (down in screen coords)", () => {
      expect(isAngleInSemiCircle(Math.PI / 2, "bottom")).toBe(false);
    });
  });

  describe("right semi-circle (-PI/2 to PI/2)", () => {
    it("should return true for angle 0 (right)", () => {
      expect(isAngleInSemiCircle(0, "right")).toBe(true);
    });

    it("should return true for angle PI/4 (down-right)", () => {
      expect(isAngleInSemiCircle(Math.PI / 4, "right")).toBe(true);
    });

    it("should return false for angle PI (left)", () => {
      expect(isAngleInSemiCircle(Math.PI, "right")).toBe(false);
    });
  });

  describe("left semi-circle (PI/2 to -PI/2, wrapping)", () => {
    it("should return true for angle PI (left)", () => {
      expect(isAngleInSemiCircle(Math.PI, "left")).toBe(true);
    });

    it("should return true for angle -PI (left, negative)", () => {
      expect(isAngleInSemiCircle(-Math.PI, "left")).toBe(true);
    });

    it("should return true for angle 3*PI/4 (up-left)", () => {
      expect(isAngleInSemiCircle((3 * Math.PI) / 4, "left")).toBe(true);
    });

    it("should return false for angle 0 (right)", () => {
      expect(isAngleInSemiCircle(0, "left")).toBe(false);
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
