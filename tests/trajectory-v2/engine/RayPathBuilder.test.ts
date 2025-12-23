/**
 * Tests for RayPathBuilder - Ray-Based Path Building
 *
 * TDD tests for the ray-based path construction system.
 * This verifies that ray-based paths produce the same results as point-based paths.
 */

import { describe, it, expect } from "vitest";
import { createImageChain } from "@/trajectory-v2/engine/ImageChain";
import {
  buildPlannedRayPath,
  buildActualRayPath,
  rayPathToPoints,
  type RayPath,
} from "@/trajectory-v2/engine/RayPathBuilder";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

// Helper to create a test surface
function createTestSurface(
  id: string,
  start: Vector2,
  end: Vector2,
  canReflect = true
): Surface {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  return {
    id,
    segment: { start, end },
    surfaceType: canReflect ? "ricochet" : "wall",
    onArrowHit: () => ({ type: canReflect ? "reflect" : "stop" }),
    isPlannable: () => canReflect,
    getVisualProperties: () => ({ color: 0xffffff, lineWidth: 2, alpha: 1 }),
    getNormal: () => ({ x: -dy / len, y: dx / len }),
    canReflectFrom: () => canReflect,
  };
}

describe("RayPathBuilder", () => {
  describe("buildPlannedRayPath", () => {
    it("returns single ray for empty plan", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 500, y: 300 };
      const chain = createImageChain(player, cursor, []);

      const rayPath = buildPlannedRayPath(chain);

      expect(rayPath.rays.length).toBe(1);
      expect(rayPath.rays[0]!.source).toEqual(player);
      expect(rayPath.rays[0]!.target).toEqual(cursor);
      expect(rayPath.hits.length).toBe(0);
    });

    it("returns two rays for single surface plan", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 150, y: 300 };
      const surface = createTestSurface("s1", { x: 300, y: 100 }, { x: 300, y: 400 });
      const chain = createImageChain(player, cursor, [surface]);

      const rayPath = buildPlannedRayPath(chain);

      expect(rayPath.rays.length).toBe(2);
      expect(rayPath.hits.length).toBe(1);

      // First ray: player → reflection point
      expect(rayPath.rays[0]!.source.x).toBeCloseTo(100, 5);

      // Second ray: reflection point → cursor
      expect(rayPath.rays[1]!.target.x).toBeCloseTo(150, 5);

      // Rays should connect at reflection point
      expect(rayPath.rays[0]!.target.x).toBeCloseTo(rayPath.rays[1]!.source.x, 5);
    });

    it("returns n+1 rays for n surface plan", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 800, y: 300 };
      const surface1 = createTestSurface("s1", { x: 300, y: 100 }, { x: 300, y: 500 });
      const surface2 = createTestSurface("s2", { x: 500, y: 100 }, { x: 500, y: 500 });
      const chain = createImageChain(player, cursor, [surface1, surface2]);

      const rayPath = buildPlannedRayPath(chain);

      expect(rayPath.rays.length).toBe(3);
      expect(rayPath.hits.length).toBe(2);
    });

    it("ray hits contain correct surface references", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 150, y: 300 };
      const surface = createTestSurface("s1", { x: 300, y: 100 }, { x: 300, y: 400 });
      const chain = createImageChain(player, cursor, [surface]);

      const rayPath = buildPlannedRayPath(chain);

      expect(rayPath.hits[0]!.surface.id).toBe("s1");
      expect(rayPath.hits[0]!.point.x).toBeCloseTo(300, 5);
    });
  });

  describe("buildActualRayPath", () => {
    it("returns single ray when no obstacles", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 500, y: 300 };
      const chain = createImageChain(player, cursor, []);
      const allSurfaces: Surface[] = [];

      const rayPath = buildActualRayPath(chain, allSurfaces);

      expect(rayPath.rays.length).toBe(1);
      expect(rayPath.rays[0]!.source.x).toBeCloseTo(100, 5);
    });

    it("reflects off on-segment hits", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 150, y: 300 };
      const surface = createTestSurface("s1", { x: 300, y: 100 }, { x: 300, y: 500 });
      const chain = createImageChain(player, cursor, [surface]);
      const allSurfaces = [surface];

      const rayPath = buildActualRayPath(chain, allSurfaces);

      // Should have 2 rays: player → surface → toward cursor
      expect(rayPath.rays.length).toBe(2);
      expect(rayPath.hits.length).toBe(1);
      expect(rayPath.hits[0]!.onSegment).toBe(true);
    });

    it("stops at walls", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 500, y: 300 };
      const wall = createTestSurface("wall", { x: 300, y: 100 }, { x: 300, y: 500 }, false);
      const chain = createImageChain(player, cursor, []);
      const allSurfaces = [wall];

      const rayPath = buildActualRayPath(chain, allSurfaces);

      expect(rayPath.rays.length).toBe(1);
      expect(rayPath.hits.length).toBe(1);
      expect(rayPath.termination).toBe("wall");
    });

    it("detects off-segment planned hits as non-reflective", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 400, y: 300 }; // Cursor far from surface
      // Surface is short - hit will be off-segment
      const surface = createTestSurface("s1", { x: 300, y: 290 }, { x: 300, y: 295 });
      const chain = createImageChain(player, cursor, [surface]);
      const allSurfaces = [surface];

      const rayPath = buildActualRayPath(chain, allSurfaces);

      // The actual path should NOT reflect because hit is off-segment
      expect(rayPath.rays.length).toBe(1);
    });
  });

  describe("rayPathToPoints", () => {
    it("converts empty plan to two points", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 500, y: 300 };
      const chain = createImageChain(player, cursor, []);

      const rayPath = buildPlannedRayPath(chain);
      const points = rayPathToPoints(rayPath);

      expect(points.length).toBe(2);
      expect(points[0]).toEqual(player);
      expect(points[1]).toEqual(cursor);
    });

    it("converts single surface plan to three points", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 150, y: 300 };
      const surface = createTestSurface("s1", { x: 300, y: 100 }, { x: 300, y: 400 });
      const chain = createImageChain(player, cursor, [surface]);

      const rayPath = buildPlannedRayPath(chain);
      const points = rayPathToPoints(rayPath);

      expect(points.length).toBe(3);
      expect(points[0]!.x).toBeCloseTo(100, 5);
      expect(points[1]!.x).toBeCloseTo(300, 5); // Reflection point
      expect(points[2]!.x).toBeCloseTo(150, 5);
    });
  });

  describe("consistency with ImageChain", () => {
    it("planned ray path waypoints match ImageChain reflection points", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 800, y: 300 };
      const surface1 = createTestSurface("s1", { x: 300, y: 100 }, { x: 300, y: 500 });
      const surface2 = createTestSurface("s2", { x: 500, y: 100 }, { x: 500, y: 500 });
      const chain = createImageChain(player, cursor, [surface1, surface2]);

      const rayPath = buildPlannedRayPath(chain);

      // Verify each hit matches the chain's reflection points
      for (let i = 0; i < chain.surfaces.length; i++) {
        const chainPoint = chain.getReflectionPoint(i);
        const rayHit = rayPath.hits[i]!;

        expect(rayHit.point.x).toBeCloseTo(chainPoint.x, 10);
        expect(rayHit.point.y).toBeCloseTo(chainPoint.y, 10);
      }
    });

    it("rays derive from ImageChain getRay method", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 150, y: 300 };
      const surface = createTestSurface("s1", { x: 300, y: 100 }, { x: 300, y: 400 });
      const chain = createImageChain(player, cursor, [surface]);

      const chainRay = chain.getRay(0);
      const rayPath = buildPlannedRayPath(chain);

      // First ray in path should match chain.getRay(0) direction
      const pathRay = rayPath.rays[0]!;

      // Same source
      expect(pathRay.source.x).toBeCloseTo(chainRay.source.x, 5);
      expect(pathRay.source.y).toBeCloseTo(chainRay.source.y, 5);

      // Direction should be parallel (cross product near zero)
      const chainDx = chainRay.target.x - chainRay.source.x;
      const chainDy = chainRay.target.y - chainRay.source.y;
      const pathDx = pathRay.target.x - pathRay.source.x;
      const pathDy = pathRay.target.y - pathRay.source.y;

      const cross = chainDx * pathDy - chainDy * pathDx;
      expect(Math.abs(cross)).toBeLessThan(1);
    });
  });
});

