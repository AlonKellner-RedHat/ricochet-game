/**
 * Tests for Screen Boundaries as SurfaceChain
 *
 * Screen boundaries form a closed rectangular chain:
 * - 4 vertices (corners)
 * - 4 surfaces (edges)
 * - 4 JunctionPoints (all corners)
 * - 0 Endpoints (closed loop)
 */

import { describe, it, expect } from "vitest";
import {
  createScreenBoundaryChain,
  type ScreenBoundsConfig,
} from "@/trajectory-v2/geometry/ScreenBoundaries";
import { isJunctionPoint } from "@/trajectory-v2/geometry/SurfaceChain";

// =============================================================================
// TEST DATA
// =============================================================================

const TEST_BOUNDS: ScreenBoundsConfig = {
  minX: 0,
  minY: 0,
  maxX: 1280,
  maxY: 720,
};

// =============================================================================
// TESTS
// =============================================================================

describe("Screen Boundary Chain", () => {
  describe("Chain structure", () => {
    it("should be a closed chain", () => {
      const chain = createScreenBoundaryChain(TEST_BOUNDS);
      expect(chain.isClosed).toBe(true);
    });

    it("should have 4 vertices (corners)", () => {
      const chain = createScreenBoundaryChain(TEST_BOUNDS);
      expect(chain.vertexCount).toBe(4);
    });

    it("should have 4 surfaces (edges)", () => {
      const chain = createScreenBoundaryChain(TEST_BOUNDS);
      expect(chain.getSurfaces().length).toBe(4);
    });
  });

  describe("Vertices (corners)", () => {
    it("should have vertices at the four corners", () => {
      const chain = createScreenBoundaryChain(TEST_BOUNDS);

      // Clockwise from top-left
      expect(chain.getVertex(0).position).toEqual({ x: 0, y: 0 }); // top-left
      expect(chain.getVertex(1).position).toEqual({ x: 1280, y: 0 }); // top-right
      expect(chain.getVertex(2).position).toEqual({ x: 1280, y: 720 }); // bottom-right
      expect(chain.getVertex(3).position).toEqual({ x: 0, y: 720 }); // bottom-left
    });
  });

  describe("Surfaces (edges)", () => {
    it("should have surfaces with correct segments", () => {
      const chain = createScreenBoundaryChain(TEST_BOUNDS);
      const surfaces = chain.getSurfaces();

      // Top edge: left to right
      expect(surfaces[0].segment.start).toEqual({ x: 0, y: 0 });
      expect(surfaces[0].segment.end).toEqual({ x: 1280, y: 0 });

      // Right edge: top to bottom
      expect(surfaces[1].segment.start).toEqual({ x: 1280, y: 0 });
      expect(surfaces[1].segment.end).toEqual({ x: 1280, y: 720 });

      // Bottom edge: right to left
      expect(surfaces[2].segment.start).toEqual({ x: 1280, y: 720 });
      expect(surfaces[2].segment.end).toEqual({ x: 0, y: 720 });

      // Left edge: bottom to top (closing the loop)
      expect(surfaces[3].segment.start).toEqual({ x: 0, y: 720 });
      expect(surfaces[3].segment.end).toEqual({ x: 0, y: 0 });
    });

    it("should have surfaces with correct IDs", () => {
      const chain = createScreenBoundaryChain(TEST_BOUNDS);
      const surfaces = chain.getSurfaces();

      expect(surfaces[0].id).toBe("screen-top");
      expect(surfaces[1].id).toBe("screen-right");
      expect(surfaces[2].id).toBe("screen-bottom");
      expect(surfaces[3].id).toBe("screen-left");
    });

    it("should have normals pointing inward", () => {
      const chain = createScreenBoundaryChain(TEST_BOUNDS);
      const surfaces = chain.getSurfaces();

      // Top: normal points down (into screen)
      expect(surfaces[0].getNormal()).toEqual({ x: 0, y: 1 });

      // Right: normal points left (into screen)
      expect(surfaces[1].getNormal()).toEqual({ x: -1, y: 0 });

      // Bottom: normal points up (into screen)
      expect(surfaces[2].getNormal()).toEqual({ x: 0, y: -1 });

      // Left: normal points right (into screen)
      expect(surfaces[3].getNormal()).toEqual({ x: 1, y: 0 });
    });

    it("should have surfaces that block (not reflect)", () => {
      const chain = createScreenBoundaryChain(TEST_BOUNDS);
      const surfaces = chain.getSurfaces();

      for (const surface of surfaces) {
        expect(surface.canReflectFrom({ x: 0, y: 1 })).toBe(false);
        expect(surface.isPlannable()).toBe(false);
      }
    });
  });

  describe("JunctionPoints (corners)", () => {
    it("should have 4 JunctionPoints (all vertices)", () => {
      const chain = createScreenBoundaryChain(TEST_BOUNDS);
      const junctions = chain.getJunctionPoints();

      expect(junctions.length).toBe(4);
    });

    it("should have 0 Endpoints (closed chain)", () => {
      const chain = createScreenBoundaryChain(TEST_BOUNDS);
      const endpoints = chain.getEndpoints();

      expect(endpoints).toBeNull();
    });

    it("should have JunctionPoints at corner positions", () => {
      const chain = createScreenBoundaryChain(TEST_BOUNDS);
      const junctions = chain.getJunctionPoints();

      expect(junctions[0].computeXY()).toEqual({ x: 0, y: 0 }); // top-left
      expect(junctions[1].computeXY()).toEqual({ x: 1280, y: 0 }); // top-right
      expect(junctions[2].computeXY()).toEqual({ x: 1280, y: 720 }); // bottom-right
      expect(junctions[3].computeXY()).toEqual({ x: 0, y: 720 }); // bottom-left
    });

    it("JunctionPoints should be detected by type guard", () => {
      const chain = createScreenBoundaryChain(TEST_BOUNDS);
      const junctions = chain.getJunctionPoints();

      for (const junction of junctions) {
        expect(isJunctionPoint(junction)).toBe(true);
      }
    });
  });

  describe("Corner JunctionPoint adjacency", () => {
    it("top-left corner should know its adjacent surfaces (left and top)", () => {
      const chain = createScreenBoundaryChain(TEST_BOUNDS);
      const junctions = chain.getJunctionPoints();
      const surfaces = chain.getSurfaces();

      const topLeft = junctions[0];
      // surfaceBefore = left edge (index 3), surfaceAfter = top edge (index 0)
      expect(topLeft.getSurfaceBefore().id).toBe("screen-left");
      expect(topLeft.getSurfaceAfter().id).toBe("screen-top");
    });

    it("top-right corner should know its adjacent surfaces (top and right)", () => {
      const chain = createScreenBoundaryChain(TEST_BOUNDS);
      const junctions = chain.getJunctionPoints();

      const topRight = junctions[1];
      expect(topRight.getSurfaceBefore().id).toBe("screen-top");
      expect(topRight.getSurfaceAfter().id).toBe("screen-right");
    });

    it("bottom-right corner should know its adjacent surfaces (right and bottom)", () => {
      const chain = createScreenBoundaryChain(TEST_BOUNDS);
      const junctions = chain.getJunctionPoints();

      const bottomRight = junctions[2];
      expect(bottomRight.getSurfaceBefore().id).toBe("screen-right");
      expect(bottomRight.getSurfaceAfter().id).toBe("screen-bottom");
    });

    it("bottom-left corner should know its adjacent surfaces (bottom and left)", () => {
      const chain = createScreenBoundaryChain(TEST_BOUNDS);
      const junctions = chain.getJunctionPoints();

      const bottomLeft = junctions[3];
      expect(bottomLeft.getSurfaceBefore().id).toBe("screen-bottom");
      expect(bottomLeft.getSurfaceAfter().id).toBe("screen-left");
    });
  });

  describe("Backward compatibility", () => {
    it("should provide getSurfaces() that works like old ScreenBoundaries.all", () => {
      const chain = createScreenBoundaryChain(TEST_BOUNDS);
      const surfaces = chain.getSurfaces();

      // Same number of surfaces
      expect(surfaces.length).toBe(4);

      // All surfaces have screen- prefix
      for (const surface of surfaces) {
        expect(surface.id.startsWith("screen-")).toBe(true);
      }
    });
  });
});

