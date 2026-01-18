/**
 * Tests for ConeProjectionV2 with Range Limit.
 *
 * TDD: Tests written first, then implementation.
 */

import { describe, it, expect } from "vitest";
import { projectConeV2, createFullCone } from "@/trajectory-v2/visibility/ConeProjectionV2";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import { createRangeLimitPair } from "@/trajectory-v2/obstacles/RangeLimit";

describe("ConeProjectionV2 with Range Limit", () => {
  describe("ray termination at range limit", () => {
    it("should terminate rays at range limit distance", () => {
      const origin = { x: 400, y: 300 };
      const cone = createFullCone(origin);
      const bounds = { minX: 0, minY: 0, maxX: 800, maxY: 600 };
      const chains = [createScreenBoundaryChain(bounds)];
      const rangeLimitPair = createRangeLimitPair(100);
      const rangeLimit = { pair: rangeLimitPair, center: origin };
      
      const sourcePoints = projectConeV2(cone, chains, undefined, undefined, undefined, rangeLimit);
      
      // All points should be within 100px of origin (with small tolerance)
      for (const sp of sourcePoints) {
        const pos = sp.computeXY();
        const dist = Math.sqrt((pos.x - origin.x) ** 2 + (pos.y - origin.y) ** 2);
        expect(dist).toBeLessThanOrEqual(101); // Small tolerance for floating point
      }
    });

    it("should project to screen boundaries when no range limit", () => {
      const origin = { x: 400, y: 300 };
      const cone = createFullCone(origin);
      const bounds = { minX: 0, minY: 0, maxX: 800, maxY: 600 };
      const chains = [createScreenBoundaryChain(bounds)];
      
      // No range limit
      const sourcePoints = projectConeV2(cone, chains);
      
      // At least some points should be at screen boundaries (far from origin)
      let hasDistantPoint = false;
      for (const sp of sourcePoints) {
        const pos = sp.computeXY();
        const dist = Math.sqrt((pos.x - origin.x) ** 2 + (pos.y - origin.y) ** 2);
        if (dist > 200) {
          hasDistantPoint = true;
          break;
        }
      }
      expect(hasDistantPoint).toBe(true);
    });

    it("should produce a circular visibility region with range limit", () => {
      const origin = { x: 400, y: 300 };
      const cone = createFullCone(origin);
      const bounds = { minX: 0, minY: 0, maxX: 800, maxY: 600 };
      const chains = [createScreenBoundaryChain(bounds)];
      const rangeLimitPair = createRangeLimitPair(100);
      const rangeLimit = { pair: rangeLimitPair, center: origin };
      
      const sourcePoints = projectConeV2(cone, chains, undefined, undefined, undefined, rangeLimit);
      
      // With a 100px range limit inside an 800x600 screen, all points should hit range limit
      // So all points should be exactly at distance 100 (or very close)
      const rangeLimitHitCount = sourcePoints.filter(sp => {
        const pos = sp.computeXY();
        const dist = Math.sqrt((pos.x - origin.x) ** 2 + (pos.y - origin.y) ** 2);
        return Math.abs(dist - 100) < 1;
      }).length;
      
      // All or most points should hit range limit (not screen boundary)
      expect(rangeLimitHitCount).toBeGreaterThan(sourcePoints.length * 0.9);
    });
  });
});
