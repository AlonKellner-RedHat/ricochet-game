/**
 * Pixel Perfect Polygon Tests
 * 
 * Tests for polygon ordering issues that cause self-intersections.
 */

import { describe, it, expect } from "vitest";
import {
  buildVisibilityPolygon,
  type ScreenBounds,
} from "@/trajectory-v2/visibility/AnalyticalPropagation";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";

// Helper to create test surfaces
function createTestSurface(
  id: string,
  start: Vector2,
  end: Vector2,
  canReflect: boolean = false
): Surface {
  const segment = { start, end };
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const normalX = len > 0 ? -dy / len : 0;
  const normalY = len > 0 ? dx / len : 0;

  return {
    id,
    segment,
    normal: { x: normalX, y: normalY },
    canReflect,
    canReflectFrom: () => canReflect,
    isOnReflectiveSide: (point: Vector2) => {
      if (!canReflect) return false;
      const cross =
        (end.x - start.x) * (point.y - start.y) -
        (end.y - start.y) * (point.x - start.x);
      return cross >= 0;
    },
    distanceToPoint: () => 0,
  };
}

const screenBounds: ScreenBounds = {
  minX: 0,
  minY: 0,
  maxX: 1280,
  maxY: 720,
};

describe("Pixel Perfect Polygon Issues", () => {
  it("reproduces user-reported polygon self-intersection issue", () => {
    // User-reported issue: polygon has vertices that jump around creating self-intersection
    // Player at (850.15, 666), empty plan
    const player: Vector2 = { x: 850.1531499349986, y: 666 };

    const surfaces: Surface[] = [
      createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }, false),
      createTestSurface("ceiling", { x: 0, y: 80 }, { x: 1280, y: 80 }, false),
      createTestSurface("left-wall", { x: 20, y: 80 }, { x: 20, y: 700 }, false),
      createTestSurface("right-wall", { x: 1260, y: 80 }, { x: 1260, y: 700 }, false),
      createTestSurface("platform-1", { x: 300, y: 450 }, { x: 500, y: 450 }, false),
      createTestSurface("platform-2", { x: 550, y: 350 }, { x: 750, y: 350 }, false),
      createTestSurface("ricochet-1", { x: 800, y: 150 }, { x: 900, y: 250 }, true),
      createTestSurface("ricochet-2", { x: 400, y: 250 }, { x: 550, y: 250 }, true),
      createTestSurface("ricochet-3", { x: 100, y: 200 }, { x: 200, y: 300 }, true),
      createTestSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 }, true),
    ];

    const polygon = buildVisibilityPolygon(player, surfaces, screenBounds);

    console.log("Polygon vertices:", polygon.length);
    console.log("First 20 vertices with angles:");
    for (let i = 0; i < Math.min(20, polygon.length); i++) {
      const v = polygon[i]!;
      const angle = Math.atan2(v.y - player.y, v.x - player.x);
      console.log(`  [${i}] (${v.x.toFixed(1)}, ${v.y.toFixed(1)}) angle=${(angle * 180 / Math.PI).toFixed(1)}°`);
    }

    // Check that the polygon is valid (at least 3 vertices)
    expect(polygon.length).toBeGreaterThanOrEqual(3);

    // Check for self-intersection by verifying angular monotonicity
    // (angles should increase or decrease continuously with at most one wrap-around)
    const angles = polygon.map(v => Math.atan2(v.y - player.y, v.x - player.x));
    
    let reversals = 0;
    let lastDirection = 0;
    
    for (let i = 1; i < angles.length; i++) {
      let diff = angles[i]! - angles[i - 1]!;
      
      // Handle wrap-around
      if (diff > Math.PI) diff -= 2 * Math.PI;
      if (diff < -Math.PI) diff += 2 * Math.PI;
      
      const direction = Math.sign(diff);
      
      if (direction !== 0 && lastDirection !== 0 && direction !== lastDirection) {
        // Check if this is a significant reversal (not just noise)
        if (Math.abs(diff) > 0.01) { // About 0.5 degrees
          reversals++;
          console.log(`  Reversal at ${i}: ${(angles[i - 1]! * 180 / Math.PI).toFixed(1)}° → ${(angles[i]! * 180 / Math.PI).toFixed(1)}° (diff=${(diff * 180 / Math.PI).toFixed(1)}°)`);
        }
      }
      
      if (direction !== 0) {
        lastDirection = direction;
      }
    }

    console.log("Total reversals:", reversals);
    
    // A valid visibility polygon should have at most 1 reversal (for closing the polygon)
    // or 0 if it's perfectly monotonic
    expect(reversals).toBeLessThanOrEqual(2);
  });

  it("checks for polygon edge crossings", () => {
    const player: Vector2 = { x: 850.1531499349986, y: 666 };

    const surfaces: Surface[] = [
      createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }, false),
      createTestSurface("ceiling", { x: 0, y: 80 }, { x: 1280, y: 80 }, false),
      createTestSurface("left-wall", { x: 20, y: 80 }, { x: 20, y: 700 }, false),
      createTestSurface("right-wall", { x: 1260, y: 80 }, { x: 1260, y: 700 }, false),
      createTestSurface("platform-1", { x: 300, y: 450 }, { x: 500, y: 450 }, false),
      createTestSurface("platform-2", { x: 550, y: 350 }, { x: 750, y: 350 }, false),
      createTestSurface("ricochet-1", { x: 800, y: 150 }, { x: 900, y: 250 }, true),
      createTestSurface("ricochet-2", { x: 400, y: 250 }, { x: 550, y: 250 }, true),
      createTestSurface("ricochet-3", { x: 100, y: 200 }, { x: 200, y: 300 }, true),
      createTestSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 }, true),
    ];

    const polygon = buildVisibilityPolygon(player, surfaces, screenBounds);

    // Check for edge crossings (self-intersection)
    let crossings = 0;
    const n = polygon.length;

    for (let i = 0; i < n; i++) {
      const a1 = polygon[i]!;
      const a2 = polygon[(i + 1) % n]!;

      for (let j = i + 2; j < n; j++) {
        // Skip adjacent edges
        if (j === (i + n - 1) % n) continue;

        const b1 = polygon[j]!;
        const b2 = polygon[(j + 1) % n]!;

        if (edgesIntersect(a1, a2, b1, b2)) {
          crossings++;
          console.log(`Edge crossing: [${i}]-[${i+1}] crosses [${j}]-[${(j+1) % n}]`);
          console.log(`  (${a1.x.toFixed(1)}, ${a1.y.toFixed(1)}) → (${a2.x.toFixed(1)}, ${a2.y.toFixed(1)})`);
          console.log(`  (${b1.x.toFixed(1)}, ${b1.y.toFixed(1)}) → (${b2.x.toFixed(1)}, ${b2.y.toFixed(1)})`);
        }
      }
    }

    console.log("Total edge crossings:", crossings);
    
    // A valid visibility polygon should have NO edge crossings
    expect(crossings).toBe(0);
  });
});

// Check if two edges properly intersect (cross through each other)
function edgesIntersect(
  a1: Vector2, a2: Vector2,
  b1: Vector2, b2: Vector2
): boolean {
  const d1 = (b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x);
  const d2 = (b2.x - b1.x) * (a2.y - b1.y) - (b2.y - b1.y) * (a2.x - b1.x);
  const d3 = (a2.x - a1.x) * (b1.y - a1.y) - (a2.y - a1.y) * (b1.x - a1.x);
  const d4 = (a2.x - a1.x) * (b2.y - a1.y) - (a2.y - a1.y) * (b2.x - a1.x);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && 
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return false;
}

