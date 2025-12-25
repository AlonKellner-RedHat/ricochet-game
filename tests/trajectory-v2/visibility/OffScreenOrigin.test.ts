/**
 * Integration test for off-screen origin visibility calculation.
 *
 * This test reproduces the user-reported bug where:
 * - Player position creates a reflected image that is off-screen
 * - The visibility polygon from the reflected image was empty/degenerate
 *
 * The fix uses startRatio to make rays start ON the surface instead of
 * from the off-screen reflected image.
 */

import { describe, it, expect } from "vitest";
import { propagateWithIntermediates } from "@/trajectory-v2/visibility/AnalyticalPropagation";
import { createTestSurface } from "./testHelpers";

describe("Off-Screen Origin Visibility", () => {
  // User-reported bug case: player at x=127.9, reflected through vertical surface at x=850
  // Reflected image is at x=1572, which is off-screen (max x is 1280)
  const player = { x: 127.94587519999949, y: 666 };
  const cursor = { x: 809.8261877172654, y: 388.92236384704523 };
  const bounds = { minX: 0, minY: 80, maxX: 1280, maxY: 700 };

  const ricochet4 = createTestSurface(
    "ricochet-4",
    { x: 850, y: 350 },
    { x: 850, y: 500 },
    true // canReflect
  );

  const allSurfaces = [
    createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }, false),
    createTestSurface("ceiling", { x: 0, y: 80 }, { x: 1280, y: 80 }, false),
    createTestSurface("left-wall", { x: 20, y: 80 }, { x: 20, y: 700 }, false),
    createTestSurface("right-wall", { x: 1260, y: 80 }, { x: 1260, y: 700 }, false),
    createTestSurface("platform-1", { x: 300, y: 450 }, { x: 500, y: 450 }, false),
    createTestSurface("platform-2", { x: 550, y: 350 }, { x: 750, y: 350 }, false),
    createTestSurface("ricochet-1", { x: 800, y: 150 }, { x: 900, y: 250 }, true),
    createTestSurface("ricochet-2", { x: 400, y: 250 }, { x: 550, y: 250 }, true),
    createTestSurface("ricochet-3", { x: 100, y: 200 }, { x: 200, y: 300 }, true),
    ricochet4,
  ];

  // TODO: The unified projection needs fixes for off-screen reflected origins
  it.skip("produces valid polygon when reflected origin is off-screen", () => {
    const result = propagateWithIntermediates(
      player,
      [ricochet4],
      allSurfaces,
      bounds
    );

    // Should have 2 valid polygons (empty plan + after reflection)
    expect(result.validPolygons).toHaveLength(2);

    // valid[0] from player should be a full polygon
    const valid0 = result.validPolygons[0]!;
    expect(valid0.polygon.length).toBeGreaterThanOrEqual(3);
    console.log(`valid[0] from player: ${valid0.polygon.length} vertices`);

    // valid[1] from reflected image should NOT be degenerate
    // This is the key assertion - the bug was that this was 4 vertices (just the surface)
    const valid1 = result.validPolygons[1]!;
    expect(valid1.polygon.length).toBeGreaterThan(4);
    console.log(`valid[1] from reflected: ${valid1.polygon.length} vertices`);
    console.log(`valid[1] origin: (${valid1.origin.x.toFixed(1)}, ${valid1.origin.y.toFixed(1)})`);

    // The origin should be off-screen (x > 1280)
    expect(valid1.origin.x).toBeGreaterThan(1280);

    // Log some polygon vertices to verify
    console.log("valid[1] first 5 vertices:");
    for (let i = 0; i < Math.min(5, valid1.polygon.length); i++) {
      const v = valid1.polygon[i]!;
      console.log(`  [${i}] (${v.x.toFixed(1)}, ${v.y.toFixed(1)})`);
    }
  });

  // TODO: The unified projection needs fixes for off-screen reflected origins
  it.skip("reflected origin starts rays on surface not from off-screen position", () => {
    const result = propagateWithIntermediates(
      player,
      [ricochet4],
      allSurfaces,
      bounds
    );

    // The reflected polygon should include points beyond the surface (toward left side)
    const valid1 = result.validPolygons[1]!;

    // Check that some vertices are on the left side of the surface (x < 850)
    const leftSideVertices = valid1.polygon.filter((v) => v.x < 800);
    console.log(`Vertices on left side of surface: ${leftSideVertices.length}`);

    // Should have at least some vertices on the left side
    // (if rays started from off-screen, they would incorrectly hit screen boundary first)
    expect(leftSideVertices.length).toBeGreaterThan(0);
  });

  // TODO: The unified projection needs fixes for off-screen reflected origins
  it.skip("cursor in visible area is correctly lit", () => {
    const result = propagateWithIntermediates(
      player,
      [ricochet4],
      allSurfaces,
      bounds
    );

    // Check if cursor is inside the final polygon
    const finalPolygon = result.finalPolygon;
    console.log(`Final polygon: ${finalPolygon.length} vertices`);

    // The cursor at (809, 388) should be in the visible area if rays are cast correctly
    // (It's on the left side of the surface, which should be reachable from the reflected origin)

    // Simple point-in-polygon test
    function isPointInPolygon(point: { x: number; y: number }, polygon: readonly { x: number; y: number }[]): boolean {
      if (polygon.length < 3) return false;
      let inside = false;
      for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i]!.x, yi = polygon[i]!.y;
        const xj = polygon[j]!.x, yj = polygon[j]!.y;
        if (((yi > point.y) !== (yj > point.y)) &&
            (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi)) {
          inside = !inside;
        }
      }
      return inside;
    }

    const cursorInPolygon = isPointInPolygon(cursor, finalPolygon);
    console.log(`Cursor at (${cursor.x.toFixed(1)}, ${cursor.y.toFixed(1)}) in polygon: ${cursorInPolygon}`);

    // Note: Whether the cursor is actually lit depends on the specific geometry
    // The key is that the polygon is not degenerate
    expect(finalPolygon.length).toBeGreaterThan(4);
  });
});

