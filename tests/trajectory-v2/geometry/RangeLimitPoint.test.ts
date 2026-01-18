/**
 * Tests for RangeLimitPoint SourcePoint subtype.
 *
 * TDD: Tests written first, then implementation.
 */

import { describe, it, expect } from "vitest";
import {
  RangeLimitPoint,
  isRangeLimitPoint,
  OriginPoint,
} from "@/trajectory-v2/geometry/SourcePoint";

describe("RangeLimitPoint", () => {
  describe("construction and computeXY", () => {
    it("should store and return the position", () => {
      const pos = { x: 100, y: 200 };
      const point = new RangeLimitPoint(pos);
      
      expect(point.computeXY()).toEqual(pos);
    });

    it("should have type 'range_limit'", () => {
      const point = new RangeLimitPoint({ x: 0, y: 0 });
      
      expect(point.type).toBe("range_limit");
    });
  });

  describe("isRangeLimitPoint type guard", () => {
    it("should return true for RangeLimitPoint", () => {
      const point = new RangeLimitPoint({ x: 50, y: 75 });
      
      expect(isRangeLimitPoint(point)).toBe(true);
    });

    it("should return false for OriginPoint", () => {
      const point = new OriginPoint({ x: 50, y: 75 });
      
      expect(isRangeLimitPoint(point)).toBe(false);
    });
  });

  describe("equals", () => {
    it("should return true for same position", () => {
      const a = new RangeLimitPoint({ x: 100, y: 200 });
      const b = new RangeLimitPoint({ x: 100, y: 200 });
      
      expect(a.equals(b)).toBe(true);
    });

    it("should return false for different position", () => {
      const a = new RangeLimitPoint({ x: 100, y: 200 });
      const b = new RangeLimitPoint({ x: 100, y: 201 });
      
      expect(a.equals(b)).toBe(false);
    });

    it("should return false when compared to OriginPoint at same position", () => {
      const rangeLimitPoint = new RangeLimitPoint({ x: 100, y: 200 });
      const originPoint = new OriginPoint({ x: 100, y: 200 });
      
      expect(rangeLimitPoint.equals(originPoint)).toBe(false);
    });
  });

  describe("getKey", () => {
    it("should return unique key with range_limit prefix", () => {
      const point = new RangeLimitPoint({ x: 123, y: 456 });
      
      expect(point.getKey()).toBe("range_limit:123,456");
    });
  });

  describe("blocking behavior", () => {
    it("should never block (like OriginPoint)", () => {
      const point = new RangeLimitPoint({ x: 0, y: 0 });
      
      expect(point.isBlocking(new Map())).toBe(false);
    });
  });
});
