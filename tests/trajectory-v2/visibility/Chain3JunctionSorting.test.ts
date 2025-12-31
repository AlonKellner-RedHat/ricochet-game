/**
 * Test for Chain3 60-degree V-shape Junction Sorting Bug
 *
 * This test reproduces the issue where the junction point at (850, 250)
 * is sorted incorrectly, causing invalid polygon edges.
 *
 * Player at (595.2037203000001, 666)
 * Expected: polygon should trace around the V-shape correctly
 * Bug: Edges skip vertices, creating self-intersecting polygon
 */

import { describe, expect, it } from "vitest";
import {
  createFullCone,
  projectConeV2,
  toVector2Array,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import { createRicochetChain } from "@/trajectory-v2/geometry/SurfaceChain";

// Screen bounds for the test
const SCREEN = { minX: 0, maxX: 1280, minY: 0, maxY: 720 };

describe("Chain3 Junction Sorting Bug", () => {
  // The exact V-shape from the demo (60-degree angle)
  const chain3 = createRicochetChain("chain3", [
    { x: 820, y: 301.9615242270663 },  // left outer
    { x: 850, y: 250 },                 // apex (junction)
    { x: 880, y: 301.9615242270663 },   // right outer
  ]);

  // Player position from bug report
  const playerPos = { x: 595.2037203000001, y: 666 };

  it("should correctly sort junction point (850, 250) in CCW order", () => {
    const cone = createFullCone(playerPos);

    const result = projectConeV2(cone, [chain3], SCREEN);
    const polygon = toVector2Array(result);

    // Log for debugging
    console.log("Polygon vertices:");
    polygon.forEach((v, i) => {
      console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
    });

    // Find the apex position
    const apexIndex = polygon.findIndex(
      (v) => Math.abs(v.x - 850) < 1 && Math.abs(v.y - 250) < 1
    );
    expect(apexIndex).toBeGreaterThanOrEqual(0);

    // Find left outer endpoint (820, 302)
    const leftOuterIndex = polygon.findIndex(
      (v) => Math.abs(v.x - 820) < 1 && Math.abs(v.y - 302) < 1
    );
    expect(leftOuterIndex).toBeGreaterThanOrEqual(0);

    // Find right outer endpoint (880, 302)
    const rightOuterIndex = polygon.findIndex(
      (v) => Math.abs(v.x - 880) < 1 && Math.abs(v.y - 302) < 1
    );
    expect(rightOuterIndex).toBeGreaterThanOrEqual(0);

    // In CCW order from player (at bottom), traversing the V:
    // The apex (850, 250) should come BETWEEN the outer endpoints
    // Either: left outer -> apex -> right outer (if ceiling is between)
    // Or they should be adjacent
    //
    // The key invariant: apex should NOT appear far from the outer endpoints
    const apexToLeft = Math.abs(apexIndex - leftOuterIndex);
    const apexToRight = Math.abs(rightOuterIndex - apexIndex);
    const n = polygon.length;

    // Account for wraparound
    const distToLeft = Math.min(apexToLeft, n - apexToLeft);
    const distToRight = Math.min(apexToRight, n - apexToRight);

    console.log(`Apex at index ${apexIndex}, left outer at ${leftOuterIndex}, right outer at ${rightOuterIndex}`);
    console.log(`Distance apex to left: ${distToLeft}, apex to right: ${distToRight}`);

    // The apex should be within 3 positions of at least one outer endpoint
    // (allowing for continuation hits in between)
    expect(distToLeft <= 3 || distToRight <= 3).toBe(true);
  });

  it("should produce valid polygon edges (no self-intersection)", () => {
    const cone = createFullCone(playerPos);

    const result = projectConeV2(cone, [chain3], SCREEN);
    const polygon = toVector2Array(result);

    // Check for self-intersection using simple line segment intersection
    function segmentsIntersect(
      p1: { x: number; y: number },
      p2: { x: number; y: number },
      p3: { x: number; y: number },
      p4: { x: number; y: number }
    ): boolean {
      const d1 = direction(p3, p4, p1);
      const d2 = direction(p3, p4, p2);
      const d3 = direction(p1, p2, p3);
      const d4 = direction(p1, p2, p4);

      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
          ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
        return true;
      }

      return false;
    }

    function direction(p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }): number {
      return (p3.x - p1.x) * (p2.y - p1.y) - (p2.x - p1.x) * (p3.y - p1.y);
    }

    // Check all non-adjacent edge pairs for intersection
    const n = polygon.length;
    const intersections: string[] = [];

    for (let i = 0; i < n; i++) {
      for (let j = i + 2; j < n; j++) {
        // Skip adjacent edges (they share a vertex)
        if (i === 0 && j === n - 1) continue;

        const p1 = polygon[i]!;
        const p2 = polygon[(i + 1) % n]!;
        const p3 = polygon[j]!;
        const p4 = polygon[(j + 1) % n]!;

        if (segmentsIntersect(p1, p2, p3, p4)) {
          intersections.push(
            `Edge ${i}→${(i + 1) % n} intersects edge ${j}→${(j + 1) % n}`
          );
        }
      }
    }

    if (intersections.length > 0) {
      console.error("Self-intersections found:", intersections);
    }
    expect(intersections).toHaveLength(0);
  });

  it("should have all polygon edges follow rays or surfaces", () => {
    const cone = createFullCone(playerPos);

    const result = projectConeV2(cone, [chain3], SCREEN);
    const polygon = toVector2Array(result);

    const n = polygon.length;
    const invalidEdges: string[] = [];

    for (let i = 0; i < n; i++) {
      const p1 = polygon[i]!;
      const p2 = polygon[(i + 1) % n]!;

      // Check if this edge is:
      // 1. Along a screen boundary (horizontal or vertical at screen edges)
      // 2. Along a surface segment (the V-shape)
      // 3. Along a ray from origin (approximately collinear with origin)

      const isScreenBoundary =
        (Math.abs(p1.x - SCREEN.minX) < 1 && Math.abs(p2.x - SCREEN.minX) < 1) ||
        (Math.abs(p1.x - SCREEN.maxX) < 1 && Math.abs(p2.x - SCREEN.maxX) < 1) ||
        (Math.abs(p1.y - SCREEN.minY) < 1 && Math.abs(p2.y - SCREEN.minY) < 1) ||
        (Math.abs(p1.y - SCREEN.maxY) < 1 && Math.abs(p2.y - SCREEN.maxY) < 1);

      // Check if along V-shape surfaces
      // chain3 surfaces: (820, 302) -> (850, 250) and (850, 250) -> (880, 302)
      const isOnVSurface = (
        // Left arm
        (Math.abs(p1.x - 820) < 2 && Math.abs(p1.y - 302) < 2 && Math.abs(p2.x - 850) < 2 && Math.abs(p2.y - 250) < 2) ||
        (Math.abs(p2.x - 820) < 2 && Math.abs(p2.y - 302) < 2 && Math.abs(p1.x - 850) < 2 && Math.abs(p1.y - 250) < 2) ||
        // Right arm
        (Math.abs(p1.x - 850) < 2 && Math.abs(p1.y - 250) < 2 && Math.abs(p2.x - 880) < 2 && Math.abs(p2.y - 302) < 2) ||
        (Math.abs(p2.x - 850) < 2 && Math.abs(p2.y - 250) < 2 && Math.abs(p1.x - 880) < 2 && Math.abs(p1.y - 302) < 2)
      );

      // Check if along ray from origin
      // The edge vector should be (approximately) collinear with the direction from origin
      const v1 = { x: p1.x - playerPos.x, y: p1.y - playerPos.y };
      const v2 = { x: p2.x - playerPos.x, y: p2.y - playerPos.y };
      const cross = v1.x * v2.y - v1.y * v2.x;
      const maxLen = Math.max(Math.hypot(v1.x, v1.y), Math.hypot(v2.x, v2.y));
      const isAlongRay = Math.abs(cross) < maxLen * 0.01; // 1% tolerance

      if (!isScreenBoundary && !isOnVSurface && !isAlongRay) {
        invalidEdges.push(
          `Edge ${i}→${(i + 1) % n}: (${p1.x.toFixed(2)}, ${p1.y.toFixed(2)}) → (${p2.x.toFixed(2)}, ${p2.y.toFixed(2)})`
        );
      }
    }

    if (invalidEdges.length > 0) {
      console.error("Invalid edges found:", invalidEdges);
    }
    expect(invalidEdges).toHaveLength(0);
  });
});

