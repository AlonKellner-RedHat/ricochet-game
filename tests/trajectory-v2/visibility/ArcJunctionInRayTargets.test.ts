/**
 * ArcJunctionInRayTargets.test.ts
 *
 * Tests for ArcJunctionPoints being added to rayTargets.
 *
 * Arc junctions are the points where semi-circles meet (left/right for horizontal,
 * top/bottom for vertical orientation). They should be:
 * - Added as ray targets (rays are cast TO them)
 * - Included in the visibility polygon when visible
 * - Blocking (no continuation rays through them)
 */

import { describe, expect, it } from "vitest";
import {
  projectConeV2,
  createFullCone,
  type RangeLimitConfig,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import { createRangeLimitPair } from "@/trajectory-v2/obstacles/RangeLimit";
import { isArcJunctionPoint } from "@/trajectory-v2/geometry/SourcePoint";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

describe("Arc Junctions in Ray Targets", () => {
  const SCREEN_BOUNDS = { minX: 0, maxX: 800, minY: 0, maxY: 600 };
  const ORIGIN: Vector2 = { x: 400, y: 300 };
  const RANGE_LIMIT_RADIUS = 100;

  describe("visibility polygon with range limit", () => {
    it("should include ArcJunctionPoints in visibility polygon", () => {
      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
      const allChains = [screenChain];

      const rangeLimit: RangeLimitConfig = {
        pair: createRangeLimitPair(RANGE_LIMIT_RADIUS, "horizontal"),
        center: ORIGIN,
      };

      const cone = createFullCone(ORIGIN);
      const polygon = projectConeV2(
        cone,
        allChains,
        undefined,
        undefined,
        undefined,
        rangeLimit
      );

      // Get all ArcJunctionPoints from the polygon
      const arcJunctions = polygon.filter(isArcJunctionPoint);

      console.log("Total vertices:", polygon.length);
      console.log("ArcJunctionPoints:", arcJunctions.length);
      for (const aj of arcJunctions) {
        console.log("  Junction:", aj.getKey(), "at", aj.computeXY());
      }

      // For a horizontal orientation, there should be left and right arc junctions
      expect(arcJunctions.length).toBe(2);

      const boundaries = arcJunctions.map((aj) => aj.boundary);
      expect(boundaries).toContain("left");
      expect(boundaries).toContain("right");
    });

    it("should position arc junctions correctly for horizontal orientation", () => {
      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
      const allChains = [screenChain];

      const rangeLimit: RangeLimitConfig = {
        pair: createRangeLimitPair(RANGE_LIMIT_RADIUS, "horizontal"),
        center: ORIGIN,
      };

      const cone = createFullCone(ORIGIN);
      const polygon = projectConeV2(
        cone,
        allChains,
        undefined,
        undefined,
        undefined,
        rangeLimit
      );

      const arcJunctions = polygon.filter(isArcJunctionPoint);

      const left = arcJunctions.find((aj) => aj.boundary === "left");
      const right = arcJunctions.find((aj) => aj.boundary === "right");

      expect(left).toBeDefined();
      expect(right).toBeDefined();

      // Left junction should be at (center.x - radius, center.y)
      expect(left!.computeXY()).toEqual({
        x: ORIGIN.x - RANGE_LIMIT_RADIUS,
        y: ORIGIN.y,
      });

      // Right junction should be at (center.x + radius, center.y)
      expect(right!.computeXY()).toEqual({
        x: ORIGIN.x + RANGE_LIMIT_RADIUS,
        y: ORIGIN.y,
      });
    });

    it("should position arc junctions correctly for vertical orientation", () => {
      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
      const allChains = [screenChain];

      const rangeLimit: RangeLimitConfig = {
        pair: createRangeLimitPair(RANGE_LIMIT_RADIUS, "vertical"),
        center: ORIGIN,
      };

      const cone = createFullCone(ORIGIN);
      const polygon = projectConeV2(
        cone,
        allChains,
        undefined,
        undefined,
        undefined,
        rangeLimit
      );

      const arcJunctions = polygon.filter(isArcJunctionPoint);

      console.log("Vertical arc junctions:", arcJunctions.length);
      for (const aj of arcJunctions) {
        console.log("  Junction:", aj.getKey(), "at", aj.computeXY());
      }

      // For vertical orientation, there should be top and bottom arc junctions
      expect(arcJunctions.length).toBe(2);

      const top = arcJunctions.find((aj) => aj.boundary === "top");
      const bottom = arcJunctions.find((aj) => aj.boundary === "bottom");

      expect(top).toBeDefined();
      expect(bottom).toBeDefined();

      // Top junction should be at (center.x, center.y - radius)
      expect(top!.computeXY()).toEqual({
        x: ORIGIN.x,
        y: ORIGIN.y - RANGE_LIMIT_RADIUS,
      });

      // Bottom junction should be at (center.x, center.y + radius)
      expect(bottom!.computeXY()).toEqual({
        x: ORIGIN.x,
        y: ORIGIN.y + RANGE_LIMIT_RADIUS,
      });
    });
  });

  describe("no range limit", () => {
    it("should not include ArcJunctionPoints when there is no range limit", () => {
      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
      const allChains = [screenChain];

      const cone = createFullCone(ORIGIN);
      const polygon = projectConeV2(cone, allChains);

      const arcJunctions = polygon.filter(isArcJunctionPoint);
      expect(arcJunctions.length).toBe(0);
    });
  });
});
