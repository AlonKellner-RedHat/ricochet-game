/**
 * Test to diagnose why ArcIntersectionPoint on the window surface is not being included.
 */

import { describe, it, expect } from "vitest";
import { 
  createConeThroughWindow, 
  projectConeV2, 
  isPointInCone,
  type RangeLimitConfig 
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import { createSingleSurfaceChain, type SurfaceChain, createWallChain } from "@/trajectory-v2/geometry/SurfaceChain";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import { 
  isArcIntersectionPoint, 
  isOriginPoint,
  isHitPoint,
  isEndpoint,
  isArcHitPoint,
  isArcJunctionPoint,
  ArcIntersectionPoint,
} from "@/trajectory-v2/geometry/SourcePoint";
import { isJunctionPoint } from "@/trajectory-v2/geometry/SurfaceChain";
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

// Screen bounds
const SCREEN_BOUNDS = { minX: 0, minY: 0, maxX: 1280, maxY: 720 };

describe("ArcIntersectionPoint on Window", () => {
  const PLAYER = { x: 170, y: 586 };
  const REFLECTED_ORIGIN = { x: 930, y: 586 };
  const RANGE_LIMIT_RADIUS = 480;
  
  const WINDOW_START = { x: 550, y: 150 };
  const WINDOW_END = { x: 550, y: 550 };
  
  // Expected arc intersection at (550, ~293)
  const EXPECTED_Y = 586 - Math.sqrt(480 * 480 - 380 * 380);

  it("should verify ArcIntersectionPoint position is in cone", () => {
    console.log("=== CONE GEOMETRY CHECK ===");
    
    const cone = createConeThroughWindow(REFLECTED_ORIGIN, WINDOW_START, WINDOW_END);
    
    console.log("Cone origin:", cone.origin);
    console.log("Cone left boundary:", cone.leftBoundary);
    console.log("Cone right boundary:", cone.rightBoundary);
    console.log("Expected ArcIntersection:", { x: 550, y: EXPECTED_Y });
    
    const arcIntersectionPoint = { x: 550, y: EXPECTED_Y };
    const isInCone = isPointInCone(arcIntersectionPoint, cone);
    
    console.log("Is ArcIntersectionPoint in cone?", isInCone);
    
    // The point should be in the cone
    expect(isInCone).toBe(true);
  });

  it("should NOT recompute ArcIntersectionPoint when window surface is excluded (provenance propagation)", () => {
    console.log("\n=== EXCLUDED WINDOW TEST (Provenance) ===");
    
    // Create the window surface
    const windowSurface = createMockSurface("mirror-right-0", WINDOW_START, WINDOW_END);
    const windowChain = createSingleSurfaceChain(windowSurface);
    const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
    const allChains: SurfaceChain[] = [windowChain, screenChain];
    
    const rangeLimitPair = createRangeLimitPair(RANGE_LIMIT_RADIUS, "horizontal");
    const rangeLimit: RangeLimitConfig = {
      pair: rangeLimitPair,
      center: PLAYER,
    };
    
    const cone = createConeThroughWindow(REFLECTED_ORIGIN, WINDOW_START, WINDOW_END);
    
    // Project WITH the window surface excluded
    // ArcIntersectionPoints on excluded surface should NOT be recomputed
    // They should come from provenance propagation (leftBoundarySource/rightBoundarySource)
    const sourcePoints = projectConeV2(
      cone, 
      allChains, 
      "mirror-right-0",  // EXCLUDE the window
      undefined, 
      undefined, 
      rangeLimit
    );
    
    console.log("Total vertices:", sourcePoints.length);
    
    for (const sp of sourcePoints) {
      const xy = sp.computeXY();
      let type = "unknown";
      let extra = "";
      
      if (isOriginPoint(sp)) type = "origin";
      else if (isArcHitPoint(sp)) type = "arc_hit";
      else if (isArcIntersectionPoint(sp)) {
        type = "arc_intersection";
        extra = ` surface=${sp.surface?.id} type=${sp.intersectionType}`;
      }
      else if (isArcJunctionPoint(sp)) type = "arc_junction";
      else if (isJunctionPoint(sp)) type = "junction";
      else if (isHitPoint(sp)) {
        type = "hit_point";
        extra = ` surface=${sp.hitSurface?.id}`;
      }
      else if (isEndpoint(sp)) {
        type = "endpoint";
        extra = ` surface=${sp.surface?.id}`;
      }
      
      console.log(`  ${type}: (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)})${extra}`);
    }
    
    // Check for ArcIntersectionPoints on the window
    const windowArcIntersections = sourcePoints.filter(
      sp => isArcIntersectionPoint(sp) && sp.surface?.id === "mirror-right-0"
    );
    
    console.log("\nWindow ArcIntersectionPoints:", windowArcIntersections.length);
    
    // With provenance propagation, excluded surfaces should NOT have ArcIntersectionPoints recomputed
    // They should come from the caller via leftBoundarySource/rightBoundarySource
    expect(windowArcIntersections.length).toBe(0);
    console.log("Verified: Excluded surfaces don't get ArcIntersectionPoints recomputed");
  });

  it("should verify ArcIntersectionPoint is created as ray target", () => {
    console.log("\n=== RAY TARGET CHECK ===");
    
    // Manually create the ArcIntersectionPoint and check its properties
    const windowSurface = createMockSurface("mirror-right-0", WINDOW_START, WINDOW_END);
    
    // Compute t for the arc intersection on the window
    // Window goes from (550, 150) to (550, 550) - length 400
    // Arc intersection is at (550, ~293)
    const arcY = EXPECTED_Y;
    const t = (arcY - 150) / (550 - 150);
    
    console.log("Window segment length:", 400);
    console.log("Arc intersection y:", arcY);
    console.log("Computed t:", t);
    
    // t should be in (0, 1)
    expect(t).toBeGreaterThan(0);
    expect(t).toBeLessThan(1);
    
    const arcIntersection = new ArcIntersectionPoint(windowSurface, t, "range_limit");
    const xy = arcIntersection.computeXY();
    
    console.log("ArcIntersectionPoint position:", xy);
    console.log("Expected position:", { x: 550, y: arcY });
    
    expect(xy.x).toBeCloseTo(550, 1);
    expect(xy.y).toBeCloseTo(arcY, 1);
  });

  it("should NOT filter ArcIntersectionPoint due to isPointPastWindow", () => {
    console.log("\n=== isPointPastWindow CHECK ===");
    
    // Check the isPointPastWindow logic manually
    const origin = REFLECTED_ORIGIN;
    const point = { x: 550, y: EXPECTED_Y };
    const window = { start: WINDOW_START, end: WINDOW_END };
    
    const windowDx = window.end.x - window.start.x;
    const windowDy = window.end.y - window.start.y;
    
    const pointRelX = point.x - window.start.x;
    const pointRelY = point.y - window.start.y;
    const pointCross = windowDx * pointRelY - windowDy * pointRelX;
    
    console.log("Window dx:", windowDx);
    console.log("Window dy:", windowDy);
    console.log("Point rel:", { x: pointRelX, y: pointRelY });
    console.log("Point cross:", pointCross);
    console.log("Point is ON window line:", pointCross === 0);
    
    // Point ON the window line should have pointCross === 0
    // And isPointPastWindow should return true
    expect(pointCross).toBe(0);
  });

  it("should NOT recompute ArcIntersectionPoints for excluded window with many obstacles", () => {
    console.log("\n=== FULL USER SCENARIO (Provenance) ===");
    
    // Create all surfaces from user's scenario
    const surfaces: Surface[] = [
      createMockSurface("room-0", { x: 20, y: 80 }, { x: 1260, y: 80 }),
      createMockSurface("room-1", { x: 1260, y: 80 }, { x: 1260, y: 700 }, false),
      createMockSurface("room-2", { x: 1260, y: 700 }, { x: 20, y: 700 }, false),
      createMockSurface("room-3", { x: 20, y: 700 }, { x: 20, y: 80 }),
      createMockSurface("platform-0", { x: 50, y: 620 }, { x: 200, y: 620 }, false),
      createMockSurface("mirror-left-0", { x: 250, y: 550 }, { x: 250, y: 150 }),
      createMockSurface("mirror-right-0", { x: 550, y: 150 }, { x: 550, y: 550 }),
      // Add some pyramid surfaces
      createMockSurface("pyramid-1-0", { x: 1030, y: 500 }, { x: 1070, y: 500 }),
      createMockSurface("pyramid-2-0", { x: 1015, y: 460 }, { x: 1085, y: 460 }),
      // Add chain surfaces that are between origin and window
      createMockSurface("chain1-0", { x: 598, y: 280 }, { x: 650, y: 250 }),
      createMockSurface("chain1-1", { x: 650, y: 250 }, { x: 702, y: 280 }),
    ];
    
    // Create chains from surfaces
    const chains: SurfaceChain[] = surfaces.map(s => createSingleSurfaceChain(s));
    const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
    chains.push(screenChain);
    
    const rangeLimitPair = createRangeLimitPair(RANGE_LIMIT_RADIUS, "horizontal");
    
    // IMPORTANT: Stage 2 uses the REFLECTED origin as center, not the player
    // The reflected origin (930, 586) is passed as center in ValidRegionRenderer
    const rangeLimit: RangeLimitConfig = {
      pair: rangeLimitPair,
      center: REFLECTED_ORIGIN, // This is what Stage 2 actually uses
    };
    
    const cone = createConeThroughWindow(REFLECTED_ORIGIN, WINDOW_START, WINDOW_END);
    
    // Project WITH the window surface excluded
    // With provenance propagation, ArcIntersectionPoints on excluded surfaces
    // should NOT be recomputed - they come from the caller
    const sourcePoints = projectConeV2(
      cone, 
      chains, 
      "mirror-right-0",  // EXCLUDE the window
      undefined, 
      undefined, 
      rangeLimit
    );
    
    console.log("Total vertices:", sourcePoints.length);
    
    for (const sp of sourcePoints) {
      const xy = sp.computeXY();
      let type = "unknown";
      let extra = "";
      
      if (isOriginPoint(sp)) type = "origin";
      else if (isArcHitPoint(sp)) type = "arc_hit";
      else if (isArcIntersectionPoint(sp)) {
        type = "arc_intersection";
        extra = ` surface=${sp.surface?.id} type=${sp.intersectionType}`;
      }
      else if (isArcJunctionPoint(sp)) type = "arc_junction";
      else if (isJunctionPoint(sp)) type = "junction";
      else if (isHitPoint(sp)) {
        type = "hit_point";
        extra = ` surface=${sp.hitSurface?.id}`;
      }
      else if (isEndpoint(sp)) {
        type = "endpoint";
        extra = ` surface=${sp.surface?.id}`;
      }
      
      console.log(`  ${type}: (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)})${extra}`);
    }
    
    // Check for ArcIntersectionPoints on the window
    const windowArcIntersections = sourcePoints.filter(
      sp => isArcIntersectionPoint(sp) && sp.surface?.id === "mirror-right-0"
    );
    
    console.log("\nWindow ArcIntersectionPoints:", windowArcIntersections.length);
    
    // Other non-excluded surfaces can still have ArcIntersectionPoints
    const allArcIntersections = sourcePoints.filter(isArcIntersectionPoint);
    console.log("All ArcIntersectionPoints:", allArcIntersections.length);
    for (const ai of allArcIntersections) {
      const xy = ai.computeXY();
      console.log(`  on ${ai.surface?.id} at (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)})`);
    }
    
    // The excluded window should NOT have ArcIntersectionPoints recomputed
    // They should come from provenance propagation
    expect(windowArcIntersections.length).toBe(0);
    console.log("Verified: Excluded window doesn't get ArcIntersectionPoints recomputed");
  });
});
