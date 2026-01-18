/**
 * Tests for arc rendering in visibility polygons.
 *
 * Verifies that the drawPolygonEdges function correctly:
 * - Draws line edges with lineTo
 * - Draws arc edges with arc
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  drawPolygonEdges,
} from "@/trajectory-v2/visibility/EdgeRenderer";
import { createLineEdge, createArcEdge, type PolygonEdge } from "@/trajectory-v2/visibility/PolygonEdge";
import type { IValidRegionGraphics } from "@/trajectory-v2/visibility/ValidRegionRenderer";

describe("ArcRendering", () => {
  let mockGraphics: IValidRegionGraphics;

  beforeEach(() => {
    mockGraphics = {
      clear: vi.fn(),
      fillStyle: vi.fn(),
      lineStyle: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      closePath: vi.fn(),
      fillPath: vi.fn(),
      strokePath: vi.fn(),
      fillRect: vi.fn(),
      setBlendMode: vi.fn(),
    };
  });

  describe("drawPolygonEdges", () => {
    it("should draw line edges with lineTo", () => {
      const edges: PolygonEdge[] = [
        createLineEdge({ x: 0, y: 0 }, { x: 100, y: 0 }),
        createLineEdge({ x: 100, y: 0 }, { x: 100, y: 100 }),
        createLineEdge({ x: 100, y: 100 }, { x: 0, y: 0 }),
      ];

      drawPolygonEdges(mockGraphics, edges);

      expect(mockGraphics.beginPath).toHaveBeenCalled();
      expect(mockGraphics.moveTo).toHaveBeenCalledWith(0, 0);
      expect(mockGraphics.lineTo).toHaveBeenCalledWith(100, 0);
      expect(mockGraphics.lineTo).toHaveBeenCalledWith(100, 100);
      expect(mockGraphics.lineTo).toHaveBeenCalledWith(0, 0);
      expect(mockGraphics.closePath).toHaveBeenCalled();
      expect(mockGraphics.fillPath).toHaveBeenCalled();
    });

    it("should draw arc edges with arc", () => {
      const edges: PolygonEdge[] = [
        createLineEdge({ x: 0, y: 0 }, { x: 100, y: 0 }),
        createArcEdge(
          { x: 100, y: 0 },
          { x: 0, y: 100 },
          { x: 0, y: 0 }, // center
          100, // radius
          false // clockwise
        ),
        createLineEdge({ x: 0, y: 100 }, { x: 0, y: 0 }),
      ];

      drawPolygonEdges(mockGraphics, edges);

      expect(mockGraphics.beginPath).toHaveBeenCalled();
      expect(mockGraphics.moveTo).toHaveBeenCalledWith(0, 0);
      expect(mockGraphics.lineTo).toHaveBeenCalledWith(100, 0);
      // Arc should be called with center, radius, and angles
      expect(mockGraphics.arc).toHaveBeenCalled();
      const arcCall = (mockGraphics.arc as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(arcCall[0]).toBe(0); // center x
      expect(arcCall[1]).toBe(0); // center y
      expect(arcCall[2]).toBe(100); // radius
      // Angles are computed from the from/to points
      expect(typeof arcCall[3]).toBe("number"); // startAngle
      expect(typeof arcCall[4]).toBe("number"); // endAngle
      expect(mockGraphics.closePath).toHaveBeenCalled();
    });

    it("should handle mixed edges correctly", () => {
      const edges: PolygonEdge[] = [
        createLineEdge({ x: 50, y: 0 }, { x: 100, y: 0 }),
        createArcEdge(
          { x: 100, y: 0 },
          { x: 0, y: 100 },
          { x: 50, y: 50 },
          70.71, // approximately sqrt(50^2 + 50^2)
          false
        ),
        createLineEdge({ x: 0, y: 100 }, { x: 0, y: 50 }),
        createLineEdge({ x: 0, y: 50 }, { x: 50, y: 0 }),
      ];

      drawPolygonEdges(mockGraphics, edges);

      expect(mockGraphics.lineTo).toHaveBeenCalledTimes(3); // 3 line edges
      expect(mockGraphics.arc).toHaveBeenCalledTimes(1); // 1 arc edge
    });

    it("should handle empty edges array", () => {
      const edges: PolygonEdge[] = [];

      drawPolygonEdges(mockGraphics, edges);

      expect(mockGraphics.beginPath).not.toHaveBeenCalled();
    });

    it("should set anticlockwise correctly for arc edges", () => {
      const edges: PolygonEdge[] = [
        createArcEdge(
          { x: 100, y: 0 },
          { x: 0, y: 100 },
          { x: 0, y: 0 },
          100,
          true // anticlockwise
        ),
        createLineEdge({ x: 0, y: 100 }, { x: 100, y: 0 }),
      ];

      drawPolygonEdges(mockGraphics, edges);

      const arcCall = (mockGraphics.arc as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(arcCall[5]).toBe(true); // anticlockwise parameter
    });
  });
});
