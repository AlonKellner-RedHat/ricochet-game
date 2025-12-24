/**
 * RaySector Tests - Exact Matching and Reversibility
 *
 * These tests verify the ray-based sector operations are:
 * 1. EXACT - No epsilon dependency, use .toBe() not .toBeCloseTo()
 * 2. REVERSIBLE - reflect(reflect(s, line), line) === s
 * 3. REPRODUCIBLE - Same inputs always produce identical outputs
 */

import { describe, it, expect } from "vitest";
import {
  createFullSector,
  isFullSector,
  createSectorFromSurface,
  isPointInSector,
  reflectSector,
  trimSectorBySurface,
  intersectSectors,
  blockSectorByObstacle,
  crossProduct,
  type RaySector,
} from "@/trajectory-v2/visibility/RaySector";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";
import { createTestSurface as createTestSurfaceHelper } from "./testHelpers";

// Wrapper that adapts the helper to the expected signature
function createTestSurface(opts: {
  id: string;
  start: { x: number; y: number };
  end: { x: number; y: number };
  canReflect: boolean;
}) {
  return createTestSurfaceHelper(opts.id, opts.start, opts.end, opts.canReflect);
}

describe("RaySector", () => {
  describe("createFullSector", () => {
    it("creates a sector where isFullSector returns true", () => {
      const origin = { x: 100, y: 100 };
      const sector = createFullSector(origin);

      expect(isFullSector(sector)).toBe(true);
    });

    it("full sector contains any point", () => {
      const origin = { x: 100, y: 100 };
      const sector = createFullSector(origin);

      // Test points in all directions
      expect(isPointInSector({ x: 200, y: 100 }, sector)).toBe(true); // right
      expect(isPointInSector({ x: 0, y: 100 }, sector)).toBe(true); // left
      expect(isPointInSector({ x: 100, y: 0 }, sector)).toBe(true); // up
      expect(isPointInSector({ x: 100, y: 200 }, sector)).toBe(true); // down
      expect(isPointInSector({ x: 200, y: 200 }, sector)).toBe(true); // diagonal
    });
  });

  describe("crossProduct", () => {
    it("returns positive when b is left of ray origin→a", () => {
      const origin = { x: 0, y: 0 };
      const a = { x: 1, y: 0 }; // pointing right
      const b = { x: 0, y: 1 }; // up (left of right-pointing ray)

      expect(crossProduct(origin, a, b)).toBeGreaterThan(0);
    });

    it("returns negative when b is right of ray origin→a", () => {
      const origin = { x: 0, y: 0 };
      const a = { x: 1, y: 0 }; // pointing right
      const b = { x: 0, y: -1 }; // down (right of right-pointing ray)

      expect(crossProduct(origin, a, b)).toBeLessThan(0);
    });

    it("returns zero when a, origin, b are collinear", () => {
      const origin = { x: 0, y: 0 };
      const a = { x: 1, y: 0 };
      const b = { x: 2, y: 0 }; // same direction

      expect(crossProduct(origin, a, b)).toBe(0);
    });

    it("is exact - no floating point error for integer inputs", () => {
      const origin = { x: 0, y: 0 };
      const a = { x: 100, y: 0 };
      const b = { x: 0, y: 100 };

      // Expected: (100 - 0) * (100 - 0) - (0 - 0) * (0 - 0) = 10000
      expect(crossProduct(origin, a, b)).toBe(10000);
    });
  });

  describe("isPointInSector", () => {
    it("correctly identifies points inside a sector", () => {
      const sector: RaySector = {
        origin: { x: 0, y: 0 },
        leftBoundary: { x: 0, y: 1 }, // up
        rightBoundary: { x: 1, y: 0 }, // right
      };

      // Point at 45 degrees (inside)
      expect(isPointInSector({ x: 1, y: 1 }, sector)).toBe(true);

      // Point at 30 degrees (inside)
      expect(isPointInSector({ x: 2, y: 1 }, sector)).toBe(true);
    });

    it("correctly identifies points outside a sector", () => {
      const sector: RaySector = {
        origin: { x: 0, y: 0 },
        leftBoundary: { x: 0, y: 1 }, // up
        rightBoundary: { x: 1, y: 0 }, // right
      };

      // Point at 135 degrees (outside, to the left of left boundary)
      expect(isPointInSector({ x: -1, y: 1 }, sector)).toBe(false);

      // Point at -45 degrees (outside, to the right of right boundary)
      expect(isPointInSector({ x: 1, y: -1 }, sector)).toBe(false);
    });

    it("includes points on the boundary (edge case)", () => {
      const sector: RaySector = {
        origin: { x: 0, y: 0 },
        leftBoundary: { x: 0, y: 1 },
        rightBoundary: { x: 1, y: 0 },
      };

      // Point exactly on right boundary
      expect(isPointInSector({ x: 2, y: 0 }, sector)).toBe(true);

      // Point exactly on left boundary
      expect(isPointInSector({ x: 0, y: 2 }, sector)).toBe(true);
    });

    it("handles reflex sectors (> 180 degrees)", () => {
      // A sector that covers everything except a small wedge
      const sector: RaySector = {
        origin: { x: 0, y: 0 },
        leftBoundary: { x: 1, y: 0 }, // right
        rightBoundary: { x: 0, y: 1 }, // up
      };

      // This sector goes counter-clockwise from up to right (the long way)
      // So it should include down, left, and most directions

      // Point to the left (inside reflex sector)
      expect(isPointInSector({ x: -1, y: 0 }, sector)).toBe(true);

      // Point down (inside reflex sector)
      expect(isPointInSector({ x: 0, y: -1 }, sector)).toBe(true);

      // Point at 45 degrees (outside - in the excluded wedge)
      expect(isPointInSector({ x: 1, y: 1 }, sector)).toBe(false);
    });
  });

  describe("reflectSector - Reversibility", () => {
    it("reflect(reflect(sector, line), line) === sector exactly", () => {
      const surface = createTestSurface({
        id: "test",
        start: { x: 100, y: 0 },
        end: { x: 100, y: 200 },
        canReflect: true,
      });

      const original: RaySector = {
        origin: { x: 50, y: 100 },
        leftBoundary: { x: 50, y: 150 },
        rightBoundary: { x: 50, y: 50 },
      };

      const reflected = reflectSector(original, surface);
      const reflectedBack = reflectSector(reflected, surface);

      // EXACT comparison - no tolerance
      expect(reflectedBack.origin.x).toBe(original.origin.x);
      expect(reflectedBack.origin.y).toBe(original.origin.y);
      expect(reflectedBack.leftBoundary.x).toBe(original.leftBoundary.x);
      expect(reflectedBack.leftBoundary.y).toBe(original.leftBoundary.y);
      expect(reflectedBack.rightBoundary.x).toBe(original.rightBoundary.x);
      expect(reflectedBack.rightBoundary.y).toBe(original.rightBoundary.y);
    });

    it("reflects origin correctly", () => {
      const surface = createTestSurface({
        id: "test",
        start: { x: 0, y: 0 },
        end: { x: 0, y: 100 },
        canReflect: true,
      });

      const sector: RaySector = {
        origin: { x: -50, y: 50 },
        leftBoundary: { x: -50, y: 100 },
        rightBoundary: { x: -50, y: 0 },
      };

      const reflected = reflectSector(sector, surface);

      // Origin should be reflected through the vertical line x=0
      expect(reflected.origin.x).toBe(50);
      expect(reflected.origin.y).toBe(50);
    });

    it("reflects and swaps boundaries correctly", () => {
      const surface = createTestSurface({
        id: "test",
        start: { x: 0, y: 0 },
        end: { x: 0, y: 100 },
        canReflect: true,
      });

      const sector: RaySector = {
        origin: { x: -50, y: 50 },
        leftBoundary: { x: -30, y: 80 },
        rightBoundary: { x: -30, y: 20 },
      };

      const reflected = reflectSector(sector, surface);

      // Boundaries should be reflected AND swapped to maintain sector orientation
      // leftBoundary = reflect(rightBoundary) = reflect((-30, 20)) = (30, 20)
      expect(reflected.leftBoundary.x).toBe(30);
      expect(reflected.leftBoundary.y).toBe(20);
      // rightBoundary = reflect(leftBoundary) = reflect((-30, 80)) = (30, 80)
      expect(reflected.rightBoundary.x).toBe(30);
      expect(reflected.rightBoundary.y).toBe(80);
    });
  });

  describe("createSectorFromSurface", () => {
    it("creates sector covering the surface angular extent", () => {
      const origin = { x: 0, y: 0 };
      const surface = createTestSurface({
        id: "test",
        start: { x: 100, y: -50 },
        end: { x: 100, y: 50 },
        canReflect: true,
      });

      const sector = createSectorFromSurface(origin, surface);

      // The sector should include points on the surface
      expect(isPointInSector({ x: 100, y: 0 }, sector)).toBe(true);
      expect(isPointInSector({ x: 100, y: 25 }, sector)).toBe(true);
      expect(isPointInSector({ x: 100, y: -25 }, sector)).toBe(true);

      // Points outside the angular extent should not be included
      expect(isPointInSector({ x: 100, y: 100 }, sector)).toBe(false);
      expect(isPointInSector({ x: 100, y: -100 }, sector)).toBe(false);
    });
  });

  describe("trimSectorBySurface", () => {
    it("trims a full sector to the surface extent", () => {
      const origin = { x: 0, y: 0 };
      const fullSector = createFullSector(origin);

      const surface = createTestSurface({
        id: "test",
        start: { x: 100, y: -25 },
        end: { x: 100, y: 25 },
        canReflect: true,
      });

      const trimmed = trimSectorBySurface(fullSector, surface);

      expect(trimmed).not.toBeNull();
      if (trimmed) {
        // Should now only cover the surface extent
        expect(isPointInSector({ x: 100, y: 0 }, trimmed)).toBe(true);
        expect(isPointInSector({ x: 100, y: 50 }, trimmed)).toBe(false);
      }
    });

    it("returns null when sector and surface don't overlap", () => {
      // Sector pointing to the left (up-left to down-left, going CCW through left)
      // To get a sector covering ONLY the left half, left must be down-left and right must be up-left
      const sector: RaySector = {
        origin: { x: 0, y: 0 },
        leftBoundary: { x: -1, y: -1 }, // pointing down-left
        rightBoundary: { x: -1, y: 1 }, // pointing up-left
      };

      // Surface to the right - no overlap with left-facing sector
      const surface = createTestSurface({
        id: "test",
        start: { x: 100, y: -25 },
        end: { x: 100, y: 25 },
        canReflect: true,
      });

      const trimmed = trimSectorBySurface(sector, surface);

      expect(trimmed).toBeNull();
    });
  });

  describe("intersectSectors", () => {
    it("returns the overlapping region", () => {
      const origin = { x: 0, y: 0 };

      const a: RaySector = {
        origin,
        leftBoundary: { x: 0, y: 1 }, // up
        rightBoundary: { x: 1, y: 0 }, // right
      };

      const b: RaySector = {
        origin,
        leftBoundary: { x: 1, y: 1 }, // up-right
        rightBoundary: { x: 1, y: -1 }, // down-right
      };

      const intersection = intersectSectors(a, b);

      expect(intersection).not.toBeNull();
      if (intersection) {
        // The intersection should be from 45 degrees to 0 degrees
        expect(isPointInSector({ x: 2, y: 1 }, intersection)).toBe(true); // 30 degrees
        expect(isPointInSector({ x: 1, y: 0.1 }, intersection)).toBe(true); // near 0 degrees
        expect(isPointInSector({ x: 0, y: 1 }, intersection)).toBe(false); // 90 degrees (outside b)
      }
    });

    it("returns null when sectors don't overlap", () => {
      const origin = { x: 0, y: 0 };

      // Sector A: from right to up (first quadrant only)
      const a: RaySector = {
        origin,
        leftBoundary: { x: 0, y: 1 }, // up
        rightBoundary: { x: 1, y: 0 }, // right
      };

      // Sector B: from down to left (third quadrant only)
      // Going CCW from down to left covers ONLY the third quadrant
      const b: RaySector = {
        origin,
        leftBoundary: { x: 0, y: -1 }, // down (this is the LEFT boundary going CCW)
        rightBoundary: { x: -1, y: 0 }, // left (this is the RIGHT boundary going CCW)
      };

      const intersection = intersectSectors(a, b);

      expect(intersection).toBeNull();
    });
  });

  describe("blockSectorByObstacle", () => {
    it("returns original sector when obstacle is outside", () => {
      const sector: RaySector = {
        origin: { x: 0, y: 0 },
        leftBoundary: { x: 0, y: 1 },
        rightBoundary: { x: 1, y: 0 },
      };

      // Obstacle behind the origin
      const obstacle = createTestSurface({
        id: "obs",
        start: { x: -100, y: -10 },
        end: { x: -100, y: 10 },
        canReflect: false,
      });

      const result = blockSectorByObstacle(sector, obstacle, 100);

      expect(result.length).toBe(1);
      expect(result[0]).toEqual(sector);
    });

    it("splits sector when obstacle is fully inside", () => {
      const sector: RaySector = {
        origin: { x: 0, y: 0 },
        leftBoundary: { x: 0, y: 1 }, // up
        rightBoundary: { x: 1, y: 0 }, // right
      };

      // Small obstacle in the middle of the sector
      const obstacle = createTestSurface({
        id: "obs",
        start: { x: 100, y: 40 },
        end: { x: 100, y: 60 },
        canReflect: false,
      });

      const result = blockSectorByObstacle(sector, obstacle, 100);

      // Should return 2 sectors (one on each side of the obstacle)
      expect(result.length).toBe(2);
    });
  });

  describe("Reproducibility", () => {
    it("same inputs produce identical outputs", () => {
      const surface = createTestSurface({
        id: "test",
        start: { x: 100, y: 0 },
        end: { x: 100, y: 200 },
        canReflect: true,
      });

      const sector: RaySector = {
        origin: { x: 50, y: 100 },
        leftBoundary: { x: 50, y: 150 },
        rightBoundary: { x: 50, y: 50 },
      };

      // Call multiple times
      const result1 = reflectSector(sector, surface);
      const result2 = reflectSector(sector, surface);
      const result3 = reflectSector(sector, surface);

      // All results must be identical
      expect(result1.origin.x).toBe(result2.origin.x);
      expect(result1.origin.y).toBe(result2.origin.y);
      expect(result2.origin.x).toBe(result3.origin.x);
      expect(result2.origin.y).toBe(result3.origin.y);
    });
  });

  describe("Point reflection reversibility", () => {
    it("reflectPointThroughLine is exactly reversible", () => {
      const lineStart = { x: 100, y: 0 };
      const lineEnd = { x: 100, y: 200 };
      const point = { x: 50, y: 100 };

      const reflected = reflectPointThroughLine(point, lineStart, lineEnd);
      const reflectedBack = reflectPointThroughLine(reflected, lineStart, lineEnd);

      // EXACT comparison
      expect(reflectedBack.x).toBe(point.x);
      expect(reflectedBack.y).toBe(point.y);
    });
  });
});

