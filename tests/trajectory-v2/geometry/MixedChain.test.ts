/**
 * TDD Tests for createMixedChain
 *
 * A mixed chain allows different surfaces in the same chain to have
 * different reflectivity (some reflective, some blocking).
 */
import { describe, it, expect } from "vitest";
import {
  createMixedChain,
  SurfaceChain,
} from "@/trajectory-v2/geometry/SurfaceChain";

describe("createMixedChain", () => {
  describe("basic chain creation", () => {
    it("should create a chain with the specified vertices", () => {
      const chain = createMixedChain(
        "test",
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
        [true, false], // 2 surfaces for 3 vertices (open chain)
        false
      );

      expect(chain).toBeInstanceOf(SurfaceChain);
      expect(chain.getSurfaces().length).toBe(2);
    });

    it("should create a closed chain with 4 surfaces for 4 vertices", () => {
      const chain = createMixedChain(
        "room",
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        [true, false, false, true], // 4 surfaces for closed chain
        true
      );

      expect(chain.getSurfaces().length).toBe(4);
    });
  });

  describe("reflectivity", () => {
    it("should create reflective surfaces where reflective[i] is true", () => {
      const chain = createMixedChain(
        "test",
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
        [true, false],
        false
      );

      const surfaces = chain.getSurfaces();

      // Surface 0 should be reflective (RicochetSurface → isPlannable = true)
      expect(surfaces[0]!.isPlannable()).toBe(true);
      expect(surfaces[0]!.surfaceType).toBe("ricochet");

      // Surface 1 should NOT be reflective (WallSurface → isPlannable = false)
      expect(surfaces[1]!.isPlannable()).toBe(false);
      expect(surfaces[1]!.surfaceType).toBe("wall");
    });

    it("should handle room-like configuration: ceiling and left-wall reflective", () => {
      // Vertices in CCW order: top-left → top-right → bottom-right → bottom-left
      // Surfaces: 0=ceiling (top), 1=right-wall, 2=floor (bottom), 3=left-wall
      const chain = createMixedChain(
        "room",
        [
          { x: 20, y: 80 },     // top-left
          { x: 1260, y: 80 },   // top-right
          { x: 1260, y: 700 },  // bottom-right
          { x: 20, y: 700 },    // bottom-left
        ],
        [true, false, false, true], // ceiling, right, floor, left
        true
      );

      const surfaces = chain.getSurfaces();

      expect(surfaces.length).toBe(4);

      // Ceiling (index 0): reflective
      expect(surfaces[0]!.isPlannable()).toBe(true);
      expect(surfaces[0]!.surfaceType).toBe("ricochet");
      expect(surfaces[0]!.id).toBe("room-0");

      // Right wall (index 1): non-reflective
      expect(surfaces[1]!.isPlannable()).toBe(false);
      expect(surfaces[1]!.surfaceType).toBe("wall");
      expect(surfaces[1]!.id).toBe("room-1");

      // Floor (index 2): non-reflective
      expect(surfaces[2]!.isPlannable()).toBe(false);
      expect(surfaces[2]!.surfaceType).toBe("wall");
      expect(surfaces[2]!.id).toBe("room-2");

      // Left wall (index 3): reflective
      expect(surfaces[3]!.isPlannable()).toBe(true);
      expect(surfaces[3]!.surfaceType).toBe("ricochet");
      expect(surfaces[3]!.id).toBe("room-3");
    });
  });

  describe("junctions", () => {
    it("should create 4 JunctionPoints for a closed rectangular chain", () => {
      const chain = createMixedChain(
        "room",
        [
          { x: 20, y: 80 },
          { x: 1260, y: 80 },
          { x: 1260, y: 700 },
          { x: 20, y: 700 },
        ],
        [true, false, false, true],
        true
      );

      const junctions = chain.getJunctionPoints();

      expect(junctions.length).toBe(4);

      // Verify junction positions
      const positions = junctions.map((j) => j.computeXY());
      expect(positions).toContainEqual({ x: 20, y: 80 });
      expect(positions).toContainEqual({ x: 1260, y: 80 });
      expect(positions).toContainEqual({ x: 1260, y: 700 });
      expect(positions).toContainEqual({ x: 20, y: 700 });
    });

    it("should NOT create junctions for open chain endpoints", () => {
      const chain = createMixedChain(
        "test",
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
        [true, false],
        false // open chain
      );

      const junctions = chain.getJunctionPoints();

      // Open chain with 3 vertices has 1 internal junction (at middle vertex)
      expect(junctions.length).toBe(1);
      expect(junctions[0]!.computeXY()).toEqual({ x: 100, y: 0 });
    });
  });

  describe("surface geometry", () => {
    it("should preserve correct surface segments", () => {
      const chain = createMixedChain(
        "room",
        [
          { x: 20, y: 80 },
          { x: 1260, y: 80 },
          { x: 1260, y: 700 },
          { x: 20, y: 700 },
        ],
        [true, false, false, true],
        true
      );

      const surfaces = chain.getSurfaces();

      // Ceiling: top-left to top-right
      expect(surfaces[0]!.segment.start).toEqual({ x: 20, y: 80 });
      expect(surfaces[0]!.segment.end).toEqual({ x: 1260, y: 80 });

      // Right wall: top-right to bottom-right
      expect(surfaces[1]!.segment.start).toEqual({ x: 1260, y: 80 });
      expect(surfaces[1]!.segment.end).toEqual({ x: 1260, y: 700 });

      // Floor: bottom-right to bottom-left
      expect(surfaces[2]!.segment.start).toEqual({ x: 1260, y: 700 });
      expect(surfaces[2]!.segment.end).toEqual({ x: 20, y: 700 });

      // Left wall: bottom-left to top-left (closes the loop)
      expect(surfaces[3]!.segment.start).toEqual({ x: 20, y: 700 });
      expect(surfaces[3]!.segment.end).toEqual({ x: 20, y: 80 });
    });
  });
});

