/**
 * Tests for JunctionPoint extending SourcePoint.
 *
 * TDD tests verifying that JunctionPoint properly extends SourcePoint:
 * - instanceof SourcePoint check
 * - computeXY() returns correct coordinates
 * - isOnSurface() returns true for both adjacent surfaces
 * - equals() works correctly
 * - getKey() returns unique, stable keys
 * - canLightPassWithOrientations(): opposite orientations → true, same → false
 */

import { describe, it, expect } from "vitest";
import {
  SurfaceChain,
  JunctionPoint,
  isJunctionPoint,
} from "@/trajectory-v2/geometry/SurfaceChain";
import { SourcePoint } from "@/trajectory-v2/geometry/SourcePoint";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import {
  computeSurfaceOrientation,
  type SurfaceOrientation,
} from "@/trajectory-v2/visibility/ConeProjectionV2";

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

/**
 * Create a V-shape chain (^) with apex at (50, 0).
 * Left arm: (0, 100) to (50, 0)
 * Right arm: (50, 0) to (100, 100)
 * Junction at vertex 1 (apex)
 */
function createVShapeChain(): SurfaceChain {
  return new SurfaceChain({
    vertices: [
      { x: 0, y: 100 }, // vertex 0: left bottom
      { x: 50, y: 0 }, // vertex 1: apex (junction)
      { x: 100, y: 100 }, // vertex 2: right bottom
    ],
    isClosed: false,
    surfaceFactory: testSurfaceFactory,
  });
}

// =============================================================================
// JUNCTION POINT AS SOURCEPOINT TESTS
// =============================================================================

describe("JunctionPoint extends SourcePoint", () => {
  describe("instanceof check", () => {
    it("should be an instance of SourcePoint", () => {
      const chain = createTestChain(true);
      const junction = chain.getJunctionPoints()[0];

      expect(junction).toBeInstanceOf(SourcePoint);
    });
  });

  describe("computeXY()", () => {
    it("should return the exact vertex position", () => {
      const chain = createTestChain(true);
      const junctions = chain.getJunctionPoints();

      expect(junctions[0]!.computeXY()).toEqual({ x: 0, y: 0 });
      expect(junctions[1]!.computeXY()).toEqual({ x: 100, y: 0 });
      expect(junctions[2]!.computeXY()).toEqual({ x: 100, y: 100 });
      expect(junctions[3]!.computeXY()).toEqual({ x: 0, y: 100 });
    });
  });

  describe("isOnSurface()", () => {
    it("should return true for surfaceBefore", () => {
      const chain = createTestChain(true);
      const junction = chain.getJunctionPoints()[1]!; // junction at (100, 0)
      const surfaceBefore = junction.getSurfaceBefore();

      expect(junction.isOnSurface(surfaceBefore)).toBe(true);
    });

    it("should return true for surfaceAfter", () => {
      const chain = createTestChain(true);
      const junction = chain.getJunctionPoints()[1]!; // junction at (100, 0)
      const surfaceAfter = junction.getSurfaceAfter();

      expect(junction.isOnSurface(surfaceAfter)).toBe(true);
    });

    it("should return false for unrelated surface", () => {
      const chain = createTestChain(true);
      const junction = chain.getJunctionPoints()[1]!; // junction at (100, 0)
      const unrelatedSurface = createMockSurface("unrelated", { x: 500, y: 500 }, { x: 600, y: 600 });

      expect(junction.isOnSurface(unrelatedSurface)).toBe(false);
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

// =============================================================================
// LIGHT PASS-THROUGH TESTS (PROVENANCE-BASED)
// =============================================================================

describe("JunctionPoint.canLightPassWithOrientations()", () => {
  /**
   * V-shape geometry (^) with apex at (50, 0):
   *
   *        apex (50,0)
   *         /\
   *        /  \
   *       /    \
   *      /      \
   *   (0,100)  (100,100)
   *
   * Left arm: (0,100) → (50,0)
   * Right arm: (50,0) → (100,100)
   */

  it("should return true when origin is to the LEFT (opposite orientations)", () => {
    const chain = createVShapeChain();
    const apex = chain.getJunctionPoints()[0]!; // Only junction in open chain

    // Origin to the left of the V
    const origin: Vector2 = { x: -50, y: 50 };

    // Compute orientations using the existing infrastructure
    const surfaces = chain.getSurfaces();
    const orientations = new Map<string, SurfaceOrientation>();
    for (const surface of surfaces) {
      orientations.set(surface.id, computeSurfaceOrientation(surface, origin));
    }

    // Left origin → surfaces have OPPOSITE orientations → light passes
    expect(apex.canLightPassWithOrientations(orientations)).toBe(true);
  });

  it("should return true when origin is to the RIGHT (opposite orientations)", () => {
    const chain = createVShapeChain();
    const apex = chain.getJunctionPoints()[0]!;

    // Origin to the right of the V
    const origin: Vector2 = { x: 150, y: 50 };

    const surfaces = chain.getSurfaces();
    const orientations = new Map<string, SurfaceOrientation>();
    for (const surface of surfaces) {
      orientations.set(surface.id, computeSurfaceOrientation(surface, origin));
    }

    // Right origin → surfaces have OPPOSITE orientations → light passes
    expect(apex.canLightPassWithOrientations(orientations)).toBe(true);
  });

  it("should return false when origin is ABOVE (same orientations)", () => {
    const chain = createVShapeChain();
    const apex = chain.getJunctionPoints()[0]!;

    // Origin above the V (apex is at y=0, so above means negative y)
    const origin: Vector2 = { x: 50, y: -50 };

    const surfaces = chain.getSurfaces();
    const orientations = new Map<string, SurfaceOrientation>();
    for (const surface of surfaces) {
      orientations.set(surface.id, computeSurfaceOrientation(surface, origin));
    }

    // Above origin → both surfaces face TOWARD origin → SAME orientation → blocked
    expect(apex.canLightPassWithOrientations(orientations)).toBe(false);
  });

  it("should return false when origin is BELOW (same orientations)", () => {
    const chain = createVShapeChain();
    const apex = chain.getJunctionPoints()[0]!;

    // Origin below the V (at y=200, way below the base at y=100)
    const origin: Vector2 = { x: 50, y: 200 };

    const surfaces = chain.getSurfaces();
    const orientations = new Map<string, SurfaceOrientation>();
    for (const surface of surfaces) {
      orientations.set(surface.id, computeSurfaceOrientation(surface, origin));
    }

    // Below origin → both surfaces face AWAY from origin → SAME orientation → blocked
    expect(apex.canLightPassWithOrientations(orientations)).toBe(false);
  });

  it("should return false when orientations are missing", () => {
    const chain = createVShapeChain();
    const apex = chain.getJunctionPoints()[0]!;

    // Empty orientations map
    const emptyOrientations = new Map<string, SurfaceOrientation>();

    expect(apex.canLightPassWithOrientations(emptyOrientations)).toBe(false);
  });
});

// =============================================================================
// TYPE GUARD TESTS
// =============================================================================

describe("Type Guards", () => {
  it("isJunctionPoint should correctly identify JunctionPoint", () => {
    const chain = createTestChain(true);
    const junction = chain.getJunctionPoints()[0];

    expect(isJunctionPoint(junction)).toBe(true);
    expect(isJunctionPoint(null)).toBe(false);
    expect(isJunctionPoint({ type: "junction" })).toBe(false);
  });
});
