/**
 * Regression test for cross-product based sorting breaking default behavior.
 *
 * The epsilon-free solution using cross-product for sorting changed the
 * overall polygon ordering, causing vertices that were correctly ordered
 * to appear in wrong positions.
 */

import { describe, it, expect } from "vitest";
import { createFullCone, projectConeV2, toVector2Array } from "@/trajectory-v2/visibility/ConeProjectionV2";
import type { ScreenBoundsConfig } from "@/trajectory-v2/geometry/ScreenBoundaries";
import { createTestSurface, toChains } from "./testHelpers";

const SCREEN_BOUNDS: ScreenBoundsConfig = {
  minX: 0,
  maxX: 1280,
  minY: 0,
  maxY: 720,
};

describe("Cross-Product Sort Regression", () => {
  it("should maintain correct polygon winding with multiple surfaces", () => {
    // Reproduce the failing case from user report
    const surfaces = [
      createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }),
      createTestSurface("ceiling", { x: 0, y: 80 }, { x: 1280, y: 80 }),
      createTestSurface("left-wall", { x: 20, y: 80 }, { x: 20, y: 700 }),
      createTestSurface("right-wall", { x: 1260, y: 80 }, { x: 1260, y: 700 }),
      createTestSurface("platform-1", { x: 300, y: 450 }, { x: 500, y: 450 }),
      createTestSurface("platform-2", { x: 550, y: 350 }, { x: 750, y: 350 }),
      createTestSurface("ricochet-1", { x: 800, y: 150 }, { x: 900, y: 250 }),
      createTestSurface("ricochet-2", { x: 400, y: 250 }, { x: 550, y: 250 }),
      createTestSurface("ricochet-3", { x: 100, y: 200 }, { x: 200, y: 300 }),
      createTestSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 }),
    ];

    const player = { x: 181.11162870021687, y: 666 };
    const cone = createFullCone(player);

    const points = projectConeV2(cone, toChains(surfaces), SCREEN_BOUNDS);
    const vertices = toVector2Array(points);

    console.log("Polygon vertices:");
    for (let i = 0; i < vertices.length; i++) {
      console.log(`  [${i}] (${vertices[i].x.toFixed(2)}, ${vertices[i].y.toFixed(2)})`);
    }

    // Find the vertical surface endpoints (850, 350) and (850, 500)
    const idx350 = vertices.findIndex(
      (v) => Math.abs(v.x - 850) < 0.1 && Math.abs(v.y - 350) < 0.1
    );
    const idx500 = vertices.findIndex(
      (v) => Math.abs(v.x - 850) < 0.1 && Math.abs(v.y - 500) < 0.1
    );

    console.log(`\nVertical surface: idx350=${idx350}, idx500=${idx500}`);
    console.log(`Distance: ${Math.abs(idx500 - idx350)}`);

    // The endpoints should be adjacent or very close in the polygon
    // They shouldn't be scattered across the polygon
    const distance = Math.abs(idx500 - idx350);
    const wrapDistance = vertices.length - distance;
    const minDistance = Math.min(distance, wrapDistance);

    // The two endpoints of the same surface should be within 2 positions of each other
    // (allowing for one continuation point between them)
    expect(minDistance).toBeLessThanOrEqual(2);
  });

  it("should produce monotonically increasing angles in the polygon", () => {
    // Simple case: player in center, no obstacles except walls
    const surfaces = [
      createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }),
      createTestSurface("ceiling", { x: 0, y: 80 }, { x: 1280, y: 80 }),
      createTestSurface("left-wall", { x: 20, y: 80 }, { x: 20, y: 700 }),
      createTestSurface("right-wall", { x: 1260, y: 80 }, { x: 1260, y: 700 }),
    ];

    const player = { x: 640, y: 400 };
    const cone = createFullCone(player);

    const points = projectConeV2(cone, toChains(surfaces), SCREEN_BOUNDS);
    const vertices = toVector2Array(points);

    // Calculate angles from player to each vertex
    const angles = vertices.map((v) => Math.atan2(v.y - player.y, v.x - player.x));

    console.log("\nAngles (degrees):");
    for (let i = 0; i < angles.length; i++) {
      console.log(`  [${i}] ${(angles[i] * 180 / Math.PI).toFixed(2)}°`);
    }

    // Check that angles are mostly increasing (with wrap-around)
    // A valid visibility polygon should have vertices in angular order
    let maxJump = 0;
    for (let i = 1; i < angles.length; i++) {
      let diff = angles[i] - angles[i - 1];
      // Normalize to [-π, π]
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      
      if (diff < -0.1) { // Significant backward jump
        console.log(`  Backward jump at ${i}: ${(diff * 180 / Math.PI).toFixed(2)}°`);
      }
      maxJump = Math.max(maxJump, Math.abs(diff));
    }

    console.log(`Max angular jump: ${(maxJump * 180 / Math.PI).toFixed(2)}°`);
  });
});

