/**
 * Tests for JunctionPoint as a SourcePoint-like type.
 *
 * Verifies that JunctionPoint follows the SourcePoint contract:
 * - computeXY() returns correct coordinates
 * - equals() works correctly
 * - getKey() returns unique, stable keys
 * - Type guards work correctly
 */

import { describe, it, expect } from "vitest";
import {
  SurfaceChain,
  JunctionPoint,
  ChainEndpoint,
  isJunctionPoint,
  isChainEndpoint,
  type ChainConfig,
} from "@/trajectory-v2/geometry/SurfaceChain";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

// =============================================================================
// TEST HELPERS
// =============================================================================

function createMockSurface(id: string, start: Vector2, end: Vector2): Surface {
  return {
    id,
    segment: { start, end },
    surfaceType: "test",
    onArrowHit: () => ({ type: "blocked" }),
    isPlannable: () => false,
    getVisualProperties: () => ({ color: 0, alpha: 1, lineWidth: 1 }),
    getNormal: () => ({ x: 0, y: 1 }),
    canReflectFrom: () => false,
  };
}

function testSurfaceFactory(index: number, start: Vector2, end: Vector2): Surface {
  return createMockSurface(`surface-${index}`, start, end);
}

function createTestChain(isClosed: boolean): SurfaceChain {
  return new SurfaceChain({
    vertices: [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ],
    isClosed,
    surfaceFactory: testSurfaceFactory,
  });
}

// =============================================================================
// JUNCTION POINT TESTS
// =============================================================================

describe("JunctionPoint (SourcePoint-like behavior)", () => {
  describe("computeXY()", () => {
    it("should return the exact vertex position", () => {
      const chain = createTestChain(true);
      const junctions = chain.getJunctionPoints();

      expect(junctions[0].computeXY()).toEqual({ x: 0, y: 0 });
      expect(junctions[1].computeXY()).toEqual({ x: 100, y: 0 });
      expect(junctions[2].computeXY()).toEqual({ x: 100, y: 100 });
      expect(junctions[3].computeXY()).toEqual({ x: 0, y: 100 });
    });
  });

  describe("equals()", () => {
    it("should return true for same chain and vertex index", () => {
      const chain = createTestChain(true);
      const junction1 = new JunctionPoint(chain, 1);
      const junction2 = new JunctionPoint(chain, 1);

      expect(junction1.equals(junction2)).toBe(true);
    });

    it("should return false for different vertex indices", () => {
      const chain = createTestChain(true);
      const junction1 = new JunctionPoint(chain, 1);
      const junction2 = new JunctionPoint(chain, 2);

      expect(junction1.equals(junction2)).toBe(false);
    });

    it("should return false for different chains", () => {
      const chain1 = createTestChain(true);
      const chain2 = createTestChain(true);
      const junction1 = new JunctionPoint(chain1, 1);
      const junction2 = new JunctionPoint(chain2, 1);

      expect(junction1.equals(junction2)).toBe(false);
    });
  });

  describe("getKey()", () => {
    it("should return unique key based on chain and vertex", () => {
      const chain = createTestChain(true);
      const junction1 = new JunctionPoint(chain, 1);
      const junction2 = new JunctionPoint(chain, 2);

      expect(junction1.getKey()).not.toBe(junction2.getKey());
    });

    it("should be stable (same junction = same key)", () => {
      const chain = createTestChain(true);
      const junction1 = new JunctionPoint(chain, 1);
      const junction2 = new JunctionPoint(chain, 1);

      expect(junction1.getKey()).toBe(junction2.getKey());
    });
  });

  describe("type", () => {
    it("should have type 'junction'", () => {
      const chain = createTestChain(true);
      const junction = new JunctionPoint(chain, 0);

      expect(junction.type).toBe("junction");
    });
  });
});

describe("ChainEndpoint (SourcePoint-like behavior)", () => {
  describe("computeXY()", () => {
    it("should return first vertex for 'start'", () => {
      const chain = createTestChain(false);
      const endpoints = chain.getEndpoints()!;

      expect(endpoints[0].which).toBe("start");
      expect(endpoints[0].computeXY()).toEqual({ x: 0, y: 0 });
    });

    it("should return last vertex for 'end'", () => {
      const chain = createTestChain(false);
      const endpoints = chain.getEndpoints()!;

      expect(endpoints[1].which).toBe("end");
      expect(endpoints[1].computeXY()).toEqual({ x: 0, y: 100 });
    });
  });

  describe("surface", () => {
    it("should return first surface for 'start' endpoint", () => {
      const chain = createTestChain(false);
      const endpoints = chain.getEndpoints()!;
      const surfaces = chain.getSurfaces();

      expect(endpoints[0].surface).toBe(surfaces[0]);
    });

    it("should return last surface for 'end' endpoint", () => {
      const chain = createTestChain(false);
      const endpoints = chain.getEndpoints()!;
      const surfaces = chain.getSurfaces();

      expect(endpoints[1].surface).toBe(surfaces[surfaces.length - 1]);
    });
  });

  describe("getKey()", () => {
    it("should return unique keys for start and end", () => {
      const chain = createTestChain(false);
      const endpoints = chain.getEndpoints()!;

      expect(endpoints[0].getKey()).not.toBe(endpoints[1].getKey());
    });
  });

  describe("type", () => {
    it("should have type 'chain-endpoint'", () => {
      const chain = createTestChain(false);
      const endpoint = chain.getEndpoints()![0];

      expect(endpoint.type).toBe("chain-endpoint");
    });
  });
});

describe("Type Guards", () => {
  it("isJunctionPoint should correctly identify JunctionPoint", () => {
    const chain = createTestChain(true);
    const junction = chain.getJunctionPoints()[0];
    const endpoint = new ChainEndpoint(chain, "start");

    expect(isJunctionPoint(junction)).toBe(true);
    expect(isJunctionPoint(endpoint)).toBe(false);
    expect(isJunctionPoint(null)).toBe(false);
    expect(isJunctionPoint({ type: "junction" })).toBe(false);
  });

  it("isChainEndpoint should correctly identify ChainEndpoint", () => {
    const chain = createTestChain(false);
    const endpoint = chain.getEndpoints()![0];
    const junction = new JunctionPoint(chain, 1);

    expect(isChainEndpoint(endpoint)).toBe(true);
    expect(isChainEndpoint(junction)).toBe(false);
    expect(isChainEndpoint(null)).toBe(false);
  });
});

