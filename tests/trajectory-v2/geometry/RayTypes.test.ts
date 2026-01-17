/**
 * Tests for the unified Ray type definition.
 *
 * TDD: These tests define the expected Ray interface with:
 * - source: Vector2 (ray origin)
 * - target: Vector2 (point defining direction)
 * - startRatio?: number (optional, where ray starts)
 */

import { describe, it, expect } from "vitest";
import type { Ray } from "@/trajectory-v2/geometry/types";

describe("Ray type", () => {
  describe("basic properties", () => {
    it("should have source and target properties", () => {
      const ray: Ray = { source: { x: 0, y: 0 }, target: { x: 1, y: 1 } };
      expect(ray.source).toEqual({ x: 0, y: 0 });
      expect(ray.target).toEqual({ x: 1, y: 1 });
    });

    it("should work with negative coordinates", () => {
      const ray: Ray = { source: { x: -10, y: -20 }, target: { x: -5, y: 15 } };
      expect(ray.source.x).toBe(-10);
      expect(ray.source.y).toBe(-20);
      expect(ray.target.x).toBe(-5);
      expect(ray.target.y).toBe(15);
    });

    it("should work with floating point coordinates", () => {
      const ray: Ray = { source: { x: 1.5, y: 2.7 }, target: { x: 3.14159, y: 2.71828 } };
      expect(ray.source.x).toBe(1.5);
      expect(ray.target.x).toBe(3.14159);
    });
  });

  describe("startRatio property", () => {
    it("should support optional startRatio", () => {
      const ray: Ray = { source: { x: 0, y: 0 }, target: { x: 1, y: 1 }, startRatio: 0.5 };
      expect(ray.startRatio).toBe(0.5);
    });

    it("should default startRatio to undefined when not provided", () => {
      const ray: Ray = { source: { x: 0, y: 0 }, target: { x: 1, y: 1 } };
      expect(ray.startRatio).toBeUndefined();
    });

    it("should accept startRatio of 0", () => {
      const ray: Ray = { source: { x: 0, y: 0 }, target: { x: 1, y: 1 }, startRatio: 0 };
      expect(ray.startRatio).toBe(0);
    });

    it("should accept startRatio of 1", () => {
      const ray: Ray = { source: { x: 0, y: 0 }, target: { x: 1, y: 1 }, startRatio: 1 };
      expect(ray.startRatio).toBe(1);
    });

    it("should accept startRatio greater than 1", () => {
      // For rays that start beyond the target point
      const ray: Ray = { source: { x: 0, y: 0 }, target: { x: 1, y: 1 }, startRatio: 1.5 };
      expect(ray.startRatio).toBe(1.5);
    });
  });

  describe("immutability", () => {
    it("should have readonly properties", () => {
      const ray: Ray = { source: { x: 0, y: 0 }, target: { x: 1, y: 1 } };

      // TypeScript should prevent these assignments at compile time
      // At runtime, we can verify the values are as expected
      expect(ray.source).toEqual({ x: 0, y: 0 });
      expect(ray.target).toEqual({ x: 1, y: 1 });
    });
  });
});
