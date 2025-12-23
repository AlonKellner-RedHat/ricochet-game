/**
 * Tests for ConeSection operations
 */

import { describe, it, expect } from "vitest";
import {
  normalizeAngle,
  angleToPoint,
  isAngleInSection,
  sectionSpan,
  fullCone,
  emptyCone,
  sectionFromSegment,
  subtractFromSection,
  blockCone,
  trimCone,
  intersectSections,
  reflectCone,
  mergeSections,
  isConeEmpty,
  coneCoverage,
  type ConeSection,
  type Cone,
} from "@/trajectory-v2/visibility/ConeSection";

describe("ConeSection", () => {
  describe("normalizeAngle", () => {
    it("should normalize positive angles", () => {
      expect(normalizeAngle(0)).toBeCloseTo(0, 5);
      expect(normalizeAngle(Math.PI)).toBeCloseTo(Math.PI, 5);
      expect(normalizeAngle(2 * Math.PI)).toBeCloseTo(0, 5);
      expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI, 5);
    });

    it("should normalize negative angles", () => {
      expect(normalizeAngle(-Math.PI / 2)).toBeCloseTo(3 * Math.PI / 2, 5);
      expect(normalizeAngle(-Math.PI)).toBeCloseTo(Math.PI, 5);
    });
  });

  describe("angleToPoint", () => {
    it("should calculate angle from origin to point", () => {
      const origin = { x: 0, y: 0 };
      
      // Right (+X)
      expect(angleToPoint(origin, { x: 1, y: 0 })).toBeCloseTo(0, 5);
      
      // Up (+Y in screen coords, but atan2 is counter-clockwise)
      expect(angleToPoint(origin, { x: 0, y: 1 })).toBeCloseTo(Math.PI / 2, 5);
      
      // Left (-X)
      expect(angleToPoint(origin, { x: -1, y: 0 })).toBeCloseTo(Math.PI, 5);
      
      // Down (-Y)
      expect(angleToPoint(origin, { x: 0, y: -1 })).toBeCloseTo(3 * Math.PI / 2, 5);
    });

    it("should work with non-origin points", () => {
      const origin = { x: 100, y: 100 };
      expect(angleToPoint(origin, { x: 200, y: 100 })).toBeCloseTo(0, 5);
      expect(angleToPoint(origin, { x: 100, y: 200 })).toBeCloseTo(Math.PI / 2, 5);
    });
  });

  describe("isAngleInSection", () => {
    it("should detect angle in non-wrapping section", () => {
      const section: ConeSection = { startAngle: 0, endAngle: Math.PI / 2 };
      
      expect(isAngleInSection(0, section)).toBe(true);
      expect(isAngleInSection(Math.PI / 4, section)).toBe(true);
      expect(isAngleInSection(Math.PI / 2, section)).toBe(true);
      expect(isAngleInSection(Math.PI, section)).toBe(false);
    });

    it("should detect angle at boundaries", () => {
      const section: ConeSection = { startAngle: 0, endAngle: Math.PI };
      
      expect(isAngleInSection(0, section)).toBe(true);
      expect(isAngleInSection(Math.PI, section)).toBe(true);
      expect(isAngleInSection(Math.PI / 2, section)).toBe(true);
      expect(isAngleInSection(3 * Math.PI / 2, section)).toBe(false);
    });
  });

  describe("sectionSpan", () => {
    it("should calculate span for non-wrapping section", () => {
      const section: ConeSection = { startAngle: 0, endAngle: Math.PI / 2 };
      expect(sectionSpan(section)).toBeCloseTo(Math.PI / 2, 5);
    });

    it("should calculate span for large section", () => {
      const section: ConeSection = { startAngle: 0, endAngle: 3 * Math.PI / 2 };
      expect(sectionSpan(section)).toBeCloseTo(3 * Math.PI / 2, 5);
    });
  });

  describe("fullCone and emptyCone", () => {
    it("should create a full cone covering almost 360°", () => {
      const cone = fullCone();
      expect(cone.length).toBe(1);
      expect(coneCoverage(cone)).toBeCloseTo(2 * Math.PI, 3);
    });

    it("should create an empty cone", () => {
      const cone = emptyCone();
      expect(cone.length).toBe(0);
      expect(isConeEmpty(cone)).toBe(true);
    });
  });

  describe("sectionFromSegment", () => {
    it("should create section from horizontal segment", () => {
      const origin = { x: 0, y: 0 };
      const section = sectionFromSegment(
        origin,
        { x: 100, y: 50 },
        { x: 100, y: -50 }
      );
      
      expect(section).not.toBeNull();
      if (section) {
        const span = sectionSpan(section);
        expect(span).toBeGreaterThan(0);
        expect(span).toBeLessThan(Math.PI);
      }
    });
  });

  describe("subtractFromSection", () => {
    it("should remove middle portion of section", () => {
      const section: ConeSection = { startAngle: 0, endAngle: Math.PI };
      const result = subtractFromSection(section, Math.PI / 4, Math.PI * 3 / 4);
      
      expect(result.length).toBe(2);
    });

    it("should remove start portion of section", () => {
      const section: ConeSection = { startAngle: 0, endAngle: Math.PI };
      const result = subtractFromSection(section, 0, Math.PI / 4);
      
      expect(result.length).toBe(1);
      expect(result[0]!.startAngle).toBeCloseTo(Math.PI / 4, 5);
    });

    it("should remove end portion of section", () => {
      const section: ConeSection = { startAngle: 0, endAngle: Math.PI };
      const result = subtractFromSection(section, Math.PI * 3 / 4, Math.PI);
      
      expect(result.length).toBe(1);
      expect(result[0]!.endAngle).toBeCloseTo(Math.PI * 3 / 4, 5);
    });

    it("should return empty when entire section is removed", () => {
      const section: ConeSection = { startAngle: Math.PI / 4, endAngle: Math.PI / 2 };
      const result = subtractFromSection(section, 0, Math.PI);
      
      expect(result.length).toBe(0);
    });

    it("should return original when no overlap", () => {
      const section: ConeSection = { startAngle: 0, endAngle: Math.PI / 2 };
      const result = subtractFromSection(section, Math.PI, 3 * Math.PI / 2);
      
      expect(result.length).toBe(1);
      expect(result[0]).toEqual(section);
    });
  });

  describe("blockCone", () => {
    it("should block portion of cone by obstacle segment", () => {
      const origin = { x: 0, y: 0 };
      const cone = fullCone();
      
      // Block a vertical segment to the right
      const blocked = blockCone(
        cone,
        origin,
        { x: 100, y: -50 },
        { x: 100, y: 50 }
      );
      
      // Should have split the cone
      expect(blocked.length).toBeGreaterThanOrEqual(1);
      expect(coneCoverage(blocked)).toBeLessThan(coneCoverage(cone));
    });
  });

  describe("trimCone", () => {
    it("should trim cone to only pass through window", () => {
      const origin = { x: 0, y: 0 };
      const cone = fullCone();
      
      // Window in front of origin
      const trimmed = trimCone(
        cone,
        origin,
        { x: 100, y: -50 },
        { x: 100, y: 50 }
      );
      
      expect(trimmed.length).toBe(1);
      expect(coneCoverage(trimmed)).toBeLessThan(Math.PI);
    });

    it("should return empty if window not in cone", () => {
      // Cone only points right, window is to the left
      const cone: Cone = [{ startAngle: -Math.PI / 4, endAngle: Math.PI / 4 }];
      const origin = { x: 0, y: 0 };
      
      const trimmed = trimCone(
        cone,
        origin,
        { x: -100, y: -50 },
        { x: -100, y: 50 }
      );
      
      expect(trimmed.length).toBe(0);
    });
  });

  describe("intersectSections", () => {
    it("should find overlap of two sections", () => {
      const a: ConeSection = { startAngle: 0, endAngle: Math.PI };
      const b: ConeSection = { startAngle: Math.PI / 2, endAngle: 3 * Math.PI / 2 };
      
      const result = intersectSections(a, b);
      expect(result).not.toBeNull();
      if (result) {
        expect(result.startAngle).toBeCloseTo(Math.PI / 2, 5);
        expect(result.endAngle).toBeCloseTo(Math.PI, 5);
      }
    });

    it("should return null for non-overlapping sections", () => {
      const a: ConeSection = { startAngle: 0, endAngle: Math.PI / 4 };
      const b: ConeSection = { startAngle: Math.PI / 2, endAngle: Math.PI };
      
      const result = intersectSections(a, b);
      expect(result).toBeNull();
    });
  });

  describe("reflectCone", () => {
    it("should reflect cone through horizontal line", () => {
      // Cone pointing up
      const cone: Cone = [{ startAngle: Math.PI / 4, endAngle: 3 * Math.PI / 4 }];
      
      // Horizontal line at y = 0
      const reflected = reflectCone(cone, { x: 0, y: 0 }, { x: 100, y: 0 });
      
      expect(reflected.length).toBe(1);
      // Should now point down
      const midAngle = (reflected[0]!.startAngle + reflected[0]!.endAngle) / 2;
      expect(Math.sin(normalizeAngle(midAngle))).toBeLessThan(0);
    });
  });

  describe("mergeSections", () => {
    it("should merge overlapping sections", () => {
      const cone: Cone = [
        { startAngle: 0, endAngle: Math.PI / 2 },
        { startAngle: Math.PI / 4, endAngle: Math.PI },
      ];
      
      const merged = mergeSections(cone);
      expect(merged.length).toBe(1);
    });

    it("should not merge non-overlapping sections", () => {
      const cone: Cone = [
        { startAngle: 0, endAngle: Math.PI / 4 },
        { startAngle: Math.PI / 2, endAngle: Math.PI },
      ];
      
      const merged = mergeSections(cone);
      expect(merged.length).toBe(2);
    });
  });
});

