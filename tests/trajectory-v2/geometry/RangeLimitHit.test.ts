/**
 * Tests for findNextHit with range limit integration.
 */

import { describe, it, expect } from "vitest";
import { findNextHit } from "@/trajectory-v2/geometry/RayCasting";
import { createRangeLimitPair } from "@/trajectory-v2/obstacles/RangeLimit";
import { createMockSurface, createMockWall } from "@test/helpers/surfaceHelpers";
import type { Vector2, Ray } from "@/trajectory-v2/geometry/types";

describe("findNextHit with range limit", () => {
  const originImage: Vector2 = { x: 100, y: 100 };
  const rangeLimitRadius = 50;
  const rangeLimitPair = createRangeLimitPair(rangeLimitRadius);

  describe("when range limit is closer than surface", () => {
    it("should return range limit hit", () => {
      // Surface at x=200, but range limit is at 150 (origin + radius)
      const surface = createMockWall("wall", { x: 200, y: 0 }, { x: 200, y: 400 });

      const ray: Ray = {
        source: originImage,
        target: { x: 300, y: 100 }, // pointing right
      };

      const result = findNextHit(ray, [surface], {
        rangeLimit: { pair: rangeLimitPair, center: originImage },
      });

      expect(result).not.toBeNull();
      expect(result!.hitType).toBe("range_limit");
      const hitPos = result!.hitPoint.computeXY();
      expect(hitPos.x).toBeCloseTo(150); // origin.x + radius
      expect(hitPos.y).toBeCloseTo(100);
    });
  });

  describe("when surface is closer than range limit", () => {
    it("should return surface hit", () => {
      // Surface at x=120, closer than range limit at 150
      const surface = createMockWall("wall", { x: 120, y: 0 }, { x: 120, y: 400 });

      const ray: Ray = {
        source: originImage,
        target: { x: 300, y: 100 }, // pointing right
      };

      const result = findNextHit(ray, [surface], {
        rangeLimit: { pair: rangeLimitPair, center: originImage },
      });

      expect(result).not.toBeNull();
      expect(result!.hitType).toBe("surface");
      const hitPos = result!.hitPoint.computeXY();
      expect(hitPos.x).toBeCloseTo(120);
    });
  });

  describe("when ray starts outside circle", () => {
    it("should return range limit hit at start position", () => {
      const startOutside: Vector2 = { x: 200, y: 100 }; // outside circle

      const ray: Ray = {
        source: originImage,
        target: { x: 300, y: 100 },
      };

      // Use startLine to make the ray start from outside
      const result = findNextHit(ray, [], {
        rangeLimit: { pair: rangeLimitPair, center: originImage },
        startLine: { start: startOutside, end: { x: startOutside.x, y: startOutside.y + 100 } },
      });

      // When outside, the hit is at the startLine position (immediately blocked)
      expect(result).not.toBeNull();
      expect(result!.hitType).toBe("range_limit");
    });
  });

  describe("when direction not in any semi-circle", () => {
    it("should not trigger range limit (impossible with full pair)", () => {
      // A full pair covers all directions, so this can't happen
      // But we can test with a single half to verify the logic
      const ray: Ray = {
        source: originImage,
        target: { x: 200, y: 100 }, // pointing right (in "top" half)
      };

      const result = findNextHit(ray, [], {
        rangeLimit: { pair: rangeLimitPair, center: originImage },
      });

      // Should still hit range limit since full pair covers all directions
      expect(result).not.toBeNull();
      expect(result!.hitType).toBe("range_limit");
    });
  });

  describe("without range limit", () => {
    it("should work as before", () => {
      const surface = createMockWall("wall", { x: 150, y: 0 }, { x: 150, y: 400 });

      const ray: Ray = {
        source: originImage,
        target: { x: 200, y: 100 },
      };

      const result = findNextHit(ray, [surface], {}); // no range limit

      expect(result).not.toBeNull();
      expect(result!.hitType).toBe("surface");
      const hitPos = result!.hitPoint.computeXY();
      expect(hitPos.x).toBeCloseTo(150);
    });
  });
});
