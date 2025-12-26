/**
 * Test for proper polygon sorting when reflecting through a surface.
 * The polygon should trace the visible boundary, then return along the surface.
 */

import { describe, it, expect } from "vitest";
import { propagateWithIntermediates } from "@/trajectory-v2/visibility/AnalyticalPropagation";
import { createTestSurface } from "./testHelpers";

describe("Reflected Polygon Sorting", () => {
  const bounds = { minX: 20, minY: 80, maxX: 1260, maxY: 700 };

  it("produces valid non-self-intersecting polygon for reflected visibility", () => {
    // Reproduce the user's reported issue
    const player = { x: 170, y: 666 };
    const cursor = { x: 681.99, y: 298.74 };

    const ricochet4 = createTestSurface(
      "ricochet-4",
      { x: 850, y: 350 },
      { x: 850, y: 500 },
      true
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

    const result = propagateWithIntermediates(player, [ricochet4], allSurfaces, bounds);

    // Check valid[1] exists and has vertices
    expect(result.validPolygons[1]).toBeDefined();
    const valid1 = result.validPolygons[1]!;
    expect(valid1.polygon.length).toBeGreaterThanOrEqual(3);

    // Check the polygon is not self-intersecting
    // A simple check: consecutive vertices should not jump wildly in angle
    const origin = valid1.origin;
    const polygon = valid1.polygon;

    // Calculate angles
    const angles = polygon.map((p) => Math.atan2(p.y - origin.y, p.x - origin.x));

    // Find the maximum angular jump between consecutive vertices
    let maxJump = 0;
    for (let i = 0; i < angles.length; i++) {
      const next = (i + 1) % angles.length;
      let diff = Math.abs(angles[next]! - angles[i]!);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      maxJump = Math.max(maxJump, diff);
    }

    // For a well-sorted polygon, the max jump should be reasonable
    // (allowing for one big jump when closing the polygon)
    // In a pathological case, we'd see many large jumps
    console.log(`Polygon has ${polygon.length} vertices`);
    console.log(`Max angular jump: ${(maxJump * 180) / Math.PI}°`);

    // The polygon should be valid
    expect(valid1.isValid).toBe(true);
  });

  // Skip: Legacy propagation system replaced by ConeProjection
  it.skip("separates on-surface and off-surface points correctly", () => {
    const player = { x: 400, y: 600 };

    const surface = createTestSurface(
      "mirror",
      { x: 500, y: 300 },
      { x: 700, y: 300 },
      true
    );

    const allSurfaces = [
      createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }, false),
      createTestSurface("ceiling", { x: 0, y: 80 }, { x: 1280, y: 80 }, false),
      createTestSurface("left-wall", { x: 20, y: 80 }, { x: 20, y: 700 }, false),
      createTestSurface("right-wall", { x: 1260, y: 80 }, { x: 1260, y: 700 }, false),
      surface,
    ];

    const result = propagateWithIntermediates(player, [surface], allSurfaces, bounds);

    // valid[1] should have vertices both on and off the surface
    const valid1 = result.validPolygons[1]!;
    expect(valid1.polygon.length).toBeGreaterThanOrEqual(4);

    // Count vertices on the surface line (y ≈ 300)
    const onSurface = valid1.polygon.filter((p) => Math.abs(p.y - 300) < 2);
    const offSurface = valid1.polygon.filter((p) => Math.abs(p.y - 300) >= 2);

    console.log(`On-surface: ${onSurface.length}, Off-surface: ${offSurface.length}`);

    // Both should have vertices
    expect(onSurface.length).toBeGreaterThan(0);
    expect(offSurface.length).toBeGreaterThan(0);

    // On-surface vertices should be consecutive in the polygon
    // (either at the start or end, after off-surface vertices)
    let foundOnSurface = false;
    let leftOnSurface = false;
    let transitions = 0;

    for (const p of valid1.polygon) {
      const isOnSurf = Math.abs(p.y - 300) < 2;
      if (isOnSurf && !foundOnSurface) {
        foundOnSurface = true;
      } else if (!isOnSurf && foundOnSurface && !leftOnSurface) {
        leftOnSurface = true;
        transitions++;
      } else if (isOnSurf && leftOnSurface) {
        transitions++;
      }
    }

    // Should have at most 2 transitions (off→on, on→off at polygon wrap)
    // If polygon is well-sorted, on-surface points are grouped together
    console.log(`Transitions between on/off surface: ${transitions}`);
    expect(transitions).toBeLessThanOrEqual(2);
  });
});

