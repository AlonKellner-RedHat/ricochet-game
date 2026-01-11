/**
 * Tests for obstruction-aware reflection windows.
 *
 * When there's a planned surface, the reflection window should only include
 * portions of the surface that receive light. Blocked portions should not
 * reflect light.
 */

import { describe, it, expect } from "vitest";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { SourcePoint } from "@/trajectory-v2/geometry/SourcePoint";
import { Endpoint, HitPoint, isEndpoint, isHitPoint } from "@/trajectory-v2/geometry/SourcePoint";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import { projectConeV2, createFullCone, createConeThroughWindow, toVector2Array } from "@/trajectory-v2/visibility/ConeProjectionV2";
import { segmentsToCones } from "@/trajectory-v2/visibility/HighlightMode";
import { ValidRegionRenderer } from "@/trajectory-v2/visibility/ValidRegionRenderer";
import { createSingleWindow } from "@/trajectory-v2/visibility/WindowConfig";
import type { Segment } from "@/trajectory-v2/visibility/WindowConfig";
import { toChains } from "./testHelpers";

// =============================================================================
// TEST HELPERS
// =============================================================================

function createTestSurface(
  id: string,
  start: Vector2,
  end: Vector2
): Surface {
  return {
    id,
    segment: { start, end },
    isPlannable: () => true,
    canReflectFrom: () => true,
    getCenter: () => ({
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    }),
  } as Surface;
}

/**
 * Extract visible surface segments from source points.
 * 
 * This function detects GAPS by tracking consecutive runs of points on the target surface.
 * When a point from a different surface interrupts the run, a new segment starts.
 * 
 * This is the UNIFIED source of truth for:
 * 1. Reflection windows (each segment = a window)
 * 2. Highlight cones (each segment = a cone)
 */
function extractVisibleSurfaceSegments(
  targetSurfaceId: string,
  sourcePoints: readonly SourcePoint[],
  _surfaceSegment: Segment // unused but kept for API compatibility
): Segment[] {
  const segments: Segment[] = [];
  let currentRunStart: Vector2 | null = null;
  let currentRunEnd: Vector2 | null = null;

  for (const sp of sourcePoints) {
    // Check if this point is on the target surface
    let isOnTarget = false;
    let coords: Vector2 | null = null;

    if (sp instanceof Endpoint && sp.surface.id === targetSurfaceId) {
      isOnTarget = true;
      coords = sp.computeXY();
    } else if (sp instanceof HitPoint && sp.hitSurface.id === targetSurfaceId) {
      isOnTarget = true;
      coords = sp.computeXY();
    }

    if (isOnTarget && coords) {
      // Extend current run
      if (currentRunStart === null) {
        currentRunStart = coords;
      }
      currentRunEnd = coords;
    } else {
      // Gap detected - emit current run as segment if valid
      if (currentRunStart && currentRunEnd && 
          (currentRunStart.x !== currentRunEnd.x || currentRunStart.y !== currentRunEnd.y)) {
        segments.push({ start: currentRunStart, end: currentRunEnd });
      }
      currentRunStart = null;
      currentRunEnd = null;
    }
  }

  // Emit final run
  if (currentRunStart && currentRunEnd &&
      (currentRunStart.x !== currentRunEnd.x || currentRunStart.y !== currentRunEnd.y)) {
    segments.push({ start: currentRunStart, end: currentRunEnd });
  }

  return segments;
}

/**
 * Create a mock SourcePoint array simulating visibility on a surface.
 * 
 * For testing, we create a "fake" surface with the visible portion as its segment,
 * then use Endpoint which returns the surface's segment endpoints.
 */
function createSourcePointsForSurface(
  surface: Surface,
  visibleStart: Vector2,
  visibleEnd: Vector2
): SourcePoint[] {
  // Create a "view" of the surface with the visible portion
  const visibleSurface: Surface = {
    ...surface,
    segment: { start: visibleStart, end: visibleEnd },
  };
  
  // Create endpoints which will return visibleStart and visibleEnd
  return [
    new Endpoint(visibleSurface, "start"),
    new Endpoint(visibleSurface, "end"),
  ];
}

// =============================================================================
// TESTS
// =============================================================================

describe("Obstruction-Aware Reflection Windows", () => {
  describe("extractVisibleSurfaceSegments", () => {
    it("should return full surface when no obstruction", () => {
      const surface = createTestSurface(
        "planned-1",
        { x: 100, y: 200 },
        { x: 300, y: 200 }
      );

      // Source points include both endpoints of the surface
      const sourcePoints = createSourcePointsForSurface(
        surface,
        { x: 100, y: 200 },
        { x: 300, y: 200 }
      );

      const segments = extractVisibleSurfaceSegments(
        surface.id,
        sourcePoints,
        surface.segment
      );

      expect(segments).toHaveLength(1);
      expect(segments[0]!.start.x).toBeCloseTo(100);
      expect(segments[0]!.start.y).toBeCloseTo(200);
      expect(segments[0]!.end.x).toBeCloseTo(300);
      expect(segments[0]!.end.y).toBeCloseTo(200);
    });

    it("should return partial segment when light only reaches part of surface", () => {
      const surface = createTestSurface(
        "planned-1",
        { x: 100, y: 200 },
        { x: 300, y: 200 }
      );

      // Only middle portion is visible (obstruction blocks ends)
      const sourcePoints = createSourcePointsForSurface(
        surface,
        { x: 150, y: 200 },
        { x: 250, y: 200 }
      );

      const segments = extractVisibleSurfaceSegments(
        surface.id,
        sourcePoints,
        surface.segment
      );

      expect(segments).toHaveLength(1);
      expect(segments[0]!.start.x).toBeCloseTo(150);
      expect(segments[0]!.end.x).toBeCloseTo(250);
    });

    it("should return empty array when no light reaches surface", () => {
      const surface = createTestSurface(
        "planned-1",
        { x: 100, y: 200 },
        { x: 300, y: 200 }
      );

      // No source points from this surface
      const sourcePoints: SourcePoint[] = [];

      const segments = extractVisibleSurfaceSegments(
        surface.id,
        sourcePoints,
        surface.segment
      );

      expect(segments).toHaveLength(0);
    });

    it("should handle vertical surfaces", () => {
      const surface = createTestSurface(
        "planned-1",
        { x: 500, y: 100 },
        { x: 500, y: 400 }
      );

      const sourcePoints = createSourcePointsForSurface(
        surface,
        { x: 500, y: 100 },
        { x: 500, y: 400 }
      );

      const segments = extractVisibleSurfaceSegments(
        surface.id,
        sourcePoints,
        surface.segment
      );

      expect(segments).toHaveLength(1);
      expect(segments[0]!.start.y).toBeCloseTo(100);
      expect(segments[0]!.end.y).toBeCloseTo(400);
    });

    it("should filter out points from other surfaces", () => {
      const targetSurface = createTestSurface(
        "planned-1",
        { x: 100, y: 200 },
        { x: 300, y: 200 }
      );
      const otherSurface = createTestSurface(
        "obstacle-1",
        { x: 0, y: 0 },
        { x: 50, y: 50 }
      );

      // Create a view of target surface with visible portion
      const visibleTargetSurface: Surface = {
        ...targetSurface,
        segment: { start: { x: 150, y: 200 }, end: { x: 250, y: 200 } },
      };

      // Mix of target and other surface points
      const sourcePoints: SourcePoint[] = [
        new Endpoint(otherSurface, "start"),
        new Endpoint(visibleTargetSurface, "start"),
        new Endpoint(visibleTargetSurface, "end"),
        new Endpoint(otherSurface, "end"),
      ];

      const segments = extractVisibleSurfaceSegments(
        targetSurface.id,
        sourcePoints,
        targetSurface.segment
      );

      expect(segments).toHaveLength(1);
      // Only target surface points should be considered
      expect(segments[0]!.start.x).toBeCloseTo(150);
      expect(segments[0]!.end.x).toBeCloseTo(250);
    });

    it("should detect GAP and return TWO segments when interrupted by other surface", () => {
      // This is the key test for umbrella hole mode
      // When source points have: target, target, OTHER, target, target
      // We should get 2 segments
      
      const targetSurface = createTestSurface(
        "planned-1",
        { x: 100, y: 200 },
        { x: 400, y: 200 }
      );
      const obstacleSurface = createTestSurface(
        "obstacle-1",
        { x: 200, y: 100 },
        { x: 200, y: 300 }
      );

      // Create two visible portions of target surface
      const leftPortion: Surface = {
        ...targetSurface,
        segment: { start: { x: 100, y: 200 }, end: { x: 180, y: 200 } },
      };
      const rightPortion: Surface = {
        ...targetSurface,
        segment: { start: { x: 220, y: 200 }, end: { x: 400, y: 200 } },
      };

      // Source points: left portion, obstacle, right portion
      // This simulates umbrella hole mode where two cones hit the surface with a gap
      const sourcePoints: SourcePoint[] = [
        new Endpoint(leftPortion, "start"),   // (100, 200)
        new Endpoint(leftPortion, "end"),     // (180, 200)
        new Endpoint(obstacleSurface, "start"), // GAP - different surface
        new Endpoint(obstacleSurface, "end"),   // GAP
        new Endpoint(rightPortion, "start"),  // (220, 200)
        new Endpoint(rightPortion, "end"),    // (400, 200)
      ];

      const segments = extractVisibleSurfaceSegments(
        targetSurface.id,
        sourcePoints,
        targetSurface.segment
      );

      console.log("=== Gap Detection Test ===");
      console.log("Segments found:", segments.length);
      segments.forEach((seg, i) => {
        console.log(`  [${i}] start=(${seg.start.x}, ${seg.start.y}), end=(${seg.end.x}, ${seg.end.y})`);
      });

      // Should detect the gap and produce 2 segments
      expect(segments).toHaveLength(2);
      
      // First segment: 100 to 180
      expect(segments[0]!.start.x).toBeCloseTo(100);
      expect(segments[0]!.end.x).toBeCloseTo(180);
      
      // Second segment: 220 to 400
      expect(segments[1]!.start.x).toBeCloseTo(220);
      expect(segments[1]!.end.x).toBeCloseTo(400);
    });

    it("should return THREE segments when interrupted twice", () => {
      const targetSurface = createTestSurface(
        "planned-1",
        { x: 0, y: 100 },
        { x: 500, y: 100 }
      );
      const obs1 = createTestSurface("obs-1", { x: 0, y: 0 }, { x: 0, y: 50 });
      const obs2 = createTestSurface("obs-2", { x: 0, y: 0 }, { x: 0, y: 50 });

      // Three portions with two gaps
      const portion1: Surface = { ...targetSurface, segment: { start: { x: 0, y: 100 }, end: { x: 100, y: 100 } } };
      const portion2: Surface = { ...targetSurface, segment: { start: { x: 200, y: 100 }, end: { x: 300, y: 100 } } };
      const portion3: Surface = { ...targetSurface, segment: { start: { x: 400, y: 100 }, end: { x: 500, y: 100 } } };

      const sourcePoints: SourcePoint[] = [
        new Endpoint(portion1, "start"),
        new Endpoint(portion1, "end"),
        new Endpoint(obs1, "start"),  // Gap 1
        new Endpoint(portion2, "start"),
        new Endpoint(portion2, "end"),
        new Endpoint(obs2, "start"),  // Gap 2
        new Endpoint(portion3, "start"),
        new Endpoint(portion3, "end"),
      ];

      const segments = extractVisibleSurfaceSegments(
        targetSurface.id,
        sourcePoints,
        targetSurface.segment
      );

      expect(segments).toHaveLength(3);
      expect(segments[0]!.start.x).toBeCloseTo(0);
      expect(segments[0]!.end.x).toBeCloseTo(100);
      expect(segments[1]!.start.x).toBeCloseTo(200);
      expect(segments[1]!.end.x).toBeCloseTo(300);
      expect(segments[2]!.start.x).toBeCloseTo(400);
      expect(segments[2]!.end.x).toBeCloseTo(500);
    });
  });

  describe("Reflection behavior with obstructions", () => {
    it("should use visible segments as windows for reflection", () => {
      // This test verifies the integration concept:
      // When light is blocked from part of the planned surface,
      // only the visible portions should be used as reflection windows

      const plannedSurface = createTestSurface(
        "planned-1",
        { x: 100, y: 200 },
        { x: 300, y: 200 }
      );

      // Simulate: obstruction blocks left half, only right half receives light
      const sourcePoints = createSourcePointsForSurface(
        plannedSurface,
        { x: 200, y: 200 }, // Only right half visible
        { x: 300, y: 200 }
      );

      const segments = extractVisibleSurfaceSegments(
        plannedSurface.id,
        sourcePoints,
        plannedSurface.segment
      );

      // Should produce one window segment for the visible portion
      expect(segments).toHaveLength(1);
      expect(segments[0]!.start.x).toBeCloseTo(200);
      expect(segments[0]!.end.x).toBeCloseTo(300);
    });
  });

  describe("Umbrella mode with planned surfaces", () => {
    it("REGRESSION: should not include full surface in reflected visibility", () => {
      // From user's bug report: player at (637.81, 666), ricochet-4 planned
      // The reflected polygon incorrectly includes (850, 500) - full surface end
      // Expected: only the portion that receives light should be used
      
      const plannedSurface = createTestSurface(
        "ricochet-4",
        { x: 850, y: 350 },
        { x: 850, y: 500 }
      );

      // Simulate Stage 1 visibility - only portion y=350 to y=383 receives light
      // (blocked by platform-2 at y=350)
      const stage1SourcePoints = createSourcePointsForSurface(
        plannedSurface,
        { x: 850, y: 350 },
        { x: 850, y: 383.08 }  // NOT y=500!
      );

      const segments = extractVisibleSurfaceSegments(
        plannedSurface.id,
        stage1SourcePoints,
        plannedSurface.segment
      );

      // The visible segment should be 350 to 383, NOT 350 to 500
      expect(segments).toHaveLength(1);
      expect(segments[0]!.start.y).toBeCloseTo(350);
      expect(segments[0]!.end.y).toBeCloseTo(383.08, 1);
      // Critically: y=500 should NOT appear
      expect(segments[0]!.end.y).toBeLessThan(400);
    });

    it("INTEGRATION: full scenario with actual cone projection (no umbrella)", () => {
      // Without umbrella, full surface is visible - this is expected
      const player: Vector2 = { x: 637.81, y: 666 };
      
      const allSurfaces: Surface[] = [
        createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }),
        createTestSurface("ceiling", { x: 0, y: 80 }, { x: 1280, y: 80 }),
        createTestSurface("platform-2", { x: 550, y: 350 }, { x: 750, y: 350 }),
        createTestSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 }),
      ];
      
      const screenBounds = { minX: 0, maxX: 1280, minY: 0, maxY: 720 };
      const plannedSurface = allSurfaces.find(s => s.id === "ricochet-4")!;
      
      // Stage 1: compute visibility from player (full 360°)
      const cone = createFullCone(player);
      const sourcePoints = projectConeV2(cone, toChains(allSurfaces), screenBounds);
      
      const segments = extractVisibleSurfaceSegments(
        plannedSurface.id,
        sourcePoints,
        plannedSurface.segment
      );
      
      // Full surface visible without umbrella
      expect(segments.length).toBe(1);
      expect(segments[0]!.end.y).toBeCloseTo(500); // Full surface
    });

    it("INTEGRATION: with umbrella - only partial surface visible", () => {
      // With umbrella, only portion of ricochet-4 should be visible
      // This reproduces the user's exact scenario
      const player: Vector2 = { x: 637.81, y: 666 };
      
      // Umbrella window - from user's first scenario visibility polygon
      // The umbrella is a line segment in front of the player
      const umbrellaWindow = {
        start: { x: 590.29, y: 566 },  // Left edge from visibility
        end: { x: 740.29, y: 566 }     // Right edge from visibility
      };
      
      const allSurfaces: Surface[] = [
        createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }),
        createTestSurface("ceiling", { x: 0, y: 80 }, { x: 1280, y: 80 }),
        createTestSurface("platform-2", { x: 550, y: 350 }, { x: 750, y: 350 }),
        createTestSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 }),
      ];
      
      const screenBounds = { minX: 0, maxX: 1280, minY: 0, maxY: 720 };
      const plannedSurface = allSurfaces.find(s => s.id === "ricochet-4")!;
      
      // Stage 1: compute visibility through umbrella window
      const cone = createConeThroughWindow(player, umbrellaWindow.start, umbrellaWindow.end);
      const sourcePoints = projectConeV2(cone, toChains(allSurfaces), screenBounds);
      
      // Find points on ricochet-4
      const ricochet4Points: Vector2[] = [];
      for (const sp of sourcePoints) {
        if (isEndpoint(sp) && sp.surface.id === "ricochet-4") {
          ricochet4Points.push(sp.computeXY());
        } else if (isHitPoint(sp) && sp.hitSurface.id === "ricochet-4") {
          ricochet4Points.push(sp.computeXY());
        }
      }
      
      console.log("=== Stage 1 (umbrella) points on ricochet-4 ===");
      console.log("Points found:", ricochet4Points.length);
      ricochet4Points.forEach((p, i) => console.log(`  [${i}] (${p.x.toFixed(2)}, ${p.y.toFixed(2)})`));
      
      const segments = extractVisibleSurfaceSegments(
        plannedSurface.id,
        sourcePoints,
        plannedSurface.segment
      );
      
      console.log("=== Extracted segments (umbrella) ===");
      segments.forEach((seg, i) => {
        console.log(`  [${i}] start=(${seg.start.x.toFixed(2)}, ${seg.start.y.toFixed(2)}), end=(${seg.end.x.toFixed(2)}, ${seg.end.y.toFixed(2)})`);
      });
      
      // With umbrella, only partial surface should be visible
      // The segment should NOT extend to y=500
      expect(segments.length).toBe(1);
      const maxY = Math.max(segments[0]!.start.y, segments[0]!.end.y);
      console.log("Max Y with umbrella:", maxY);
      
      // Key assertion: umbrella blocks lower portion of ricochet-4
      // (The exact value depends on umbrella position - just verify it's not 500)
      expect(maxY).toBeLessThan(500);
    });

    it("INTEGRATION: ValidRegionRenderer with umbrella AND planned surface", () => {
      // Full integration test using actual ValidRegionRenderer
      // This tests the staged calculation flow
      const player: Vector2 = { x: 637.81, y: 666 };
      
      // Umbrella window
      const umbrellaY = player.y - 100; // 100 pixels above player
      const umbrellaWindow = {
        start: { x: player.x - 75, y: umbrellaY },
        end: { x: player.x + 75, y: umbrellaY }
      };
      const windowConfig = createSingleWindow(umbrellaWindow);
      
      const allSurfaces: Surface[] = [
        createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }),
        createTestSurface("ceiling", { x: 0, y: 80 }, { x: 1280, y: 80 }),
        createTestSurface("platform-2", { x: 550, y: 350 }, { x: 750, y: 350 }),
        createTestSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 }),
      ];
      
      const plannedSurfaces = [allSurfaces.find(s => s.id === "ricochet-4")!];
      const screenBounds = { minX: 0, maxX: 1280, minY: 0, maxY: 720 };
      
      // Create mock graphics
      const mockGraphics = {
        clear: () => {},
        fillStyle: () => {},
        fillRect: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        fillPath: () => {},
        lineStyle: () => {},
        strokePath: () => {},
        setBlendMode: () => {},
      };
      
      const renderer = new ValidRegionRenderer(mockGraphics, screenBounds);
      
      // Render with umbrella AND planned surface
      renderer.render(player, plannedSurfaces, toChains(allSurfaces), windowConfig);
      
      // Get the visibility stages
      const stages = renderer.getVisibilityStages();
      
      console.log("=== Visibility Stages ===");
      console.log("Number of stages:", stages.length);
      
      // Stage 1: umbrella visibility from player
      if (stages[0]) {
        console.log("Stage 1 origin:", stages[0].origin);
        console.log("Stage 1 polygon length:", stages[0].polygon.length);
        console.log("Stage 1 isValid:", stages[0].isValid);
        
        // Find ricochet-4 points in Stage 1
        const stage1Ricochet4 = stages[0].polygon.filter(
          (p: Vector2) => Math.abs(p.x - 850) < 1
        );
        console.log("Stage 1 ricochet-4 points:", stage1Ricochet4);
      }
      
      // Stage 2: reflected visibility
      if (stages[1]) {
        console.log("Stage 2 origin:", stages[1].origin);
        console.log("Stage 2 polygon length:", stages[1].polygon.length);
        console.log("Stage 2 isValid:", stages[1].isValid);
        console.log("Stage 2 polygon:", stages[1].polygon);
      }
      
      // Key assertions
      expect(stages.length).toBe(2); // Should have both stages
      expect(stages[1]?.isValid).toBe(true);
      
      // The Stage 2 polygon should NOT include y=500 if umbrella limited Stage 1
      const stage2Polygon = stages[1]?.polygon ?? [];
      const maxY = Math.max(...stage2Polygon.map((p: Vector2) => p.y));
      console.log("Stage 2 max Y:", maxY);
      
      // If umbrella limited visibility to ~460, reflected polygon shouldn't extend to y=500
      // Note: The reflected polygon is from the player IMAGE, so coordinates transform
    });

    it("should use windowed visibility when windowConfig is present", () => {
      // This test verifies that when umbrella mode is active AND a surface is planned,
      // the initial visibility for determining window segments uses the umbrella cone,
      // not full 360° visibility.
      //
      // Setup from user's bug report:
      // - Player at (665.29, 666)
      // - Umbrella window from ~(590, 566) to ~(740, 566)
      // - ricochet-4 surface from (850, 350) to (850, 500)
      // - Light only reaches (850, 350) to (850, 419.72) of the surface
      //
      // When planned, the reflection window should be (350, 419.72), not (350, 500)

      const plannedSurface = createTestSurface(
        "ricochet-4",
        { x: 850, y: 350 },
        { x: 850, y: 500 }
      );

      // Simulate: umbrella blocks bottom portion, only top portion receives light
      // Points from the visibility polygon that hit ricochet-4
      const sourcePoints = createSourcePointsForSurface(
        plannedSurface,
        { x: 850, y: 350 },      // Top of visible portion
        { x: 850, y: 419.72 }    // Bottom of visible portion (NOT 500!)
      );

      const segments = extractVisibleSurfaceSegments(
        plannedSurface.id,
        sourcePoints,
        plannedSurface.segment
      );

      // Should produce one window segment for only the lit portion
      expect(segments).toHaveLength(1);
      expect(segments[0]!.start.y).toBeCloseTo(350);
      expect(segments[0]!.end.y).toBeCloseTo(419.72, 1);
      // The full surface goes to y=500, but blocked portion should NOT be included
    });
  });

  describe("UNIFIED: Segments = Highlight Cones = Reflection Polygons", () => {
    it("should produce same count of segments, cones, and reflection polygons", () => {
      // This is the key unified test:
      // getVisibleSurfaceSegments() is the SINGLE source of truth
      // - Each segment = 1 highlight cone
      // - Each segment = 1 reflection window = 1 reflection polygon
      
      const targetSurface = createTestSurface(
        "ricochet-4",
        { x: 850, y: 350 },
        { x: 850, y: 500 }
      );
      const obstacleSurface = createTestSurface(
        "obstacle",
        { x: 0, y: 0 },
        { x: 100, y: 100 }
      );
      const origin: Vector2 = { x: 600, y: 600 };

      // Create TWO separate portions (gap in middle)
      const portion1: Surface = {
        ...targetSurface,
        segment: { start: { x: 850, y: 350 }, end: { x: 850, y: 400 } },
      };
      const portion2: Surface = {
        ...targetSurface,
        segment: { start: { x: 850, y: 450 }, end: { x: 850, y: 500 } },
      };

      // Source points with gap
      const sourcePoints: SourcePoint[] = [
        new Endpoint(portion1, "start"),
        new Endpoint(portion1, "end"),
        new Endpoint(obstacleSurface, "start"),  // GAP
        new Endpoint(portion2, "start"),
        new Endpoint(portion2, "end"),
      ];

      // Get segments (source of truth)
      const segments = extractVisibleSurfaceSegments(
        targetSurface.id,
        sourcePoints,
        targetSurface.segment
      );

      // Convert to cones
      const cones = segmentsToCones(origin, targetSurface, segments, null);

      console.log("=== UNIFIED Test ===");
      console.log("Segments:", segments.length);
      console.log("Highlight Cones:", cones.length);
      
      // KEY ASSERTION: counts must match!
      expect(segments.length).toBe(2);
      expect(cones.length).toBe(segments.length);
      
      // Each cone should have 3 vertices (triangle: origin + segment endpoints)
      for (const cone of cones) {
        expect(cone.vertices.length).toBe(3);
      }
    });

    it("should handle umbrella hole mode with TWO windows hitting surface", () => {
      // Umbrella hole mode creates 2 cones of light
      // If both hit the same surface at different portions, we get 2 segments
      // → 2 highlight cones, 2 reflection polygons
      
      const targetSurface = createTestSurface(
        "ricochet-2",
        { x: 400, y: 250 },
        { x: 550, y: 250 }
      );
      const otherSurface = createTestSurface(
        "other",
        { x: 0, y: 0 },
        { x: 100, y: 100 }
      );
      const origin: Vector2 = { x: 500, y: 600 };

      // TWO cones from umbrella hole hit ricochet-2 at different portions
      const leftPortion: Surface = {
        ...targetSurface,
        segment: { start: { x: 400, y: 250 }, end: { x: 450, y: 250 } },
      };
      const rightPortion: Surface = {
        ...targetSurface,
        segment: { start: { x: 500, y: 250 }, end: { x: 550, y: 250 } },
      };

      // Source points: left cone hits left portion, gap, right cone hits right portion
      const sourcePoints: SourcePoint[] = [
        new Endpoint(leftPortion, "start"),
        new Endpoint(leftPortion, "end"),
        new Endpoint(otherSurface, "start"),  // GAP between cones
        new Endpoint(rightPortion, "start"),
        new Endpoint(rightPortion, "end"),
      ];

      const segments = extractVisibleSurfaceSegments(
        targetSurface.id,
        sourcePoints,
        targetSurface.segment
      );

      const cones = segmentsToCones(origin, targetSurface, segments, null);

      console.log("=== Umbrella Hole Mode ===");
      console.log("Segments:", segments.length);
      console.log("Cones:", cones.length);

      // 2 windows → 2 segments → 2 cones → (would be) 2 reflection polygons
      expect(segments.length).toBe(2);
      expect(cones.length).toBe(2);
    });
  });

  describe("Reflective side check", () => {
    /**
     * Create a directional test surface that only reflects from one side.
     * Uses the cross-product to determine which side is reflective.
     */
    function createDirectionalSurface(
      id: string,
      start: Vector2,
      end: Vector2
    ): Surface {
      // Normal points to the "left" of the segment (counter-clockwise 90°)
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const normal = { x: -dy / len, y: dx / len };

      return {
        id,
        segment: { start, end },
        isPlannable: () => true,
        canReflectFrom: (incomingDirection: Vector2) => {
          // Approaching from front means incoming direction is opposite to normal
          // dot(incoming, normal) < 0 means they point in opposite directions
          const dot = incomingDirection.x * normal.x + incomingDirection.y * normal.y;
          return dot < 0;
        },
        getNormal: () => normal,
        getCenter: () => ({
          x: (start.x + end.x) / 2,
          y: (start.y + end.y) / 2,
        }),
      } as Surface;
    }

    it("should NOT generate Stage 3 visibility when light hits wrong side of second surface", () => {
      /**
       * This test reproduces the bug from user's JSON:
       * - Player at (170, 666)
       * - Planned surfaces: ricochet-4, then ricochet-3
       * - After reflecting through ricochet-4, the light origin is on the WRONG side of ricochet-3
       * - Therefore, no Stage 3 visibility should be generated
       */
      const player = { x: 170, y: 666 };
      
      // ricochet-4: vertical surface on the right side
      const ricochet4 = createDirectionalSurface(
        "ricochet-4",
        { x: 850, y: 350 },
        { x: 850, y: 500 }
      );
      
      // ricochet-3: diagonal surface in upper left
      const ricochet3 = createDirectionalSurface(
        "ricochet-3",
        { x: 100, y: 200 },
        { x: 200, y: 300 }
      );

      // Other surfaces (walls and platforms)
      const floor = createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 });
      const ceiling = createTestSurface("ceiling", { x: 0, y: 80 }, { x: 1280, y: 80 });
      const leftWall = createTestSurface("left-wall", { x: 20, y: 80 }, { x: 20, y: 700 });
      const rightWall = createTestSurface("right-wall", { x: 1260, y: 80 }, { x: 1260, y: 700 });

      const allSurfaces = [floor, ceiling, leftWall, rightWall, ricochet4, ricochet3];
      const plannedSurfaces = [ricochet4, ricochet3];

      const screenBounds = { minX: 0, minY: 0, maxX: 1280, maxY: 720 };

      // Create mock graphics
      const mockGraphics = {
        clear: () => {},
        fillStyle: () => {},
        lineStyle: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        fillPath: () => {},
        strokePath: () => {},
        fillRect: () => {},
        setBlendMode: () => {},
      };

      const renderer = new ValidRegionRenderer(mockGraphics, screenBounds);
      renderer.render(player, plannedSurfaces, toChains(allSurfaces), null);

      const stages = renderer.getVisibilityStages();
      console.log("=== Wrong-Side Reflection Test ===");
      console.log(`Total stages: ${stages.length}`);
      for (let i = 0; i < stages.length; i++) {
        const stage = stages[i]!;
        console.log(`Stage ${i}: valid=${stage.isValid}, polygon points=${stage.polygon.length}`);
      }

      // Stage 1: Player's direct visibility (should be valid)
      expect(stages.length).toBeGreaterThanOrEqual(1);
      expect(stages[0]!.isValid).toBe(true);

      // After reflecting through ricochet-4, the reflected origin should be 
      // on the WRONG side of ricochet-3 (based on the geometry).
      // Therefore, we should only have 2 stages (Stage 1 player + Stage 2 through ricochet-4).
      // Stage 3 should NOT be generated or should be invalid.

      // The key assertion: we should NOT have a valid Stage 3
      if (stages.length >= 3) {
        // If Stage 3 exists, it should be invalid (no polygon)
        const stage3 = stages[2]!;
        expect(stage3.isValid).toBe(false);
        expect(stage3.polygon.length).toBe(0);
      }
      // OR we should only have 2 stages
      expect(stages.length).toBeLessThanOrEqual(2);
    });

    it("should check if origin is on reflective side before reflecting", () => {
      /**
       * Unit test for the reflective-side check logic.
       * 
       * For a vertical surface from (100, 200) to (100, 400):
       * - Direction: (0, 200) - pointing down
       * - Normal: (-200, 0) normalized = (-1, 0) - points LEFT
       * 
       * The surface reflects light coming from the LEFT (where the normal points).
       * canReflectFrom(direction) returns true when dot(direction, normal) < 0,
       * i.e., when the incoming direction is OPPOSITE to the normal.
       * 
       * So light coming from the RIGHT (pointing LEFT) CAN reflect (dot < 0).
       * Light coming from the LEFT (pointing RIGHT) CANNOT reflect (dot > 0).
       */
      const surface = createDirectionalSurface(
        "vertical",
        { x: 100, y: 200 },
        { x: 100, y: 400 }
      );

      const surfaceCenter = surface.getCenter();
      const normal = surface.getNormal!();
      console.log("Surface center:", surfaceCenter);
      console.log("Surface normal:", normal);

      // Origin to the RIGHT of surface (e.g., x=300)
      // Light travels LEFT toward surface
      // Direction is LEFT, opposite to normal (which also points LEFT)
      // Wait, that's same direction... Let me recalculate.
      //
      // Normal points LEFT (-1, 0).
      // For origin at (300, 300), direction to surface center (100, 300) is (-200, 0) normalized = (-1, 0).
      // Dot product: (-1)*(-1) + 0*0 = 1 > 0 → CANNOT reflect
      //
      // For origin at (-100, 300), direction to surface center (100, 300) is (200, 0) normalized = (1, 0).
      // Dot product: (1)*(-1) + 0*0 = -1 < 0 → CAN reflect

      // Origin to the LEFT of surface - light points RIGHT toward surface
      const leftOrigin = { x: -100, y: 300 };
      const dirFromLeft = {
        x: surfaceCenter.x - leftOrigin.x,  // 200 (pointing right)
        y: surfaceCenter.y - leftOrigin.y,  // 0
      };
      console.log("Dir from left:", dirFromLeft);
      console.log("Dot product:", dirFromLeft.x * normal.x + dirFromLeft.y * normal.y);
      
      // Direction (1, 0) dot Normal (-1, 0) = -1 < 0 → CAN reflect
      expect(surface.canReflectFrom(dirFromLeft)).toBe(true);

      // Origin to the RIGHT of surface - light points LEFT toward surface
      const rightOrigin = { x: 300, y: 300 };
      const dirFromRight = {
        x: surfaceCenter.x - rightOrigin.x,  // -200 (pointing left)
        y: surfaceCenter.y - rightOrigin.y,  // 0
      };
      console.log("Dir from right:", dirFromRight);
      console.log("Dot product:", dirFromRight.x * normal.x + dirFromRight.y * normal.y);
      
      // Direction (-1, 0) dot Normal (-1, 0) = 1 > 0 → CANNOT reflect
      expect(surface.canReflectFrom(dirFromRight)).toBe(false);
    });
  });

  describe("Polygon sorting for reflected visibility", () => {
    it("should produce non-self-intersecting polygon for single planned surface", () => {
      /**
       * Reproduces bug: Self-intersecting polygon after reflecting through ricochet-3.
       * 
       * Setup from user's JSON:
       * - Player at (170, 666)
       * - One planned surface: ricochet-3 from (100, 200) to (200, 300)
       * - After reflection, origin is at (566, 270)
       * 
       * The bug shows vertices in wrong order:
       * 1. (200, 300) at ~175°
       * 2. (20, 187.98) at ~188°  
       * 3. (20, 314.75) at ~175°  <- WRONG! Should come before #2
       * 4. (100, 200) at ~188°
       * 
       * This creates a bowtie/self-intersection.
       */
      const player = { x: 170, y: 666 };
      
      // ricochet-3: diagonal surface in upper left
      // Use createTestSurface since we just need to test polygon ordering
      const ricochet3 = createTestSurface(
        "ricochet-3",
        { x: 100, y: 200 },
        { x: 200, y: 300 }
      );

      // Walls
      const floor = createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 });
      const ceiling = createTestSurface("ceiling", { x: 0, y: 80 }, { x: 1280, y: 80 });
      const leftWall = createTestSurface("left-wall", { x: 20, y: 80 }, { x: 20, y: 700 });
      const rightWall = createTestSurface("right-wall", { x: 1260, y: 80 }, { x: 1260, y: 700 });

      const allSurfaces = [floor, ceiling, leftWall, rightWall, ricochet3];
      const plannedSurfaces = [ricochet3];

      const screenBounds = { minX: 0, minY: 0, maxX: 1280, maxY: 720 };

      // Create mock graphics
      const mockGraphics = {
        clear: () => {},
        fillStyle: () => {},
        lineStyle: () => {},
        beginPath: () => {},
        moveTo: () => {},
        lineTo: () => {},
        closePath: () => {},
        fillPath: () => {},
        strokePath: () => {},
        fillRect: () => {},
        setBlendMode: () => {},
      };

      const renderer = new ValidRegionRenderer(mockGraphics, screenBounds);
      renderer.render(player, plannedSurfaces, toChains(allSurfaces), null);

      const stages = renderer.getVisibilityStages();
      console.log("=== Polygon Sorting Test ===");
      console.log(`Total stages: ${stages.length}`);
      
      // Get Stage 2 (the reflected visibility)
      expect(stages.length).toBeGreaterThanOrEqual(2);
      const stage2 = stages[1]!;
      expect(stage2.isValid).toBe(true);
      
      const polygon = stage2.polygon;
      console.log(`Stage 2 polygon vertices: ${polygon.length}`);
      for (let i = 0; i < polygon.length; i++) {
        const v = polygon[i]!;
        console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
      }

      // Verify polygon is not self-intersecting by checking angular order
      // All points should be in monotonic angular order from the origin
      const origin = stage2.origin;
      console.log(`Origin: (${origin.x}, ${origin.y})`);

      // Use cross-product to verify CCW ordering
      // For each consecutive triple (a, b, c), cross(b-a, c-a) should be positive (CCW)
      // or we use cross(origin->a, origin->b) to check angular order
      let isValid = true;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i]!;
        const b = polygon[(i + 1) % polygon.length]!;
        const c = polygon[(i + 2) % polygon.length]!;
        
        // Check that the polygon doesn't backtrack
        // Cross product of (b-a) x (c-b) should maintain consistent sign
        const cross1 = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
        console.log(`  Edge ${i}->${i+1}->${i+2}: cross=${cross1.toFixed(2)}`);
      }

      // Simple self-intersection check: verify no edge pairs cross
      for (let i = 0; i < polygon.length; i++) {
        const a1 = polygon[i]!;
        const a2 = polygon[(i + 1) % polygon.length]!;
        
        for (let j = i + 2; j < polygon.length; j++) {
          // Skip adjacent edges
          if (j === (i + polygon.length - 1) % polygon.length) continue;
          
          const b1 = polygon[j]!;
          const b2 = polygon[(j + 1) % polygon.length]!;
          
          // Check if edges (a1,a2) and (b1,b2) intersect
          const d1 = (b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x);
          const d2 = (b2.x - b1.x) * (a2.y - b1.y) - (b2.y - b1.y) * (a2.x - b1.x);
          const d3 = (a2.x - a1.x) * (b1.y - a1.y) - (a2.y - a1.y) * (b1.x - a1.x);
          const d4 = (a2.x - a1.x) * (b2.y - a1.y) - (a2.y - a1.y) * (b2.x - a1.x);
          
          // Edges intersect if d1 and d2 have opposite signs AND d3 and d4 have opposite signs
          const intersects = (d1 * d2 < 0) && (d3 * d4 < 0);
          if (intersects) {
            console.log(`  INTERSECTION: edge ${i}->${i+1} crosses edge ${j}->${j+1}`);
            isValid = false;
          }
        }
      }

      expect(isValid).toBe(true);
    });
  });
});

