/**
 * Tests for OutlineBuilder
 */

import { describe, it, expect } from "vitest";
import {
  buildOutline,
  simplifyOutline,
  type ValidRegionOutline,
} from "@/trajectory-v2/visibility/OutlineBuilder";
import type { PropagationResult, ScreenBounds } from "@/trajectory-v2/visibility/ConePropagator";
import { fullCone, emptyCone } from "@/trajectory-v2/visibility/ConeSection";

describe("OutlineBuilder", () => {
  const screenBounds: ScreenBounds = {
    minX: 0,
    minY: 0,
    maxX: 800,
    maxY: 600,
  };

  describe("buildOutline", () => {
    it("should return invalid outline for empty cone", () => {
      const result: PropagationResult = {
        finalOrigin: { x: 400, y: 300 },
        finalCone: emptyCone(),
        blockingSurfaces: [],
        success: false,
      };

      const outline = buildOutline(result, screenBounds);

      expect(outline.isValid).toBe(false);
      expect(outline.vertices.length).toBe(0);
    });

    it("should build outline for full cone", () => {
      const result: PropagationResult = {
        finalOrigin: { x: 400, y: 300 },
        finalCone: fullCone(),
        blockingSurfaces: [],
        success: true,
      };

      const outline = buildOutline(result, screenBounds);

      expect(outline.isValid).toBe(true);
      expect(outline.vertices.length).toBeGreaterThan(0);
      expect(outline.origin).toEqual({ x: 400, y: 300 });
    });

    it("should include screen edge vertices", () => {
      const result: PropagationResult = {
        finalOrigin: { x: 400, y: 300 },
        finalCone: fullCone(),
        blockingSurfaces: [],
        success: true,
      };

      const outline = buildOutline(result, screenBounds);

      // At least some vertices should be on screen edges
      const onEdge = outline.vertices.filter((v) => 
        v.position.x === 0 ||
        v.position.x === 800 ||
        v.position.y === 0 ||
        v.position.y === 600
      );

      expect(onEdge.length).toBeGreaterThan(0);
    });

    it("should build outline for partial cone", () => {
      // Cone only covering right half
      const result: PropagationResult = {
        finalOrigin: { x: 400, y: 300 },
        finalCone: [{ startAngle: -Math.PI / 2, endAngle: Math.PI / 2 }],
        blockingSurfaces: [],
        success: true,
      };

      const outline = buildOutline(result, screenBounds);

      expect(outline.isValid).toBe(true);
      expect(outline.vertices.length).toBeGreaterThan(0);
    });
  });

  describe("simplifyOutline", () => {
    it("should remove collinear points", () => {
      const outline: ValidRegionOutline = {
        vertices: [
          { position: { x: 0, y: 0 }, type: "screen" },
          { position: { x: 50, y: 0 }, type: "screen" },
          { position: { x: 100, y: 0 }, type: "screen" },
          { position: { x: 100, y: 100 }, type: "screen" },
          { position: { x: 0, y: 100 }, type: "screen" },
        ],
        isValid: true,
        origin: { x: 50, y: 50 },
      };

      const simplified = simplifyOutline(outline);

      // Middle point on top edge should be removed
      expect(simplified.vertices.length).toBeLessThan(outline.vertices.length);
    });

    it("should keep non-collinear points", () => {
      const outline: ValidRegionOutline = {
        vertices: [
          { position: { x: 0, y: 0 }, type: "screen" },
          { position: { x: 100, y: 0 }, type: "screen" },
          { position: { x: 100, y: 100 }, type: "screen" },
          { position: { x: 0, y: 100 }, type: "screen" },
        ],
        isValid: true,
        origin: { x: 50, y: 50 },
      };

      const simplified = simplifyOutline(outline);

      // All 4 corners should be kept
      expect(simplified.vertices.length).toBe(4);
    });

    it("should handle outline with fewer than 3 vertices", () => {
      const outline: ValidRegionOutline = {
        vertices: [
          { position: { x: 0, y: 0 }, type: "screen" },
          { position: { x: 100, y: 0 }, type: "screen" },
        ],
        isValid: false,
        origin: { x: 0, y: 0 },
      };

      const simplified = simplifyOutline(outline);

      expect(simplified).toEqual(outline);
    });
  });

  describe("vertex types", () => {
    it("should mark screen edge vertices correctly", () => {
      const result: PropagationResult = {
        finalOrigin: { x: 400, y: 300 },
        finalCone: fullCone(),
        blockingSurfaces: [],
        success: true,
      };

      const outline = buildOutline(result, screenBounds);

      const screenVertices = outline.vertices.filter((v) => v.type === "screen");
      expect(screenVertices.length).toBeGreaterThan(0);
    });
  });
});

