/**
 * TDD Tests for SurfaceChain
 *
 * A SurfaceChain is defined by vertices. Surfaces are derived from adjacent vertex pairs.
 * - Open chains: N vertices → N-1 surfaces, 2 Endpoints (first/last vertex)
 * - Closed chains: N vertices → N surfaces, 0 Endpoints (all JunctionPoints)
 */

import type { Surface } from "@/surfaces/Surface";
import {
  type ChainConfig,
  type ChainVertex,
  SurfaceChain,
} from "@/trajectory-v2/geometry/SurfaceChain";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import { describe, expect, it } from "vitest";

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Create a simple mock surface for testing.
 */
function createMockSurface(id: string, start: Vector2, end: Vector2): Surface {
  return {
    id,
    segment: { start, end },
    surfaceType: "test",
    onArrowHit: () => ({ type: "blocked" }),
    isPlannable: () => false,
    getVisualProperties: () => ({ color: 0, alpha: 1, lineWidth: 1 }),
    getNormal: () => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      return { x: -dy / len, y: dx / len };
    },
    canReflectFrom: () => false,
  };
}

/**
 * Default surface factory for tests.
 */
function testSurfaceFactory(index: number, start: Vector2, end: Vector2): Surface {
  return createMockSurface(`surface-${index}`, start, end);
}

// =============================================================================
// PHASE 1: CORE CHAIN TESTS
// =============================================================================

describe("SurfaceChain", () => {
  describe("Open Chain (not closed)", () => {
    it("should create N-1 surfaces from N vertices", () => {
      // 3 vertices → 2 surfaces
      const config: ChainConfig = {
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
        isClosed: false,
        surfaceFactory: testSurfaceFactory,
      };

      const chain = new SurfaceChain(config);
      const surfaces = chain.getSurfaces();

      expect(surfaces.length).toBe(2);
    });

    it("should create surfaces with correct segments from vertex pairs", () => {
      const config: ChainConfig = {
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
        isClosed: false,
        surfaceFactory: testSurfaceFactory,
      };

      const chain = new SurfaceChain(config);
      const surfaces = chain.getSurfaces();

      // First surface: vertex 0 → vertex 1
      expect(surfaces[0].segment.start).toEqual({ x: 0, y: 0 });
      expect(surfaces[0].segment.end).toEqual({ x: 100, y: 0 });

      // Second surface: vertex 1 → vertex 2
      expect(surfaces[1].segment.start).toEqual({ x: 100, y: 0 });
      expect(surfaces[1].segment.end).toEqual({ x: 100, y: 100 });
    });

    it("should have exactly 2 Endpoints (first and last vertices)", () => {
      const config: ChainConfig = {
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
        isClosed: false,
        surfaceFactory: testSurfaceFactory,
      };

      const chain = new SurfaceChain(config);
      const endpoints = chain.getEndpoints();

      expect(endpoints).not.toBeNull();
      expect(endpoints!.length).toBe(2);

      // Start endpoint at first vertex
      expect(endpoints![0].computeXY()).toEqual({ x: 0, y: 0 });
      expect(endpoints![0].which).toBe("start");

      // End endpoint at last vertex
      expect(endpoints![1].computeXY()).toEqual({ x: 100, y: 100 });
      expect(endpoints![1].which).toBe("end");
    });

    it("should have N-2 JunctionPoints for internal vertices", () => {
      // 4 vertices → 2 internal vertices → 2 JunctionPoints
      const config: ChainConfig = {
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        isClosed: false,
        surfaceFactory: testSurfaceFactory,
      };

      const chain = new SurfaceChain(config);
      const junctions = chain.getJunctionPoints();

      expect(junctions.length).toBe(2);

      // First junction at vertex index 1
      expect(junctions[0].computeXY()).toEqual({ x: 100, y: 0 });
      expect(junctions[0].vertexIndex).toBe(1);

      // Second junction at vertex index 2
      expect(junctions[1].computeXY()).toEqual({ x: 100, y: 100 });
      expect(junctions[1].vertexIndex).toBe(2);
    });

    it("should return empty JunctionPoints array for 2-vertex chain", () => {
      // 2 vertices → 0 internal vertices → 0 JunctionPoints
      const config: ChainConfig = {
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        isClosed: false,
        surfaceFactory: testSurfaceFactory,
      };

      const chain = new SurfaceChain(config);
      const junctions = chain.getJunctionPoints();

      expect(junctions.length).toBe(0);
    });
  });

  describe("Closed Chain (loop)", () => {
    it("should create N surfaces from N vertices (loops back)", () => {
      // 4 vertices → 4 surfaces (including closing edge)
      const config: ChainConfig = {
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        isClosed: true,
        surfaceFactory: testSurfaceFactory,
      };

      const chain = new SurfaceChain(config);
      const surfaces = chain.getSurfaces();

      expect(surfaces.length).toBe(4);
    });

    it("should create closing surface from last to first vertex", () => {
      const config: ChainConfig = {
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        isClosed: true,
        surfaceFactory: testSurfaceFactory,
      };

      const chain = new SurfaceChain(config);
      const surfaces = chain.getSurfaces();

      // Last surface: vertex 3 → vertex 0 (closing the loop)
      expect(surfaces[3].segment.start).toEqual({ x: 0, y: 100 });
      expect(surfaces[3].segment.end).toEqual({ x: 0, y: 0 });
    });

    it("should have 0 Endpoints (all vertices are internal)", () => {
      const config: ChainConfig = {
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        isClosed: true,
        surfaceFactory: testSurfaceFactory,
      };

      const chain = new SurfaceChain(config);
      const endpoints = chain.getEndpoints();

      expect(endpoints).toBeNull();
    });

    it("should have N JunctionPoints (all vertices)", () => {
      // 4 vertices in closed chain → 4 JunctionPoints
      const config: ChainConfig = {
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        isClosed: true,
        surfaceFactory: testSurfaceFactory,
      };

      const chain = new SurfaceChain(config);
      const junctions = chain.getJunctionPoints();

      expect(junctions.length).toBe(4);

      // Verify positions
      expect(junctions[0].computeXY()).toEqual({ x: 0, y: 0 });
      expect(junctions[1].computeXY()).toEqual({ x: 100, y: 0 });
      expect(junctions[2].computeXY()).toEqual({ x: 100, y: 100 });
      expect(junctions[3].computeXY()).toEqual({ x: 0, y: 100 });
    });
  });

  describe("JunctionPoint surface adjacency", () => {
    it("should know its adjacent surfaces (open chain)", () => {
      const config: ChainConfig = {
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
        isClosed: false,
        surfaceFactory: testSurfaceFactory,
      };

      const chain = new SurfaceChain(config);
      const junctions = chain.getJunctionPoints();
      const surfaces = chain.getSurfaces();

      // Junction at vertex 1 (middle)
      const junction = junctions[0];
      expect(junction.getSurfaceBefore()).toBe(surfaces[0]);
      expect(junction.getSurfaceAfter()).toBe(surfaces[1]);
    });

    it("should know its adjacent surfaces (closed chain, wraps around)", () => {
      const config: ChainConfig = {
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        isClosed: true,
        surfaceFactory: testSurfaceFactory,
      };

      const chain = new SurfaceChain(config);
      const junctions = chain.getJunctionPoints();
      const surfaces = chain.getSurfaces();

      // Junction at vertex 0 (first vertex in closed chain)
      // surfaceBefore = last surface (index 3), surfaceAfter = first surface (index 0)
      const junction0 = junctions[0];
      expect(junction0.getSurfaceBefore()).toBe(surfaces[3]); // Wraps around
      expect(junction0.getSurfaceAfter()).toBe(surfaces[0]);

      // Junction at vertex 1
      const junction1 = junctions[1];
      expect(junction1.getSurfaceBefore()).toBe(surfaces[0]);
      expect(junction1.getSurfaceAfter()).toBe(surfaces[1]);
    });
  });

  describe("Vertex access", () => {
    it("should provide access to vertices by index", () => {
      const config: ChainConfig = {
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
        isClosed: false,
        surfaceFactory: testSurfaceFactory,
      };

      const chain = new SurfaceChain(config);

      expect(chain.getVertex(0).position).toEqual({ x: 0, y: 0 });
      expect(chain.getVertex(1).position).toEqual({ x: 100, y: 0 });
      expect(chain.getVertex(2).position).toEqual({ x: 100, y: 100 });
    });

    it("should have vertex count matching input", () => {
      const config: ChainConfig = {
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
        isClosed: false,
        surfaceFactory: testSurfaceFactory,
      };

      const chain = new SurfaceChain(config);

      expect(chain.vertexCount).toBe(3);
    });
  });

  describe("Lazy surface computation", () => {
    it("should only compute surfaces once (memoization)", () => {
      let factoryCalls = 0;
      const countingFactory = (index: number, start: Vector2, end: Vector2): Surface => {
        factoryCalls++;
        return createMockSurface(`surface-${index}`, start, end);
      };

      const config: ChainConfig = {
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
        isClosed: false,
        surfaceFactory: countingFactory,
      };

      const chain = new SurfaceChain(config);

      // First call - should invoke factory
      chain.getSurfaces();
      expect(factoryCalls).toBe(2);

      // Second call - should NOT invoke factory again
      chain.getSurfaces();
      expect(factoryCalls).toBe(2);
    });
  });

  describe("Edge cases", () => {
    it("should throw for chain with less than 2 vertices", () => {
      const config: ChainConfig = {
        vertices: [{ x: 0, y: 0 }],
        isClosed: false,
        surfaceFactory: testSurfaceFactory,
      };

      expect(() => new SurfaceChain(config)).toThrow();
    });

    it("should handle 2-vertex open chain (single surface)", () => {
      const config: ChainConfig = {
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        isClosed: false,
        surfaceFactory: testSurfaceFactory,
      };

      const chain = new SurfaceChain(config);

      expect(chain.getSurfaces().length).toBe(1);
      expect(chain.getEndpoints()?.length).toBe(2);
      expect(chain.getJunctionPoints().length).toBe(0);
    });

    it("should handle 3-vertex closed chain (triangle)", () => {
      const config: ChainConfig = {
        vertices: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 50, y: 100 },
        ],
        isClosed: true,
        surfaceFactory: testSurfaceFactory,
      };

      const chain = new SurfaceChain(config);

      expect(chain.getSurfaces().length).toBe(3);
      expect(chain.getEndpoints()).toBeNull();
      expect(chain.getJunctionPoints().length).toBe(3);
    });
  });
});
