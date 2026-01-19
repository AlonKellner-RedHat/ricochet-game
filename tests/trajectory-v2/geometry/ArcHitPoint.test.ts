/**
 * Tests for ArcHitPoint SourcePoint subtype.
 *
 * TDD: Tests written first, then implementation.
 */

import { describe, it, expect } from "vitest";
import {
  ArcHitPoint,
  isArcHitPoint,
  OriginPoint,
} from "@/trajectory-v2/geometry/SourcePoint";

describe("ArcHitPoint", () => {
  describe("construction and computeXY", () => {
    it("should store and return the position", () => {
      const pos = { x: 100, y: 200 };
      const point = new ArcHitPoint(pos);
      
      expect(point.computeXY()).toEqual(pos);
    });

    it("should have type 'arc_hit'", () => {
      const point = new ArcHitPoint({ x: 0, y: 0 });
      
      expect(point.type).toBe("arc_hit");
    });
  });

  describe("isArcHitPoint type guard", () => {
    it("should return true for ArcHitPoint", () => {
      const point = new ArcHitPoint({ x: 50, y: 75 });
      
      expect(isArcHitPoint(point)).toBe(true);
    });

    it("should return false for OriginPoint", () => {
      const point = new OriginPoint({ x: 50, y: 75 });
      
      expect(isArcHitPoint(point)).toBe(false);
    });
  });

  describe("equals", () => {
    it("should return true for same position", () => {
      const a = new ArcHitPoint({ x: 100, y: 200 });
      const b = new ArcHitPoint({ x: 100, y: 200 });
      
      expect(a.equals(b)).toBe(true);
    });

    it("should return false for different position", () => {
      const a = new ArcHitPoint({ x: 100, y: 200 });
      const b = new ArcHitPoint({ x: 100, y: 201 });
      
      expect(a.equals(b)).toBe(false);
    });

    it("should return false when compared to OriginPoint at same position", () => {
      const arcHitPoint = new ArcHitPoint({ x: 100, y: 200 });
      const originPoint = new OriginPoint({ x: 100, y: 200 });
      
      expect(arcHitPoint.equals(originPoint)).toBe(false);
    });
  });

  describe("getKey", () => {
    it("should return unique key with arc_hit prefix", () => {
      const point = new ArcHitPoint({ x: 123, y: 456 });
      
      expect(point.getKey()).toBe("arc_hit:123,456");
    });
  });

  describe("blocking behavior", () => {
    it("should never block (like OriginPoint)", () => {
      const point = new ArcHitPoint({ x: 0, y: 0 });
      
      expect(point.isBlocking(new Map())).toBe(false);
    });
  });
});
