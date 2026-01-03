/**
 * TDD Test: Cone Boundary PreComputed Pairs
 * 
 * For windowed cones, all 4 boundary points should have their pairwise
 * orderings pre-computed to avoid floating-point errors in sorting.
 * 
 * The 4 points are:
 * - leftWindowOrigin (OriginPoint at left boundary)
 * - rightWindowOrigin (OriginPoint at right boundary)
 * - leftHit (HitPoint from ray through leftWindowOrigin)
 * - rightHit (HitPoint from ray through rightWindowOrigin)
 * 
 * CCW order (by provenance, no calculation needed):
 *   rightWindowOrigin → rightHit → leftHit → leftWindowOrigin
 */
import { describe, it, expect } from "vitest";
import {
  projectConeV2,
  createConeThroughWindow,
  toVector2Array,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import { createRicochetChain } from "@/trajectory-v2/geometry/SurfaceChain";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

// Helper to check if polygon has self-intersections
function hasSelfIntersection(vertices: Vector2[]): boolean {
  const edgesIntersect = (a1: Vector2, a2: Vector2, b1: Vector2, b2: Vector2): boolean => {
    const cross = (o: Vector2, a: Vector2, b: Vector2) =>
      (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

    const d1 = cross(b1, b2, a1);
    const d2 = cross(b1, b2, a2);
    const d3 = cross(a1, a2, b1);
    const d4 = cross(a1, a2, b2);

    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
           ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };

  for (let i = 0; i < vertices.length; i++) {
    const a1 = vertices[i]!;
    const a2 = vertices[(i + 1) % vertices.length]!;

    for (let j = i + 2; j < vertices.length; j++) {
      if ((j + 1) % vertices.length === i) continue;

      const b1 = vertices[j]!;
      const b2 = vertices[(j + 1) % vertices.length]!;

      if (edgesIntersect(a1, a2, b1, b2)) {
        return true;
      }
    }
  }
  return false;
}

describe("Cone Boundary PreComputed Pairs", () => {
  const SCREEN_BOUNDS = { minX: 0, minY: 0, maxX: 1280, maxY: 720 };

  // Horizontal surface at center of screen
  const HORIZONTAL_SURFACE = createRicochetChain("h1", [
    { x: 540, y: 300 },
    { x: 740, y: 300 },
  ]);

  it("should produce a non-self-intersecting polygon for reflected cone", () => {
    // This is the failing scenario from the bug
    const player = { x: 581, y: 81 };
    const surface = HORIZONTAL_SURFACE.getSurfaces()[0]!;

    // Reflect player through surface
    const reflectedOrigin = reflectPointThroughLine(
      player,
      surface.segment.start,
      surface.segment.end
    );

    // Create windowed cone through surface
    const window = { start: surface.segment.start, end: surface.segment.end };
    const cone = createConeThroughWindow(reflectedOrigin, window.start, window.end);

    // Get polygon
    const sourcePoints = projectConeV2(cone, [HORIZONTAL_SURFACE], SCREEN_BOUNDS, surface.id);
    const vertices = toVector2Array(sourcePoints);

    // Log for debugging
    console.log("Polygon vertices:");
    vertices.forEach((v, i) => {
      console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
    });

    // The polygon should NOT self-intersect
    expect(hasSelfIntersection(vertices)).toBe(false);
  });

  it("should have correct CCW order: rightWindow → rightHit → leftHit → leftWindow", () => {
    const player = { x: 581, y: 81 };
    const surface = HORIZONTAL_SURFACE.getSurfaces()[0]!;

    const reflectedOrigin = reflectPointThroughLine(
      player,
      surface.segment.start,
      surface.segment.end
    );

    const window = { start: surface.segment.start, end: surface.segment.end };
    const cone = createConeThroughWindow(reflectedOrigin, window.start, window.end);

    const sourcePoints = projectConeV2(cone, [HORIZONTAL_SURFACE], SCREEN_BOUNDS, surface.id);
    const vertices = toVector2Array(sourcePoints);

    // Expected CCW order based on provenance:
    // 1. rightWindowOrigin = startLine.start = (540, 300)
    // 2. rightHit = ~(483.84, 0)
    // 3. leftHit = ~(957.81, 0)
    // 4. leftWindowOrigin = startLine.end = (740, 300)

    // Find indices
    const rightWindowIdx = vertices.findIndex(v => 
      Math.abs(v.x - 540) < 1 && Math.abs(v.y - 300) < 1);
    const rightHitIdx = vertices.findIndex(v => 
      Math.abs(v.x - 483.84) < 1 && Math.abs(v.y - 0) < 1);
    const leftHitIdx = vertices.findIndex(v => 
      Math.abs(v.x - 957.81) < 1 && Math.abs(v.y - 0) < 1);
    const leftWindowIdx = vertices.findIndex(v => 
      Math.abs(v.x - 740) < 1 && Math.abs(v.y - 300) < 1);

    console.log(`Indices: rightWindow=${rightWindowIdx}, rightHit=${rightHitIdx}, leftHit=${leftHitIdx}, leftWindow=${leftWindowIdx}`);

    // All should be found
    expect(rightWindowIdx).toBeGreaterThanOrEqual(0);
    expect(rightHitIdx).toBeGreaterThanOrEqual(0);
    expect(leftHitIdx).toBeGreaterThanOrEqual(0);
    expect(leftWindowIdx).toBeGreaterThanOrEqual(0);

    // CCW order means: rightWindow < rightHit < leftHit < leftWindow (in index order)
    // Note: polygon wraps, so we check the relative ordering
    expect(rightWindowIdx).toBeLessThan(rightHitIdx);
    expect(rightHitIdx).toBeLessThan(leftHitIdx);
    expect(leftHitIdx).toBeLessThan(leftWindowIdx);
  });
});

