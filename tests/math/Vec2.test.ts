import { Vec2 } from "@/math/Vec2";
import { describe, expect, it } from "vitest";

describe("Vec2", () => {
  describe("create", () => {
    it("should create a vector with given coordinates", () => {
      const v = Vec2.create(3, 4);
      expect(v).toEqual({ x: 3, y: 4 });
    });
  });

  describe("add", () => {
    it("should add two vectors", () => {
      const a = { x: 1, y: 2 };
      const b = { x: 3, y: 4 };
      expect(Vec2.add(a, b)).toEqual({ x: 4, y: 6 });
    });

    it("should handle negative values", () => {
      const a = { x: -1, y: 2 };
      const b = { x: 3, y: -4 };
      expect(Vec2.add(a, b)).toEqual({ x: 2, y: -2 });
    });

    it("should handle zero vectors", () => {
      const a = { x: 0, y: 0 };
      const b = { x: 5, y: 5 };
      expect(Vec2.add(a, b)).toEqual({ x: 5, y: 5 });
    });
  });

  describe("subtract", () => {
    it("should subtract two vectors", () => {
      const a = { x: 5, y: 7 };
      const b = { x: 2, y: 3 };
      expect(Vec2.subtract(a, b)).toEqual({ x: 3, y: 4 });
    });
  });

  describe("scale", () => {
    it("should scale a vector by a scalar", () => {
      const v = { x: 2, y: 3 };
      expect(Vec2.scale(v, 2)).toEqual({ x: 4, y: 6 });
    });

    it("should handle zero scalar", () => {
      const v = { x: 5, y: 10 };
      expect(Vec2.scale(v, 0)).toEqual({ x: 0, y: 0 });
    });

    it("should handle negative scalar", () => {
      const v = { x: 2, y: 3 };
      expect(Vec2.scale(v, -1)).toEqual({ x: -2, y: -3 });
    });
  });

  describe("dot", () => {
    it("should calculate dot product", () => {
      const a = { x: 1, y: 2 };
      const b = { x: 3, y: 4 };
      expect(Vec2.dot(a, b)).toBe(11); // 1*3 + 2*4
    });

    it("should return zero for perpendicular vectors", () => {
      const a = { x: 1, y: 0 };
      const b = { x: 0, y: 1 };
      expect(Vec2.dot(a, b)).toBe(0);
    });
  });

  describe("lengthSquared", () => {
    it("should calculate squared length", () => {
      const v = { x: 3, y: 4 };
      expect(Vec2.lengthSquared(v)).toBe(25); // 9 + 16
    });
  });

  describe("length", () => {
    it("should calculate vector length", () => {
      const v = { x: 3, y: 4 };
      expect(Vec2.length(v)).toBe(5); // 3-4-5 triangle
    });

    it("should return zero for zero vector", () => {
      const v = { x: 0, y: 0 };
      expect(Vec2.length(v)).toBe(0);
    });
  });

  describe("normalize", () => {
    it("should normalize a vector to unit length", () => {
      const v = { x: 3, y: 4 };
      const normalized = Vec2.normalize(v);
      expect(normalized.x).toBeCloseTo(0.6);
      expect(normalized.y).toBeCloseTo(0.8);
      expect(Vec2.length(normalized)).toBeCloseTo(1);
    });

    it("should handle zero vector", () => {
      const v = { x: 0, y: 0 };
      expect(Vec2.normalize(v)).toEqual({ x: 0, y: 0 });
    });

    it("should handle already normalized vector", () => {
      const v = { x: 1, y: 0 };
      const normalized = Vec2.normalize(v);
      expect(normalized).toEqual({ x: 1, y: 0 });
    });
  });

  describe("perpendicular", () => {
    it("should return perpendicular vector (90° counter-clockwise)", () => {
      const v = { x: 1, y: 0 };
      const perp = Vec2.perpendicular(v);
      expect(perp.x).toBeCloseTo(0);
      expect(perp.y).toBeCloseTo(1);
    });

    it("should be perpendicular (dot product = 0)", () => {
      const v = { x: 3, y: 7 };
      const perp = Vec2.perpendicular(v);
      expect(Vec2.dot(v, perp)).toBeCloseTo(0);
    });
  });

  describe("distance", () => {
    it("should calculate distance between points", () => {
      const a = { x: 0, y: 0 };
      const b = { x: 3, y: 4 };
      expect(Vec2.distance(a, b)).toBe(5);
    });

    it("should return zero for same point", () => {
      const a = { x: 5, y: 5 };
      expect(Vec2.distance(a, a)).toBe(0);
    });
  });

  describe("direction", () => {
    it("should return normalized direction vector", () => {
      const from = { x: 0, y: 0 };
      const to = { x: 10, y: 0 };
      expect(Vec2.direction(from, to)).toEqual({ x: 1, y: 0 });
    });

    it("should return normalized vector for diagonal", () => {
      const from = { x: 0, y: 0 };
      const to = { x: 3, y: 4 };
      const dir = Vec2.direction(from, to);
      expect(dir.x).toBeCloseTo(0.6);
      expect(dir.y).toBeCloseTo(0.8);
    });
  });

  describe("reflect", () => {
    it("should reflect vector off horizontal surface", () => {
      const direction = Vec2.normalize({ x: 1, y: 1 }); // 45° down-right
      const normal = { x: 0, y: -1 }; // Pointing up
      const reflected = Vec2.reflect(direction, normal);

      expect(reflected.x).toBeCloseTo(direction.x);
      expect(reflected.y).toBeCloseTo(-direction.y);
    });

    it("should reflect vector off vertical surface", () => {
      const direction = Vec2.normalize({ x: 1, y: 1 });
      const normal = { x: -1, y: 0 }; // Pointing left
      const reflected = Vec2.reflect(direction, normal);

      expect(reflected.x).toBeCloseTo(-direction.x);
      expect(reflected.y).toBeCloseTo(direction.y);
    });

    it("should preserve magnitude for normalized input", () => {
      const direction = Vec2.normalize({ x: 3, y: 4 });
      const normal = Vec2.normalize({ x: 1, y: 1 });
      const reflected = Vec2.reflect(direction, normal);

      expect(Vec2.length(reflected)).toBeCloseTo(1);
    });

    it("should handle head-on collision (reverse direction)", () => {
      const direction = { x: 1, y: 0 };
      const normal = { x: -1, y: 0 }; // Facing the direction
      const reflected = Vec2.reflect(direction, normal);

      expect(reflected.x).toBeCloseTo(-1);
      expect(reflected.y).toBeCloseTo(0);
    });
  });

  describe("zero", () => {
    it("should return zero vector", () => {
      expect(Vec2.zero()).toEqual({ x: 0, y: 0 });
    });
  });
});
