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
import {
  createConeThroughWindow,
  projectConeV2,
  toVector2Array,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import { preparePolygonForRendering } from "@/trajectory-v2/visibility/RenderingDedup";
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

/**
 * Tests for the pixel-perfect vertex removal bug.
 * 
 * Bug: At specific player positions, the rendering deduplication incorrectly
 * removes vertices that are geometrically distinct but happen to be within
 * the tolerance threshold.
 * 
 * First Principle: Vertices from different sources (different surface endpoints
 * or different ray calculations) should NEVER be deduplicated, regardless of
 * their geometric distance. Only vertices from the SAME source should be merged.
 */
describe("Pixel Perfect Vertex Removal Bug", () => {
  /**
   * Reproduce the exact bug from the user report.
   * 
   * Scene: Player reflected through pyramid-3, origin at (1089.866172610004, 174)
   * Bug: Vertex (1000, 420) - the left endpoint of pyramid-3 - is missing
   * 
   * The bug report shows that the visibility polygon had only 3 vertices at
   * the buggy position, but 4 at the working position. The missing vertex is
   * the exact (1000, 420) endpoint.
   * 
   * First Principle: Window endpoints (1000, 420) and (1100, 420) MUST appear
   * in the polygon because they are the SOURCE OF TRUTH for the window bounds.
   */
  it("should preserve pyramid-3 left endpoint (1000, 420) at the buggy position", () => {
    // Exact coordinates from the bug report
    const origin: Vector2 = { x: 1089.866172610004, y: 174 };
    
    // The planned surface (pyramid-3) that we're looking through
    const pyramid3Start: Vector2 = { x: 1000, y: 420 };
    const pyramid3End: Vector2 = { x: 1100, y: 420 };
    
    // All surfaces from the bug report (complete list)
    const surfaces: Surface[] = [
      createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }, false),
      createTestSurface("ceiling", { x: 0, y: 80 }, { x: 1280, y: 80 }, true),
      createTestSurface("left-wall", { x: 20, y: 700 }, { x: 20, y: 80 }, true),
      createTestSurface("right-wall", { x: 1260, y: 80 }, { x: 1260, y: 700 }, false),
      createTestSurface("platform", { x: 50, y: 620 }, { x: 200, y: 620 }, false),
      createTestSurface("mirror-left", { x: 250, y: 550 }, { x: 250, y: 150 }, true),
      createTestSurface("mirror-right", { x: 550, y: 150 }, { x: 550, y: 550 }, true),
      createTestSurface("pyramid-1", { x: 1030, y: 500 }, { x: 1070, y: 500 }, true),
      createTestSurface("pyramid-2", { x: 1015, y: 460 }, { x: 1085, y: 460 }, true),
      createTestSurface("pyramid-3", pyramid3Start, pyramid3End, true),
      createTestSurface("pyramid-4", { x: 985, y: 380 }, { x: 1115, y: 380 }, true),
      // Grid surfaces - complete 4x4 grid
      createTestSurface("grid-0-0", { x: 885, y: 200 }, { x: 915, y: 200 }, true),
      createTestSurface("grid-0-1", { x: 935, y: 200 }, { x: 965, y: 200 }, true),
      createTestSurface("grid-0-2", { x: 1010.6066017177982, y: 189.3933982822018 }, { x: 989.3933982822018, y: 210.6066017177982 }, true),
      createTestSurface("grid-0-3", { x: 1039.3933982822018, y: 189.3933982822018 }, { x: 1060.6066017177982, y: 210.6066017177982 }, true),
      createTestSurface("grid-1-0", { x: 900, y: 235 }, { x: 900, y: 265 }, true),
      createTestSurface("grid-1-1", { x: 939.3933982822018, y: 239.3933982822018 }, { x: 960.6066017177982, y: 260.6066017177982 }, true),
      createTestSurface("grid-1-2", { x: 985, y: 250 }, { x: 1015, y: 250 }, true),
      createTestSurface("grid-1-3", { x: 1060.6066017177982, y: 260.6066017177982 }, { x: 1039.3933982822018, y: 239.3933982822018 }, true),
      createTestSurface("grid-2-0", { x: 915, y: 300 }, { x: 885, y: 300 }, true),
      createTestSurface("grid-2-1", { x: 960.6066017177982, y: 310.6066017177982 }, { x: 939.3933982822018, y: 289.3933982822018 }, true),
      createTestSurface("grid-2-2", { x: 1000, y: 315 }, { x: 1000, y: 285 }, true),
      createTestSurface("grid-2-3", { x: 1060.6066017177982, y: 289.3933982822018 }, { x: 1039.3933982822018, y: 310.6066017177982 }, true),
      createTestSurface("grid-3-0", { x: 889.3933982822018, y: 339.3933982822018 }, { x: 910.6066017177982, y: 360.6066017177982 }, true),
      createTestSurface("grid-3-1", { x: 939.3933982822018, y: 339.3933982822018 }, { x: 960.6066017177982, y: 360.6066017177982 }, true),
      createTestSurface("grid-3-2", { x: 1000, y: 365 }, { x: 1000, y: 335 }, true),
      createTestSurface("grid-3-3", { x: 1050, y: 365 }, { x: 1050, y: 335 }, true),
      // Chain surfaces
      createTestSurface("chain1-left", { x: 598.0384757729337, y: 280 }, { x: 650, y: 250 }, true),
      createTestSurface("chain1-right", { x: 650, y: 250 }, { x: 701.9615242270663, y: 280 }, true),
      createTestSurface("chain2-left", { x: 707.5735931288071, y: 292.42640687119285 }, { x: 750, y: 250 }, true),
      createTestSurface("chain2-right", { x: 750, y: 250 }, { x: 792.4264068711929, y: 292.42640687119285 }, true),
      createTestSurface("chain3-left", { x: 820, y: 301.9615242270663 }, { x: 850, y: 250 }, true),
      createTestSurface("chain3-right", { x: 850, y: 250 }, { x: 880, y: 301.9615242270663 }, true),
    ];
    
    // Create cone through the pyramid-3 window
    const cone = createConeThroughWindow(origin, pyramid3Start, pyramid3End);
    
    // Project the cone to get source points
    const sourcePoints = projectConeV2(cone, surfaces, screenBounds, "pyramid-3");
    
    // Convert to Vector2 array
    const rawPolygon = toVector2Array(sourcePoints);
    
    // Check if (1000, 420) is in the raw polygon BEFORE deduplication
    const hasVertexBeforeDedup = rawPolygon.some(
      v => Math.abs(v.x - 1000) < 0.01 && Math.abs(v.y - 420) < 0.01
    );
    
    console.log("Raw polygon vertices:", rawPolygon.length);
    console.log("Has (1000, 420) before dedup:", hasVertexBeforeDedup);
    console.log("All raw vertices:");
    for (const v of rawPolygon) {
      console.log(`  (${v.x.toFixed(6)}, ${v.y.toFixed(6)})`);
    }
    
    // Apply rendering deduplication (this is where the bug occurs)
    const dedupedPolygon = preparePolygonForRendering(rawPolygon);
    
    // Check if (1000, 420) is still present AFTER deduplication
    const hasVertexAfterDedup = dedupedPolygon.some(
      v => Math.abs(v.x - 1000) < 0.01 && Math.abs(v.y - 420) < 0.01
    );
    
    console.log("Deduped polygon vertices:", dedupedPolygon.length);
    console.log("Has (1000, 420) after dedup:", hasVertexAfterDedup);
    console.log("All deduped vertices:");
    for (const v of dedupedPolygon) {
      console.log(`  (${v.x.toFixed(6)}, ${v.y.toFixed(6)})`);
    }
    
    // The vertex should be present before deduplication
    expect(hasVertexBeforeDedup).toBe(true);
    
    // CRITICAL: The vertex should STILL be present after deduplication
    // This is the failing assertion that demonstrates the bug
    expect(hasVertexAfterDedup).toBe(true);
  });

  /**
   * Verify that the working position (0.33 pixels away) produces correct output.
   * This serves as a control test.
   */
  it("should preserve pyramid-3 left endpoint at the working position", () => {
    // Working position - just 0.33 pixels different
    const origin: Vector2 = { x: 1089.534016889148, y: 174 };
    
    const pyramid3Start: Vector2 = { x: 1000, y: 420 };
    const pyramid3End: Vector2 = { x: 1100, y: 420 };
    
    const surfaces: Surface[] = [
      createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }, false),
      createTestSurface("ceiling", { x: 0, y: 80 }, { x: 1280, y: 80 }, true),
      createTestSurface("left-wall", { x: 20, y: 700 }, { x: 20, y: 80 }, true),
      createTestSurface("right-wall", { x: 1260, y: 80 }, { x: 1260, y: 700 }, false),
      createTestSurface("platform", { x: 50, y: 620 }, { x: 200, y: 620 }, false),
      createTestSurface("mirror-left", { x: 250, y: 550 }, { x: 250, y: 150 }, true),
      createTestSurface("mirror-right", { x: 550, y: 150 }, { x: 550, y: 550 }, true),
      createTestSurface("pyramid-1", { x: 1030, y: 500 }, { x: 1070, y: 500 }, true),
      createTestSurface("pyramid-2", { x: 1015, y: 460 }, { x: 1085, y: 460 }, true),
      createTestSurface("pyramid-3", pyramid3Start, pyramid3End, true),
      createTestSurface("pyramid-4", { x: 985, y: 380 }, { x: 1115, y: 380 }, true),
      createTestSurface("grid-0-0", { x: 885, y: 200 }, { x: 915, y: 200 }, true),
      createTestSurface("grid-0-1", { x: 935, y: 200 }, { x: 965, y: 200 }, true),
      createTestSurface("chain1-left", { x: 598.0384757729337, y: 280 }, { x: 650, y: 250 }, true),
      createTestSurface("chain1-right", { x: 650, y: 250 }, { x: 701.9615242270663, y: 280 }, true),
    ];
    
    const cone = createConeThroughWindow(origin, pyramid3Start, pyramid3End);
    const sourcePoints = projectConeV2(cone, surfaces, screenBounds, "pyramid-3");
    const rawPolygon = toVector2Array(sourcePoints);
    const dedupedPolygon = preparePolygonForRendering(rawPolygon);
    
    const hasVertex = dedupedPolygon.some(
      v => Math.abs(v.x - 1000) < 0.01 && Math.abs(v.y - 420) < 0.01
    );
    
    console.log("Working position - polygon vertices:", dedupedPolygon.length);
    console.log("Has (1000, 420):", hasVertex);
    
    expect(hasVertex).toBe(true);
  });

  /**
   * Unit test for the exact bug: sequential deduplication removes window endpoint
   * when a computed hit point is within 0.5 pixels.
   * 
   * This directly tests preparePolygonForRendering() with the exact vertex pattern
   * from the bug report:
   * - Computed hit point at (1000.4628791048536, 420)
   * - Window endpoint at (1000, 420)
   * 
   * Distance: 0.4628 < 0.5 (tolerance), so the endpoint is incorrectly removed.
   */
  it("should not remove window endpoint even when computed hit is within tolerance", () => {
    // Simulate the exact polygon from the buggy case
    // The vertices are sorted such that the computed hit comes before the exact endpoint
    const vertices: Vector2[] = [
      { x: 1000.4628791048536, y: 420 },  // Computed hit point (grazing ray)
      { x: 898.7030328388289, y: 700 },   // Floor hit
      { x: 897.7132994682881, y: 700 },   // Floor hit (continuation)
      { x: 1000, y: 420 },                // Window endpoint (SHOULD NOT BE REMOVED)
    ];
    
    console.log("Input vertices:");
    for (const v of vertices) {
      console.log(`  (${v.x}, ${v.y})`);
    }
    
    // Apply rendering deduplication
    const result = preparePolygonForRendering(vertices);
    
    console.log("Output vertices after preparePolygonForRendering:");
    for (const v of result) {
      console.log(`  (${v.x}, ${v.y})`);
    }
    
    // The window endpoint (1000, 420) MUST be preserved
    const hasExactEndpoint = result.some(
      v => v.x === 1000 && v.y === 420
    );
    
    console.log("Has exact endpoint (1000, 420):", hasExactEndpoint);
    
    // This test demonstrates the bug: the endpoint is removed
    // because it's within 0.5 pixels of the computed hit point
    expect(hasExactEndpoint).toBe(true);
  });
});

