/**
 * ArcJunctionPoint.test.ts
 *
 * Tests for ArcJunctionPoint - a SourcePoint representing where semi-circles meet.
 *
 * Arc junctions are:
 * - Ray TARGETS (rays are cast TO them, like JunctionPoints)
 * - Always blocking (no continuation rays)
 * - Located at the boundaries where two semi-circles connect
 *
 * For horizontal orientation (top/bottom):
 * - Left junction: (center.x - radius, center.y)
 * - Right junction: (center.x + radius, center.y)
 *
 * For vertical orientation (left/right):
 * - Top junction: (center.x, center.y - radius)
 * - Bottom junction: (center.x, center.y + radius)
 */

import { describe, expect, it } from "vitest";
import {
  ArcJunctionPoint,
  isArcJunctionPoint,
  OriginPoint,
  ArcHitPoint,
} from "@/trajectory-v2/geometry/SourcePoint";

describe("ArcJunctionPoint", () => {
  describe("construction", () => {
    it("should create horizontal left junction", () => {
      const junction = new ArcJunctionPoint(
        { x: 300, y: 400 }, // center.x - radius
        "top",
        "bottom",
        "left"
      );

      expect(junction.computeXY()).toEqual({ x: 300, y: 400 });
      expect(junction.half1).toBe("top");
      expect(junction.half2).toBe("bottom");
      expect(junction.boundary).toBe("left");
    });

    it("should create horizontal right junction", () => {
      const junction = new ArcJunctionPoint(
        { x: 500, y: 400 }, // center.x + radius
        "top",
        "bottom",
        "right"
      );

      expect(junction.computeXY()).toEqual({ x: 500, y: 400 });
      expect(junction.boundary).toBe("right");
    });

    it("should create vertical top junction", () => {
      const junction = new ArcJunctionPoint(
        { x: 400, y: 200 }, // center.y - radius
        "left",
        "right",
        "top"
      );

      expect(junction.computeXY()).toEqual({ x: 400, y: 200 });
      expect(junction.boundary).toBe("top");
    });

    it("should create vertical bottom junction", () => {
      const junction = new ArcJunctionPoint(
        { x: 400, y: 500 }, // center.y + radius
        "left",
        "right",
        "bottom"
      );

      expect(junction.computeXY()).toEqual({ x: 400, y: 500 });
      expect(junction.boundary).toBe("bottom");
    });
  });

  describe("type property", () => {
    it("should have type 'arc_junction'", () => {
      const junction = new ArcJunctionPoint(
        { x: 300, y: 400 },
        "top",
        "bottom",
        "left"
      );

      expect(junction.type).toBe("arc_junction");
    });
  });

  describe("isArcJunctionPoint type guard", () => {
    it("should return true for ArcJunctionPoint", () => {
      const junction = new ArcJunctionPoint(
        { x: 300, y: 400 },
        "top",
        "bottom",
        "left"
      );

      expect(isArcJunctionPoint(junction)).toBe(true);
    });

    it("should return false for OriginPoint", () => {
      const point = new OriginPoint({ x: 300, y: 400 });

      expect(isArcJunctionPoint(point)).toBe(false);
    });

    it("should return false for ArcHitPoint", () => {
      const point = new ArcHitPoint({ x: 300, y: 400 });

      expect(isArcJunctionPoint(point)).toBe(false);
    });
  });

  describe("getKey", () => {
    it("should return unique key with arc_junction prefix and boundary", () => {
      const left = new ArcJunctionPoint({ x: 300, y: 400 }, "top", "bottom", "left");
      const right = new ArcJunctionPoint({ x: 500, y: 400 }, "top", "bottom", "right");

      expect(left.getKey()).toBe("arc_junction:left");
      expect(right.getKey()).toBe("arc_junction:right");
      expect(left.getKey()).not.toBe(right.getKey());
    });
  });

  describe("blocking behavior", () => {
    it("should always block (like surface junctions)", () => {
      const junction = new ArcJunctionPoint(
        { x: 300, y: 400 },
        "top",
        "bottom",
        "left"
      );

      expect(junction.isBlocking(new Map())).toBe(true);
    });
  });

  describe("equals", () => {
    it("should return true for same boundary", () => {
      const j1 = new ArcJunctionPoint({ x: 300, y: 400 }, "top", "bottom", "left");
      const j2 = new ArcJunctionPoint({ x: 300, y: 400 }, "top", "bottom", "left");

      expect(j1.equals(j2)).toBe(true);
    });

    it("should return false for different boundaries", () => {
      const left = new ArcJunctionPoint({ x: 300, y: 400 }, "top", "bottom", "left");
      const right = new ArcJunctionPoint({ x: 500, y: 400 }, "top", "bottom", "right");

      expect(left.equals(right)).toBe(false);
    });
  });

  describe("getExcludedSurfaceIds", () => {
    it("should return empty array (arc junctions are not on surfaces)", () => {
      const junction = new ArcJunctionPoint(
        { x: 300, y: 400 },
        "top",
        "bottom",
        "left"
      );

      expect(junction.getExcludedSurfaceIds()).toEqual([]);
    });
  });

  describe("isOnSurface", () => {
    it("should return false for any surface (arc junctions are not on surfaces)", () => {
      const junction = new ArcJunctionPoint(
        { x: 300, y: 400 },
        "top",
        "bottom",
        "left"
      );

      const mockSurface = {
        id: "test-surface",
        segment: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
      } as any;

      expect(junction.isOnSurface(mockSurface)).toBe(false);
    });
  });
});
