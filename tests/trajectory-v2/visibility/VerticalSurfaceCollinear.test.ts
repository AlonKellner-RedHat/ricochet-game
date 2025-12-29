/**
 * Test for visibility polygon when player is nearly collinear with a vertical surface.
 *
 * The visibility polygon sorts vertices by ANGLE first (CCW order), with DISTANCE
 * as a tie-breaker only when angles are exactly equal.
 *
 * When player.x ≠ surface.x (even by tiny amounts), the angles to the two endpoints
 * are different, so the order depends on which side of the surface the player is on:
 * - LEFT of surface: farther endpoint (y=350) comes first (smaller angle)
 * - RIGHT of surface: closer endpoint (y=500) comes first
 *
 * This is correct geometric behavior for CCW polygon traversal.
 */

import { describe, it, expect } from "vitest";
import { createFullCone, projectConeV2, toVector2Array } from "@/trajectory-v2/visibility/ConeProjectionV2";
import type { ScreenBoundsConfig } from "@/trajectory-v2/geometry/ScreenBoundaries";
import { createTestSurface } from "./testHelpers";

const SCREEN_BOUNDS: ScreenBoundsConfig = {
  minX: 0,
  maxX: 1280,
  minY: 0,
  maxY: 720,
};

describe("Vertical Surface Collinear Bug", () => {
  it("should order vertical surface endpoints correctly when player is on the LEFT of surface", () => {
    // Vertical surface at x=850, from y=350 to y=500
    const verticalSurface = createTestSurface("vertical", { x: 850, y: 350 }, { x: 850, y: 500 });

    // Player is to the LEFT of the surface (x=849.91 < 850)
    const player = { x: 849.9112183200014, y: 666 };
    const cone = createFullCone(player);

    const points = projectConeV2(cone, [verticalSurface], SCREEN_BOUNDS);
    const vertices = toVector2Array(points);

    console.log("Vertices around vertical surface:");
    for (const v of vertices) {
      if (Math.abs(v.x - 850) < 1 && v.y >= 350 && v.y <= 500) {
        console.log(`  (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
      }
    }

    // Find the two endpoints of the vertical surface in the output
    const surfaceVertices = vertices.filter(
      (v) => Math.abs(v.x - 850) < 0.1 && (Math.abs(v.y - 350) < 0.1 || Math.abs(v.y - 500) < 0.1)
    );

    console.log("Surface vertices:", surfaceVertices);

    // There should be exactly 2 vertices for the surface endpoints
    expect(surfaceVertices.length).toBeGreaterThanOrEqual(2);

    // Find indices in the full polygon
    const idx350 = vertices.findIndex((v) => Math.abs(v.x - 850) < 0.1 && Math.abs(v.y - 350) < 0.1);
    const idx500 = vertices.findIndex((v) => Math.abs(v.x - 850) < 0.1 && Math.abs(v.y - 500) < 0.1);

    console.log(`Index of (850, 350): ${idx350}`);
    console.log(`Index of (850, 500): ${idx500}`);

    // When player is LEFT of surface (x < 850), looking up-right:
    // - Angle to y=350 is more negative (farther up)
    // - Angle to y=500 is less negative (closer, less vertical)
    // CCW sort by angle: 350 comes before 500 (smaller angle first)
    expect(idx350).toBeLessThan(idx500);
  });

  it("should order vertical surface endpoints correctly when player is on the RIGHT of surface", () => {
    // Player at x=850.87 (RIGHT of surface at x=850)
    const verticalSurface = createTestSurface("vertical", { x: 850, y: 350 }, { x: 850, y: 500 });
    const player = { x: 850.865661985002, y: 666 };
    const cone = createFullCone(player);

    const points = projectConeV2(cone, [verticalSurface], SCREEN_BOUNDS);
    const vertices = toVector2Array(points);

    const idx350 = vertices.findIndex((v) => Math.abs(v.x - 850) < 0.1 && Math.abs(v.y - 350) < 0.1);
    const idx500 = vertices.findIndex((v) => Math.abs(v.x - 850) < 0.1 && Math.abs(v.y - 500) < 0.1);

    console.log(`Right side case: idx350=${idx350}, idx500=${idx500}`);

    // Both should be found
    expect(idx350).toBeGreaterThanOrEqual(0);
    expect(idx500).toBeGreaterThanOrEqual(0);

    // When player is RIGHT of surface (x > 850), looking up-left:
    // - Angle to y=500 is more negative (closer, steeper angle in 3rd quadrant)
    // - Angle to y=350 is less negative
    // CCW sort by angle: 500 comes before 350
    expect(idx500).toBeLessThan(idx350);
  });

  it("should have opposite ordering when player crosses from left to right of surface", () => {
    const verticalSurface = createTestSurface("vertical", { x: 850, y: 350 }, { x: 850, y: 500 });

    // LEFT case (x < 850)
    const playerLeft = { x: 849.9112183200014, y: 666 };
    const coneLeft = createFullCone(playerLeft);
    const pointsLeft = projectConeV2(coneLeft, [verticalSurface], SCREEN_BOUNDS);
    const verticesLeft = toVector2Array(pointsLeft);

    // RIGHT case (x > 850)
    const playerRight = { x: 850.865661985002, y: 666 };
    const coneRight = createFullCone(playerRight);
    const pointsRight = projectConeV2(coneRight, [verticalSurface], SCREEN_BOUNDS);
    const verticesRight = toVector2Array(pointsRight);

    // Find order in both cases
    const idx350Left = verticesLeft.findIndex(
      (v) => Math.abs(v.x - 850) < 0.1 && Math.abs(v.y - 350) < 0.1
    );
    const idx500Left = verticesLeft.findIndex(
      (v) => Math.abs(v.x - 850) < 0.1 && Math.abs(v.y - 500) < 0.1
    );

    const idx350Right = verticesRight.findIndex(
      (v) => Math.abs(v.x - 850) < 0.1 && Math.abs(v.y - 350) < 0.1
    );
    const idx500Right = verticesRight.findIndex(
      (v) => Math.abs(v.x - 850) < 0.1 && Math.abs(v.y - 500) < 0.1
    );

    console.log(`Left: idx350=${idx350Left}, idx500=${idx500Left}`);
    console.log(`Right: idx350=${idx350Right}, idx500=${idx500Right}`);

    // Check relative order
    const leftOrder = idx350Left < idx500Left ? "350-then-500" : "500-then-350";
    const rightOrder = idx350Right < idx500Right ? "350-then-500" : "500-then-350";

    console.log(`Left order: ${leftOrder}`);
    console.log(`Right order: ${rightOrder}`);

    // The orders should be OPPOSITE when crossing from left to right of the surface.
    // This is correct geometric behavior for CCW polygon traversal.
    // LEFT: looking up-right, 350 comes first
    // RIGHT: looking up-left, 500 comes first
    expect(leftOrder).toBe("350-then-500");
    expect(rightOrder).toBe("500-then-350");
  });

  it("should order aligned/stacked vertical surfaces with opposite traversal when player crosses sides", () => {
    // Two vertical surfaces stacked at x=850
    // Surface A: y=100 to y=200 (farther from player)
    // Surface B: y=300 to y=400 (closer to player)
    const surfaceA = createTestSurface("surface-a", { x: 850, y: 100 }, { x: 850, y: 200 });
    const surfaceB = createTestSurface("surface-b", { x: 850, y: 300 }, { x: 850, y: 400 });

    // Player on LEFT vs RIGHT of the surfaces
    const playerLeft = { x: 849.5, y: 500 };
    const playerRight = { x: 850.5, y: 500 };

    const coneLeft = createFullCone(playerLeft);
    const coneRight = createFullCone(playerRight);

    const pointsLeft = projectConeV2(coneLeft, [surfaceA, surfaceB], SCREEN_BOUNDS);
    const pointsRight = projectConeV2(coneRight, [surfaceA, surfaceB], SCREEN_BOUNDS);

    const verticesLeft = toVector2Array(pointsLeft);
    const verticesRight = toVector2Array(pointsRight);

    // Helper to find index of a point
    const findIdx = (vertices: { x: number; y: number }[], targetY: number) =>
      vertices.findIndex((v) => Math.abs(v.x - 850) < 0.1 && Math.abs(v.y - targetY) < 0.1);

    // Get indices for all 4 endpoints in both cases
    const leftIndices = {
      y100: findIdx(verticesLeft, 100),
      y200: findIdx(verticesLeft, 200),
      y300: findIdx(verticesLeft, 300),
      y400: findIdx(verticesLeft, 400),
    };

    const rightIndices = {
      y100: findIdx(verticesRight, 100),
      y200: findIdx(verticesRight, 200),
      y300: findIdx(verticesRight, 300),
      y400: findIdx(verticesRight, 400),
    };

    console.log("Left player indices:", leftIndices);
    console.log("Right player indices:", rightIndices);

    // All endpoints should be found
    expect(leftIndices.y100).toBeGreaterThanOrEqual(0);
    expect(leftIndices.y200).toBeGreaterThanOrEqual(0);
    expect(leftIndices.y300).toBeGreaterThanOrEqual(0);
    expect(leftIndices.y400).toBeGreaterThanOrEqual(0);

    expect(rightIndices.y100).toBeGreaterThanOrEqual(0);
    expect(rightIndices.y200).toBeGreaterThanOrEqual(0);
    expect(rightIndices.y300).toBeGreaterThanOrEqual(0);
    expect(rightIndices.y400).toBeGreaterThanOrEqual(0);

    // When player is on LEFT (x < 850), looking up-right at vertical surfaces:
    // Angles are all close to -90° but y100 has most negative angle.
    // CCW sort (increasing angle): y100 → y200 → y300 → y400 (top to bottom)
    expect(leftIndices.y100).toBeLessThan(leftIndices.y200);
    expect(leftIndices.y200).toBeLessThan(leftIndices.y300);
    expect(leftIndices.y300).toBeLessThan(leftIndices.y400);

    // When player is on RIGHT (x > 850), looking up-left at vertical surfaces:
    // Angles are all close to -90° but y100 has least negative angle.
    // CCW sort (increasing angle): y400 → y300 → y200 → y100 (bottom to top)
    expect(rightIndices.y400).toBeLessThan(rightIndices.y300);
    expect(rightIndices.y300).toBeLessThan(rightIndices.y200);
    expect(rightIndices.y200).toBeLessThan(rightIndices.y100);
  });

  it("should order horizontal surface endpoints with opposite traversal when player crosses sides", () => {
    // Horizontal surface at y=400, from x=300 to x=500
    const horizontalSurface = createTestSurface("horizontal", { x: 300, y: 400 }, { x: 500, y: 400 });

    // Player ABOVE vs BELOW the horizontal surface
    const playerAbove = { x: 600, y: 399.5 };
    const playerBelow = { x: 600, y: 400.5 };

    const coneAbove = createFullCone(playerAbove);
    const coneBelow = createFullCone(playerBelow);

    const pointsAbove = projectConeV2(coneAbove, [horizontalSurface], SCREEN_BOUNDS);
    const pointsBelow = projectConeV2(coneBelow, [horizontalSurface], SCREEN_BOUNDS);

    const verticesAbove = toVector2Array(pointsAbove);
    const verticesBelow = toVector2Array(pointsBelow);

    // Find indices for both endpoints
    const findIdx = (vertices: { x: number; y: number }[], targetX: number) =>
      vertices.findIndex((v) => Math.abs(v.x - targetX) < 0.1 && Math.abs(v.y - 400) < 0.1);

    const idx300Above = findIdx(verticesAbove, 300);
    const idx500Above = findIdx(verticesAbove, 500);
    const idx300Below = findIdx(verticesBelow, 300);
    const idx500Below = findIdx(verticesBelow, 500);

    console.log(`Above: idx300=${idx300Above}, idx500=${idx500Above}`);
    console.log(`Below: idx300=${idx300Below}, idx500=${idx500Below}`);

    // Both endpoints should be found
    expect(idx300Above).toBeGreaterThanOrEqual(0);
    expect(idx500Above).toBeGreaterThanOrEqual(0);
    expect(idx300Below).toBeGreaterThanOrEqual(0);
    expect(idx500Below).toBeGreaterThanOrEqual(0);

    // The relative order should be OPPOSITE when crossing from above to below
    // This is correct geometric behavior for CCW polygon traversal
    const aboveOrder = idx300Above < idx500Above ? "300-then-500" : "500-then-300";
    const belowOrder = idx300Below < idx500Below ? "300-then-500" : "500-then-300";

    console.log(`Above order: ${aboveOrder}`);
    console.log(`Below order: ${belowOrder}`);

    // Orders should be opposite when player is on opposite sides
    expect(aboveOrder).not.toBe(belowOrder);
  });
});

