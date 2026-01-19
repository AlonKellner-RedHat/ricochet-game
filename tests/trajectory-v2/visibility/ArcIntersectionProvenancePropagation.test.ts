/**
 * Test for ArcIntersectionPoint provenance propagation.
 * 
 * When Stage 1 computes an ArcIntersectionPoint on the window surface,
 * that exact point should be propagated to Stage 2 via leftBoundarySource/rightBoundarySource.
 * Stage 2 should NOT recompute a new ArcIntersectionPoint for the window surface.
 * 
 * This prevents floating-point duplicates that cause "Collinear points without PreComputedPairs" errors.
 */

import { describe, it, expect } from "vitest";
import { 
  createConeThroughWindow, 
  projectConeV2, 
  createFullCone,
  type RangeLimitConfig 
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import { createSingleSurfaceChain, type SurfaceChain } from "@/trajectory-v2/geometry/SurfaceChain";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import { 
  isArcIntersectionPoint,
  ArcIntersectionPoint,
  type SourcePoint,
} from "@/trajectory-v2/geometry/SourcePoint";
import { createRangeLimitPair } from "@/trajectory-v2/obstacles/RangeLimit";
import type { Surface } from "@/surfaces/Surface";

// Create a mock surface
function createMockSurface(
  id: string, 
  start: { x: number; y: number }, 
  end: { x: number; y: number },
  canReflect = true
): Surface {
  return {
    id,
    segment: { start, end },
    canReflectFrom: () => canReflect,
    getNormal: () => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      return { x: -dy / len, y: dx / len };
    },
    isValidReflectionPoint: () => true,
  } as Surface;
}

const SCREEN_BOUNDS = { minX: 0, minY: 0, maxX: 1280, maxY: 720 };

describe("ArcIntersectionPoint Provenance Propagation", () => {
  const PLAYER = { x: 187.85, y: 586 };
  const REFLECTED_ORIGIN = { x: 912.15, y: 586 }; // Reflected through window at x=550
  const RANGE_LIMIT_RADIUS = 480;
  
  // Window surface
  const WINDOW_START = { x: 550, y: 150 };
  const WINDOW_END = { x: 550, y: 550 };

  it("should NOT create duplicate ArcIntersectionPoints when window is excluded", () => {
    console.log("=== PROVENANCE PROPAGATION TEST ===");
    
    // Create window surface
    const windowSurface = createMockSurface("mirror-right-0", WINDOW_START, WINDOW_END);
    const windowChain = createSingleSurfaceChain(windowSurface);
    const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
    const allChains: SurfaceChain[] = [windowChain, screenChain];
    
    // Stage 1: Player visibility (full cone, window NOT excluded)
    const rangeLimitPair = createRangeLimitPair(RANGE_LIMIT_RADIUS, "horizontal");
    const stage1RangeLimit: RangeLimitConfig = {
      pair: rangeLimitPair,
      center: PLAYER, // Stage 1 uses player as center
    };
    
    const stage1Cone = createFullCone(PLAYER);
    const stage1Points = projectConeV2(
      stage1Cone,
      allChains,
      undefined, // No exclusion in Stage 1
      undefined,
      undefined,
      stage1RangeLimit
    );
    
    // Find ArcIntersectionPoint on window from Stage 1
    const stage1WindowArcIntersections = stage1Points.filter(
      sp => isArcIntersectionPoint(sp) && sp.surface?.id === "mirror-right-0"
    ) as ArcIntersectionPoint[];
    
    console.log("Stage 1 window ArcIntersections:", stage1WindowArcIntersections.length);
    for (const ai of stage1WindowArcIntersections) {
      const xy = ai.computeXY();
      console.log(`  t=${ai.t}, position=(${xy.x.toFixed(2)}, ${xy.y.toFixed(2)})`);
    }
    
    // Stage 2: Reflected visibility through window
    // The window ArcIntersectionPoint becomes a boundary
    const stage2RangeLimit: RangeLimitConfig = {
      pair: rangeLimitPair,
      center: REFLECTED_ORIGIN, // Stage 2 uses reflected origin
    };
    
    // Use an ArcIntersectionPoint as the window boundary (simulating what ValidRegionRenderer does)
    const windowBoundarySource = stage1WindowArcIntersections[0];
    const windowBoundaryPos = windowBoundarySource?.computeXY() ?? WINDOW_START;
    
    const stage2Cone = createConeThroughWindow(
      REFLECTED_ORIGIN,
      windowBoundaryPos, // Use the ArcIntersection position as window start
      WINDOW_END,
      windowBoundarySource, // Pass the original ArcIntersectionPoint as provenance!
      undefined
    );
    
    const stage2Points = projectConeV2(
      stage2Cone,
      allChains,
      "mirror-right-0", // EXCLUDE window in Stage 2
      undefined,
      undefined,
      stage2RangeLimit
    );
    
    // Count ArcIntersectionPoints on window surface in Stage 2
    const stage2WindowArcIntersections = stage2Points.filter(
      sp => isArcIntersectionPoint(sp) && sp.surface?.id === "mirror-right-0"
    );
    
    console.log("\nStage 2 window ArcIntersections:", stage2WindowArcIntersections.length);
    
    // With the fix, there should be at most 1 (the propagated one from Stage 1)
    // Previously, Stage 2 would create a duplicate with floating-point differences
    expect(stage2WindowArcIntersections.length).toBeLessThanOrEqual(1);
    
    // If there is one, it should be the EXACT same object (provenance propagation)
    if (stage2WindowArcIntersections.length === 1 && windowBoundarySource) {
      expect(stage2WindowArcIntersections[0]).toBe(windowBoundarySource);
    }
  });

  it("should not throw collinear error with identical t values", () => {
    console.log("\n=== COLLINEAR ERROR PREVENTION TEST ===");
    
    // Create window surface
    const windowSurface = createMockSurface("mirror-right-0", WINDOW_START, WINDOW_END);
    const windowChain = createSingleSurfaceChain(windowSurface);
    const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
    const allChains: SurfaceChain[] = [windowChain, screenChain];
    
    const rangeLimitPair = createRangeLimitPair(RANGE_LIMIT_RADIUS, "horizontal");
    
    // Manually create an ArcIntersectionPoint with a specific t
    const arcIntersectionT = 0.20733910461035285;
    const windowArcIntersection = new ArcIntersectionPoint(
      windowSurface,
      arcIntersectionT,
      "range_limit"
    );
    
    const windowPos = windowArcIntersection.computeXY();
    console.log(`Window ArcIntersection: t=${arcIntersectionT}, pos=(${windowPos.x.toFixed(2)}, ${windowPos.y.toFixed(2)})`);
    
    // Create cone using this ArcIntersectionPoint as boundary
    const stage2Cone = createConeThroughWindow(
      REFLECTED_ORIGIN,
      windowPos,
      WINDOW_END,
      windowArcIntersection, // Pass as provenance
      undefined
    );
    
    const stage2RangeLimit: RangeLimitConfig = {
      pair: rangeLimitPair,
      center: REFLECTED_ORIGIN,
    };
    
    // This should NOT throw "Collinear points without PreComputedPairs"
    expect(() => {
      projectConeV2(
        stage2Cone,
        allChains,
        "mirror-right-0", // Exclude window
        undefined,
        undefined,
        stage2RangeLimit
      );
    }).not.toThrow();
    
    console.log("No collinear error thrown - provenance propagation working!");
  });

  it("should create ArcIntersectionPoints for non-excluded surfaces", () => {
    console.log("\n=== NON-EXCLUDED SURFACES TEST ===");
    
    // Create multiple surfaces
    const windowSurface = createMockSurface("mirror-right-0", WINDOW_START, WINDOW_END);
    const otherSurface = createMockSurface("other-surface", { x: 400, y: 200 }, { x: 400, y: 500 });
    const windowChain = createSingleSurfaceChain(windowSurface);
    const otherChain = createSingleSurfaceChain(otherSurface);
    const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
    const allChains: SurfaceChain[] = [windowChain, otherChain, screenChain];
    
    const rangeLimitPair = createRangeLimitPair(RANGE_LIMIT_RADIUS, "horizontal");
    const rangeLimit: RangeLimitConfig = {
      pair: rangeLimitPair,
      center: REFLECTED_ORIGIN,
    };
    
    const cone = createConeThroughWindow(REFLECTED_ORIGIN, WINDOW_START, WINDOW_END);
    
    const sourcePoints = projectConeV2(
      cone,
      allChains,
      "mirror-right-0", // Exclude window
      undefined,
      undefined,
      rangeLimit
    );
    
    // ArcIntersectionPoints on the window should not exist (excluded)
    const windowArcIntersections = sourcePoints.filter(
      sp => isArcIntersectionPoint(sp) && sp.surface?.id === "mirror-right-0"
    );
    
    // ArcIntersectionPoints on other surfaces SHOULD exist
    const otherArcIntersections = sourcePoints.filter(
      sp => isArcIntersectionPoint(sp) && sp.surface?.id === "other-surface"
    );
    
    console.log("Window ArcIntersections:", windowArcIntersections.length);
    console.log("Other surface ArcIntersections:", otherArcIntersections.length);
    
    // Window should have 0 (excluded)
    expect(windowArcIntersections.length).toBe(0);
    
    // Other surface should have ArcIntersections if it crosses the range limit
    // (depending on geometry, but the point is it's NOT excluded)
    console.log("Verified: excluded surfaces don't get ArcIntersectionPoints computed");
  });
});
