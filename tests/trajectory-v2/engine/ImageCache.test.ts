/**
 * ImageCache Tests
 *
 * Tests for forward/backward image building with provenance tracking.
 */

import { describe, expect, it } from "vitest";
import {
  buildBackwardImages,
  buildForwardImages,
  getCursorImageForSurface,
  getImageAtDepth,
  getPlayerImageForSurface,
  verifyReflectionReversibility,
} from "@/trajectory-v2/engine/ImageCache";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

// Helper to create a mock surface
function createMockSurface(
  id: string,
  start: Vector2,
  end: Vector2
): Surface {
  return {
    id,
    segment: { start, end },
    surfaceType: "ricochet",
    onArrowHit: () => ({ type: "reflect" }),
    isPlannable: () => true,
    getVisualProperties: () => ({ color: 0xffffff, lineWidth: 2, alpha: 1 }),
    getNormal: () => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      return { x: -dy / len, y: dx / len };
    },
    canReflectFrom: () => true,
  };
}

describe("ImageCache", () => {
  describe("buildForwardImages", () => {
    it("should return empty images for no surfaces", () => {
      const origin = { x: 0, y: 0 };
      const result = buildForwardImages(origin, []);

      expect(result.original).toEqual(origin);
      expect(result.images).toHaveLength(0);
      expect(result.surfaces).toHaveLength(0);
    });

    it("should reflect through single horizontal surface", () => {
      const origin = { x: 50, y: 0 };
      const surface = createMockSurface(
        "s1",
        { x: 0, y: 50 },
        { x: 100, y: 50 }
      );

      const result = buildForwardImages(origin, [surface]);

      expect(result.images).toHaveLength(1);
      expect(result.images[0].position.x).toBeCloseTo(50);
      expect(result.images[0].position.y).toBeCloseTo(100); // Reflected below line
      expect(result.images[0].depth).toBe(1);
    });

    it("should reflect through single vertical surface", () => {
      const origin = { x: 0, y: 50 };
      const surface = createMockSurface(
        "s1",
        { x: 50, y: 0 },
        { x: 50, y: 100 }
      );

      const result = buildForwardImages(origin, [surface]);

      expect(result.images).toHaveLength(1);
      expect(result.images[0].position.x).toBeCloseTo(100); // Reflected right
      expect(result.images[0].position.y).toBeCloseTo(50);
    });

    it("should chain reflections through multiple surfaces", () => {
      const origin = { x: 0, y: 0 };
      const surface1 = createMockSurface(
        "s1",
        { x: 50, y: -100 },
        { x: 50, y: 100 }
      ); // Vertical at x=50
      const surface2 = createMockSurface(
        "s2",
        { x: -100, y: 50 },
        { x: 200, y: 50 }
      ); // Horizontal at y=50

      const result = buildForwardImages(origin, [surface1, surface2]);

      expect(result.images).toHaveLength(2);

      // First reflection: x=0 → x=100 through x=50 line
      expect(result.images[0].position.x).toBeCloseTo(100);
      expect(result.images[0].position.y).toBeCloseTo(0);
      expect(result.images[0].depth).toBe(1);

      // Second reflection: (100, 0) → (100, 100) through y=50 line
      expect(result.images[1].position.x).toBeCloseTo(100);
      expect(result.images[1].position.y).toBeCloseTo(100);
      expect(result.images[1].depth).toBe(2);
    });

    it("should track provenance correctly", () => {
      const origin = { x: 0, y: 0 };
      const surface1 = createMockSurface(
        "s1",
        { x: 50, y: -100 },
        { x: 50, y: 100 }
      );
      const surface2 = createMockSurface(
        "s2",
        { x: -100, y: 50 },
        { x: 200, y: 50 }
      );

      const result = buildForwardImages(origin, [surface1, surface2]);

      // First image's source is the original
      expect(result.images[0].source.position).toEqual(origin);
      expect(result.images[0].source.surface).toBeNull();

      // Second image's source is the first image position
      expect(result.images[1].source.position).toEqual(origin);
      expect(result.images[1].source.surface).toBe(surface1);
    });
  });

  describe("buildBackwardImages", () => {
    it("should reflect in reverse order", () => {
      const origin = { x: 100, y: 100 };
      const surface1 = createMockSurface(
        "s1",
        { x: 50, y: -100 },
        { x: 50, y: 200 }
      ); // Vertical at x=50
      const surface2 = createMockSurface(
        "s2",
        { x: -100, y: 50 },
        { x: 200, y: 50 }
      ); // Horizontal at y=50

      const result = buildBackwardImages(origin, [surface1, surface2]);

      // Backward: first reflect through surface2 (last in list)
      // (100, 100) reflected through y=50 → (100, 0)
      expect(result.images[0].position.x).toBeCloseTo(100);
      expect(result.images[0].position.y).toBeCloseTo(0);
      expect(result.images[0].depth).toBe(1);

      // Then reflect through surface1
      // (100, 0) reflected through x=50 → (0, 0)
      expect(result.images[1].position.x).toBeCloseTo(0);
      expect(result.images[1].position.y).toBeCloseTo(0);
      expect(result.images[1].depth).toBe(2);
    });
  });

  describe("getImageAtDepth", () => {
    it("should return original for depth 0", () => {
      const origin = { x: 10, y: 20 };
      const surface = createMockSurface(
        "s1",
        { x: 50, y: 0 },
        { x: 50, y: 100 }
      );
      const sequence = buildForwardImages(origin, [surface]);

      const result = getImageAtDepth(sequence, 0);
      expect(result).toEqual(origin);
    });

    it("should return image for depth > 0", () => {
      const origin = { x: 0, y: 50 };
      const surface = createMockSurface(
        "s1",
        { x: 50, y: 0 },
        { x: 50, y: 100 }
      );
      const sequence = buildForwardImages(origin, [surface]);

      const result = getImageAtDepth(sequence, 1);
      expect(result.x).toBeCloseTo(100);
      expect(result.y).toBeCloseTo(50);
    });

    it("should throw for invalid depth", () => {
      const origin = { x: 0, y: 0 };
      const surface = createMockSurface(
        "s1",
        { x: 50, y: 0 },
        { x: 50, y: 100 }
      );
      const sequence = buildForwardImages(origin, [surface]);

      expect(() => getImageAtDepth(sequence, 5)).toThrow();
    });
  });

  describe("getPlayerImageForSurface", () => {
    it("should return original for surface 0", () => {
      const origin = { x: 0, y: 0 };
      const surface = createMockSurface(
        "s1",
        { x: 50, y: 0 },
        { x: 50, y: 100 }
      );
      const sequence = buildForwardImages(origin, [surface]);

      const result = getPlayerImageForSurface(sequence, 0);
      expect(result).toEqual(origin);
    });

    it("should return reflected image for surface 1+", () => {
      const origin = { x: 0, y: 0 };
      const surface1 = createMockSurface(
        "s1",
        { x: 50, y: -100 },
        { x: 50, y: 100 }
      );
      const surface2 = createMockSurface(
        "s2",
        { x: -100, y: 50 },
        { x: 200, y: 50 }
      );
      const sequence = buildForwardImages(origin, [surface1, surface2]);

      const result = getPlayerImageForSurface(sequence, 1);
      expect(result.x).toBeCloseTo(100); // First reflection
    });
  });

  describe("getCursorImageForSurface", () => {
    it("should return correct cursor image for each surface", () => {
      const player = { x: 0, y: 0 };
      const cursor = { x: 100, y: 100 };

      const surface1 = createMockSurface(
        "s1",
        { x: 50, y: -100 },
        { x: 50, y: 200 }
      );
      const surface2 = createMockSurface(
        "s2",
        { x: -100, y: 50 },
        { x: 200, y: 50 }
      );

      const playerImages = buildForwardImages(player, [surface1, surface2]);
      const cursorImages = buildBackwardImages(cursor, [surface1, surface2]);

      // For surface 0: cursor image at depth n - 0 = 2
      const cursorForSurface0 = getCursorImageForSurface(
        playerImages,
        cursorImages,
        0
      );
      expect(cursorForSurface0.x).toBeCloseTo(0);
      expect(cursorForSurface0.y).toBeCloseTo(0);

      // For surface 1: cursor image at depth n - 1 = 1
      const cursorForSurface1 = getCursorImageForSurface(
        playerImages,
        cursorImages,
        1
      );
      expect(cursorForSurface1.x).toBeCloseTo(100);
      expect(cursorForSurface1.y).toBeCloseTo(0);
    });
  });

  describe("verifyReflectionReversibility", () => {
    it("should verify reflection is reversible", () => {
      const origin = { x: 37, y: 83 };
      const surface = createMockSurface(
        "s1",
        { x: 15, y: 25 },
        { x: 85, y: 60 }
      );
      const sequence = buildForwardImages(origin, [surface]);

      const isReversible = verifyReflectionReversibility(sequence.images[0]);
      expect(isReversible).toBe(true);
    });

    it("should return true for original (no surface)", () => {
      const origin = { x: 0, y: 0 };
      const sequence = buildForwardImages(origin, []);

      // Create a mock image with no source surface
      const mockImage = {
        position: origin,
        source: { position: origin, surface: null },
        depth: 0,
      };

      const isReversible = verifyReflectionReversibility(mockImage);
      expect(isReversible).toBe(true);
    });
  });
});

