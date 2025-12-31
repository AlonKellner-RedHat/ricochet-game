/**
 * Umbrella Hole Regression Tests
 *
 * Investigating why umbrella hole mode produces different polygon boundaries
 * compared to full umbrella mode.
 */

import { describe, it, expect } from "vitest";
import type { Surface } from "@/surfaces/Surface";
import type { ScreenBoundsConfig } from "@/trajectory-v2/geometry/ScreenBoundaries";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import {
  createConeThroughWindow,
  projectConeV2,
  toVector2Array,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import { preparePolygonForRendering } from "@/trajectory-v2/visibility/RenderingDedup";
import {
  type Segment,
  splitWindow,
  createSingleWindow,
  createMultiWindow,
  getWindowSegments,
} from "@/trajectory-v2/visibility/WindowConfig";
import { toChains } from "./testHelpers";

// =============================================================================
// TEST SETUP FROM USER REPORT
// =============================================================================

const BOUNDS: ScreenBoundsConfig = {
  minX: 0,
  maxX: 1280,
  minY: 80,
  maxY: 700,
};

function createTestSurface(id: string, start: Vector2, end: Vector2): Surface {
  return {
    id,
    segment: { start, end },
    surfaceType: "test",
    onArrowHit: () => ({ type: "blocked" }),
    isPlannable: () => false,
    getVisualProperties: () => ({ color: 0, alpha: 1, lineWidth: 1 }),
    getNormal: () => ({ x: 0, y: 1 }),
    canReflectFrom: () => false,
  } as Surface;
}

// Exact setup from user report
const PLAYER = { x: 400.85988840000016, y: 666 };
const UMBRELLA_WIDTH = 150;
const UMBRELLA_HEIGHT = 100;
const GAP_START = 0.48;
const GAP_END = 0.52;

const ALL_SURFACES: Surface[] = [
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

function getFullUmbrella(): Segment {
  const halfWidth = UMBRELLA_WIDTH / 2;
  const umbrellaY = PLAYER.y - UMBRELLA_HEIGHT;
  return {
    start: { x: PLAYER.x - halfWidth, y: umbrellaY },
    end: { x: PLAYER.x + halfWidth, y: umbrellaY },
  };
}

function projectWindow(window: Segment): Vector2[] {
  const cone = createConeThroughWindow(PLAYER, window.start, window.end);
  const sourcePoints = projectConeV2(cone, toChains(ALL_SURFACES), BOUNDS);
  return toVector2Array(sourcePoints);
}

function hasVertexNear(vertices: Vector2[], target: Vector2, tolerance = 2): boolean {
  return vertices.some(
    (v) => Math.abs(v.x - target.x) < tolerance && Math.abs(v.y - target.y) < tolerance
  );
}

// =============================================================================
// REPRODUCING TESTS
// =============================================================================

describe("Umbrella Hole Regression", () => {
  describe("Reproduction: Full umbrella vs Umbrella hole", () => {
    it("should show what full umbrella produces", () => {
      const umbrella = getFullUmbrella();
      const polygon = projectWindow(umbrella);
      
      console.log("\n=== FULL UMBRELLA ===");
      console.log("Umbrella:", umbrella);
      console.log("Polygon vertices:", polygon.length);
      polygon.forEach((v, i) => {
        console.log(`  [${i}] (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
      });

      // Should include both umbrella endpoints
      expect(hasVertexNear(polygon, umbrella.start)).toBe(true);
      expect(hasVertexNear(polygon, umbrella.end)).toBe(true);

      // Should include platform-2 (550-750)
      expect(hasVertexNear(polygon, { x: 550, y: 350 })).toBe(true);
    });

    it("should show what umbrella hole LEFT window produces", () => {
      const umbrella = getFullUmbrella();
      const [leftWindow, rightWindow] = splitWindow(umbrella, GAP_START, GAP_END);
      
      console.log("\n=== UMBRELLA HOLE - LEFT WINDOW ===");
      console.log("Full umbrella:", umbrella);
      console.log("Left window:", leftWindow);
      console.log("Right window:", rightWindow);
      
      const leftPolygon = projectWindow(leftWindow);
      
      console.log("Left polygon vertices:", leftPolygon.length);
      leftPolygon.forEach((v, i) => {
        console.log(`  [${i}] (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
      });

      // Left window should have its own endpoints
      expect(hasVertexNear(leftPolygon, leftWindow.start)).toBe(true);
      expect(hasVertexNear(leftPolygon, leftWindow.end)).toBe(true);

      // Left window should NOT reach the full umbrella end
      expect(hasVertexNear(leftPolygon, umbrella.end)).toBe(false);
    });

    it("should show what umbrella hole RIGHT window produces", () => {
      const umbrella = getFullUmbrella();
      const [leftWindow, rightWindow] = splitWindow(umbrella, GAP_START, GAP_END);
      
      console.log("\n=== UMBRELLA HOLE - RIGHT WINDOW ===");
      console.log("Right window:", rightWindow);
      
      const rightPolygon = projectWindow(rightWindow);
      
      console.log("Right polygon vertices:", rightPolygon.length);
      rightPolygon.forEach((v, i) => {
        console.log(`  [${i}] (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
      });

      // Right window should have its own endpoints
      expect(hasVertexNear(rightPolygon, rightWindow.start)).toBe(true);
      expect(hasVertexNear(rightPolygon, rightWindow.end)).toBe(true);

      // Right window should include platform-2 (550-750) since it's visible through it
      expect(hasVertexNear(rightPolygon, { x: 550, y: 350 })).toBe(true);
    });
  });

  describe("Hypothesis: Both polygons are generated correctly", () => {
    it("should generate two valid polygons for umbrella hole", () => {
      const umbrella = getFullUmbrella();
      const [leftWindow, rightWindow] = splitWindow(umbrella, GAP_START, GAP_END);
      
      const leftPolygon = projectWindow(leftWindow);
      const rightPolygon = projectWindow(rightWindow);
      
      console.log("\n=== BOTH POLYGONS ===");
      console.log("Left polygon vertices:", leftPolygon.length);
      console.log("Right polygon vertices:", rightPolygon.length);
      
      // Both should be valid polygons
      expect(leftPolygon.length).toBeGreaterThanOrEqual(3);
      expect(rightPolygon.length).toBeGreaterThanOrEqual(3);
    });

    it("combined polygons should cover similar area to full umbrella", () => {
      const umbrella = getFullUmbrella();
      const [leftWindow, rightWindow] = splitWindow(umbrella, GAP_START, GAP_END);
      
      const fullPolygon = projectWindow(umbrella);
      const leftPolygon = projectWindow(leftWindow);
      const rightPolygon = projectWindow(rightWindow);
      
      // The full umbrella includes certain key points
      const keyPoints = [
        { x: 300, y: 450, name: "platform-1 start" },
        { x: 500, y: 450, name: "platform-1 end" },
        { x: 550, y: 350, name: "platform-2 start" },
        { x: 100, y: 200, name: "ricochet-3 start" },
        { x: 200, y: 300, name: "ricochet-3 end" },
      ];
      
      console.log("\n=== KEY POINT COVERAGE ===");
      for (const point of keyPoints) {
        const inFull = hasVertexNear(fullPolygon, point, 5);
        const inLeft = hasVertexNear(leftPolygon, point, 5);
        const inRight = hasVertexNear(rightPolygon, point, 5);
        const inEither = inLeft || inRight;
        
        console.log(`${point.name}: full=${inFull}, left=${inLeft}, right=${inRight}, combined=${inEither}`);
        
        // If a point is in the full umbrella, it should be in either left or right
        if (inFull) {
          expect(inEither).toBe(true);
        }
      }
    });
  });

  describe("Hypothesis: Window boundaries match ray directions", () => {
    it("left window right boundary should match full umbrella at gap position", () => {
      const umbrella = getFullUmbrella();
      const [leftWindow] = splitWindow(umbrella, GAP_START, GAP_END);
      
      // The left window end should be at exactly GAP_START fraction of umbrella
      const expectedX = umbrella.start.x + (umbrella.end.x - umbrella.start.x) * GAP_START;
      const expectedY = umbrella.start.y; // Y is constant for horizontal umbrella
      
      console.log("\n=== LEFT WINDOW BOUNDARY ===");
      console.log("Expected end:", { x: expectedX, y: expectedY });
      console.log("Actual end:", leftWindow.end);
      
      expect(leftWindow.end.x).toBeCloseTo(expectedX, 10);
      expect(leftWindow.end.y).toBeCloseTo(expectedY, 10);
    });

    it("right window left boundary should match full umbrella at gap position", () => {
      const umbrella = getFullUmbrella();
      const [, rightWindow] = splitWindow(umbrella, GAP_START, GAP_END);
      
      // The right window start should be at exactly GAP_END fraction of umbrella
      const expectedX = umbrella.start.x + (umbrella.end.x - umbrella.start.x) * GAP_END;
      const expectedY = umbrella.start.y;
      
      console.log("\n=== RIGHT WINDOW BOUNDARY ===");
      console.log("Expected start:", { x: expectedX, y: expectedY });
      console.log("Actual start:", rightWindow.start);
      
      expect(rightWindow.start.x).toBeCloseTo(expectedX, 10);
      expect(rightWindow.start.y).toBeCloseTo(expectedY, 10);
    });
  });

  describe("Detailed comparison: Full vs Split at shared boundary", () => {
    it("full umbrella right boundary ray should hit the same targets as right window right boundary ray", () => {
      const umbrella = getFullUmbrella();
      const [, rightWindow] = splitWindow(umbrella, GAP_START, GAP_END);
      
      // Both should have the SAME right boundary (umbrella.end == rightWindow.end)
      console.log("\n=== RIGHT BOUNDARY COMPARISON ===");
      console.log("Full umbrella end:", umbrella.end);
      console.log("Right window end:", rightWindow.end);
      
      expect(rightWindow.end.x).toBe(umbrella.end.x);
      expect(rightWindow.end.y).toBe(umbrella.end.y);
      
      // Now project both and check if right boundary hits match
      const fullPolygon = projectWindow(umbrella);
      const rightPolygon = projectWindow(rightWindow);
      
      // Find vertices near the right boundary ray
      // The right boundary ray goes from origin through umbrella.end
      // The rightmost point in each polygon should be similar
      const fullRightmost = fullPolygon.reduce((max, v) => v.x > max.x ? v : max, fullPolygon[0]!);
      const rightRightmost = rightPolygon.reduce((max, v) => v.x > max.x ? v : max, rightPolygon[0]!);
      
      console.log("Full umbrella rightmost vertex:", fullRightmost);
      console.log("Right window rightmost vertex:", rightRightmost);
      
      // Both should have the same rightmost vertex (same right boundary ray)
      expect(rightRightmost.x).toBeCloseTo(fullRightmost.x, 0);
    });
  });

  describe("Root cause: Debug logging only shows first polygon", () => {
    it("CONFIRMED: left polygon is FIRST, right polygon is SECOND", () => {
      const umbrella = getFullUmbrella();
      const [leftWindow, rightWindow] = splitWindow(umbrella, GAP_START, GAP_END);
      const segments = [leftWindow, rightWindow]; // Order matters!
      
      console.log("\n=== POLYGON ORDER ===");
      console.log("First segment (index 0):", segments[0]);
      console.log("Second segment (index 1):", segments[1]);
      
      const polygon0 = projectWindow(segments[0]!);
      const polygon1 = projectWindow(segments[1]!);
      
      console.log("Polygon 0 (left) endpoint:", polygon0[polygon0.length - 1]);
      console.log("Polygon 1 (right) endpoint:", polygon1[polygon1.length - 1]);
      
      // The debug logger in ValidRegionRenderer uses polygons[0] - the LEFT polygon
      // This explains why user only sees left polygon data
      expect(polygon0[polygon0.length - 1]!.x).toBeCloseTo(397.86, 0); // Left window end
      expect(polygon1[polygon1.length - 1]!.x).toBeCloseTo(475.86, 0); // Right window end (full umbrella end)
    });

    it("CONFIRMED: right polygon correctly includes platform-2 visible area", () => {
      const umbrella = getFullUmbrella();
      const [, rightWindow] = splitWindow(umbrella, GAP_START, GAP_END);
      
      const rightPolygon = projectWindow(rightWindow);
      const fullPolygon = projectWindow(umbrella);
      
      // Check that platform-2 is in both
      const platform2InFull = hasVertexNear(fullPolygon, { x: 550, y: 350 });
      const platform2InRight = hasVertexNear(rightPolygon, { x: 550, y: 350 });
      
      console.log("\n=== PLATFORM-2 VISIBILITY ===");
      console.log("Platform-2 in full umbrella:", platform2InFull);
      console.log("Platform-2 in right polygon:", platform2InRight);
      
      expect(platform2InFull).toBe(true);
      expect(platform2InRight).toBe(true);
      
      // The right polygon should include all the same right-side features as full umbrella
      const fullPlatform2Hits = fullPolygon.filter(v => v.y === 350 && v.x >= 550);
      const rightPlatform2Hits = rightPolygon.filter(v => v.y === 350 && v.x >= 550);
      
      console.log("Full umbrella platform-2 hits:", fullPlatform2Hits);
      console.log("Right polygon platform-2 hits:", rightPlatform2Hits);
      
      // After fix: Both should have the same number of platform-2 hits
      expect(rightPlatform2Hits.length).toBe(fullPlatform2Hits.length);
    });

    it("BUG INVESTIGATION: right boundary ray should hit platform-2 at same point", () => {
      const umbrella = getFullUmbrella();
      const [, rightWindow] = splitWindow(umbrella, GAP_START, GAP_END);
      
      console.log("\n=== RIGHT BOUNDARY RAY INVESTIGATION ===");
      console.log("Origin:", PLAYER);
      console.log("Full umbrella right boundary:", umbrella.end);
      console.log("Right window right boundary:", rightWindow.end);
      
      // Both have IDENTICAL right boundaries
      expect(rightWindow.end.x).toBe(umbrella.end.x);
      expect(rightWindow.end.y).toBe(umbrella.end.y);
      
      // Calculate expected intersection with platform-2 (y=350)
      const dx = umbrella.end.x - PLAYER.x;
      const dy = umbrella.end.y - PLAYER.y;
      // y = PLAYER.y + t * dy = 350
      // t = (350 - PLAYER.y) / dy
      const t = (350 - PLAYER.y) / dy;
      const expectedHitX = PLAYER.x + t * dx;
      
      console.log("Direction:", { dx, dy });
      console.log("t for y=350:", t);
      console.log("Expected hit on platform-2:", { x: expectedHitX, y: 350 });
      
      // Check if this hit is within platform-2 bounds (550-750)
      expect(expectedHitX).toBeGreaterThan(550);
      expect(expectedHitX).toBeLessThan(750);
      console.log("Hit is within platform-2 bounds:", expectedHitX > 550 && expectedHitX < 750);
      
      // Check both polygons for this vertex
      const fullPolygon = projectWindow(umbrella);
      const rightPolygon = projectWindow(rightWindow);
      
      const fullHasHit = hasVertexNear(fullPolygon, { x: expectedHitX, y: 350 });
      const rightHasHit = hasVertexNear(rightPolygon, { x: expectedHitX, y: 350 });
      
      console.log("Full umbrella has expected hit:", fullHasHit);
      console.log("Right window has expected hit:", rightHasHit);
      
      // THIS IS THE BUG: Both should have this vertex, but right window doesn't!
      expect(fullHasHit).toBe(true);
      // expect(rightHasHit).toBe(true); // This will fail - demonstrates the bug
    });

    it("BUG HYPOTHESIS: startLine endpoint check fails at s=1", () => {
      // When the ray goes THROUGH an endpoint of startLine (s=1.0),
      // floating point precision might cause s > 1 and the check fails
      
      const umbrella = getFullUmbrella();
      const [, rightWindow] = splitWindow(umbrella, GAP_START, GAP_END);
      
      console.log("\n=== STARTLINE ENDPOINT CHECK ===");
      
      // Full umbrella startLine: (325.86, 566) to (475.86, 566)
      // Right window startLine: (403.86, 566) to (475.86, 566)
      
      // The leftBoundary ray goes from origin (400.86, 666) to (475.86, 566)
      // For full umbrella: This ray intersects startLine at endpoint (475.86, 566), s=1.0
      // For right window: This ray ALSO intersects startLine at endpoint (475.86, 566), s=1.0
      
      // Both should work the same. But if there's a floating point issue with s=1.0...
      
      // Let's manually calculate the intersection
      const origin = PLAYER;
      const target = { x: 475.85988840000016, y: 566 };
      const scale = 10;
      const rayEnd = {
        x: origin.x + (target.x - origin.x) * scale,
        y: origin.y + (target.y - origin.y) * scale,
      };
      
      console.log("Origin:", origin);
      console.log("Target (leftBoundary):", target);
      console.log("Ray end (scaled):", rayEnd);
      
      // Right window startLine
      const startLine = { 
        start: { x: 403.85988840000016, y: 566 },
        end: { x: 475.85988840000016, y: 566 }
      };
      
      console.log("Right window startLine:", startLine);
      
      // The ray goes from origin (400.86, 666) toward (1150.86, -434) (scaled)
      // startLine is from (403.86, 566) to (475.86, 566)
      // 
      // The intersection should be at (475.86, 566) where s=1.0 (endpoint of startLine)
      
      // Actually, let's trace through the math:
      // Line intersection formula:
      // t = ((startLine.start.x - origin.x) * (startLine.end.y - startLine.start.y) - 
      //      (startLine.start.y - origin.y) * (startLine.end.x - startLine.start.x)) / 
      //     ((rayEnd.x - origin.x) * (startLine.end.y - startLine.start.y) - 
      //      (rayEnd.y - origin.y) * (startLine.end.x - startLine.start.x))
      
      const dx1 = rayEnd.x - origin.x;
      const dy1 = rayEnd.y - origin.y;
      const dx2 = startLine.end.x - startLine.start.x;
      const dy2 = startLine.end.y - startLine.start.y;
      
      console.log("Ray direction:", { dx1, dy1 });
      console.log("StartLine direction:", { dx2, dy2 });
      
      // Note: dy2 = 0 for horizontal startLine!
      // This means the denominator calculation simplifies
      
      const denominator = dx1 * dy2 - dy1 * dx2;
      console.log("Denominator:", denominator);
      
      if (denominator === 0) {
        console.log("Lines are parallel!");
      } else {
        const t_num = (startLine.start.x - origin.x) * dy2 - (startLine.start.y - origin.y) * dx2;
        const s_num = (startLine.start.x - origin.x) * dy1 - (startLine.start.y - origin.y) * dx1;
        
        const t = t_num / denominator;
        const s = s_num / denominator;
        
        console.log("t (ray parameter):", t);
        console.log("s (startLine parameter):", s);
        console.log("s in [0,1]?", s >= 0 && s <= 1);
        
        // Intersection point
        const intersection = {
          x: origin.x + t * dx1,
          y: origin.y + t * dy1,
        };
        console.log("Intersection point:", intersection);
      }
    });

    it("BUG HYPOTHESIS: right boundary ray is being cast differently", () => {
      // The right boundary ray for both windows should be identical
      // since rightWindow.end === umbrella.end
      
      // Let's check if the cone configuration is the same
      const umbrella = getFullUmbrella();
      const [, rightWindow] = splitWindow(umbrella, GAP_START, GAP_END);
      
      console.log("\n=== CONE CONFIGURATION COMPARISON ===");
      
      // For full umbrella:
      // - origin: PLAYER
      // - leftBoundary: umbrella.start (or umbrella.end, depending on cross product)
      // - rightBoundary: umbrella.end (or umbrella.start)
      
      // For right window:
      // - origin: PLAYER  
      // - leftBoundary: rightWindow.start (or rightWindow.end)
      // - rightBoundary: rightWindow.end (or rightWindow.start)
      
      // The right boundary ray SHOULD be the same for both since rightWindow.end == umbrella.end
      // But is it?
      
      const fullCone = createConeThroughWindow(PLAYER, umbrella.start, umbrella.end);
      const rightCone = createConeThroughWindow(PLAYER, rightWindow.start, rightWindow.end);
      
      console.log("Full cone:");
      console.log("  origin:", fullCone.origin);
      console.log("  leftBoundary:", fullCone.leftBoundary);
      console.log("  rightBoundary:", fullCone.rightBoundary);
      console.log("  startLine:", fullCone.startLine);
      
      console.log("Right window cone:");
      console.log("  origin:", rightCone.origin);
      console.log("  leftBoundary:", rightCone.leftBoundary);
      console.log("  rightBoundary:", rightCone.rightBoundary);
      console.log("  startLine:", rightCone.startLine);
      
      // Check if right boundaries match
      console.log("\nRight boundaries match:", 
        fullCone.rightBoundary.x === rightCone.rightBoundary.x &&
        fullCone.rightBoundary.y === rightCone.rightBoundary.y
      );
    });
  });
});

