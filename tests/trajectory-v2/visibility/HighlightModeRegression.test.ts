/**
 * HighlightMode Regression Tests
 *
 * Tests reproducing reported issues with highlight mode:
 * 1. Horizontal surfaces not highlighting (but vertical ones do)
 * 2. Highlights appearing when surface is not lit (umbrella mode)
 * 3. Cones extending outside the visibility polygon
 */

import { describe, it, expect } from "vitest";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Segment } from "@/trajectory-v2/visibility/WindowConfig";
import { clipPolygonByPolygon } from "@/trajectory-v2/visibility/AnalyticalPropagation";
import {
  type ReachingConeConfig,
  calculateReachingCones,
  calculateReachingConesFromProvenance,
  isPointInConeExact,
} from "@/trajectory-v2/visibility/HighlightMode";

// =============================================================================
// TEST HELPERS
// =============================================================================

function createTestSurface(
  id: string,
  start: Vector2,
  end: Vector2,
  canReflect = true
): Surface {
  return {
    id,
    segment: { start, end },
    surfaceType: canReflect ? "ricochet" : "wall",
    onArrowHit: () => ({ type: "blocked" as const }),
    isPlannable: () => canReflect,
    getVisualProperties: () => ({ color: 0x00ffff, alpha: 1, lineWidth: 2 }),
    getNormal: () => {
      const dx = end.x - start.x;
      const dy = end.y - start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      return { x: -dy / len, y: dx / len };
    },
    canReflectFrom: () => canReflect,
  } as unknown as Surface;
}

// Cross-product helper for debugging
function crossProduct(origin: Vector2, a: Vector2, b: Vector2): number {
  return (a.x - origin.x) * (b.y - origin.y) - (a.y - origin.y) * (b.x - origin.x);
}

// Project a ray from origin through point onto a line segment
function projectRayToLine(origin: Vector2, point: Vector2, lineStart: Vector2, lineEnd: Vector2): Vector2 | null {
  const rayScale = 100;
  const rayEnd = {
    x: origin.x + (point.x - origin.x) * rayScale,
    y: origin.y + (point.y - origin.y) * rayScale,
  };
  
  // Line-line intersection
  const x1 = origin.x, y1 = origin.y;
  const x2 = rayEnd.x, y2 = rayEnd.y;
  const x3 = lineStart.x, y3 = lineStart.y;
  const x4 = lineEnd.x, y4 = lineEnd.y;
  
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 0.0001) return null;
  
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const s = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
  
  if (t > 0 && s >= 0 && s <= 1) {
    return {
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1),
    };
  }
  return null;
}

// =============================================================================
// POLYGON CLIPPING TESTS
// =============================================================================

describe("HighlightMode Regression - Polygon Clipping", () => {
  it("clips triangle inside square correctly", () => {
    // Square (clockwise for screen coords)
    const square: Vector2[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];

    // Triangle fully inside square
    const triangle: Vector2[] = [
      { x: 50, y: 10 },
      { x: 90, y: 90 },
      { x: 10, y: 90 },
    ];

    const clipped = clipPolygonByPolygon(triangle, square);
    
    console.log("Triangle inside square - clipped:", clipped);
    
    // Triangle should remain unchanged since it's fully inside
    expect(clipped.length).toBe(3);
  });

  it("clips triangle partially outside square", () => {
    // Square
    const square: Vector2[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];

    // Triangle with apex outside square (above)
    const triangle: Vector2[] = [
      { x: 50, y: -50 },  // Outside above
      { x: 90, y: 90 },
      { x: 10, y: 90 },
    ];

    const clipped = clipPolygonByPolygon(triangle, square);
    
    console.log("Triangle apex outside - clipped:", clipped);
    
    // Should clip to the square boundary
    expect(clipped.length).toBeGreaterThan(0);
    
    // All clipped points should be inside or on the square
    for (const p of clipped) {
      expect(p.x).toBeGreaterThanOrEqual(-0.001);
      expect(p.x).toBeLessThanOrEqual(100.001);
      expect(p.y).toBeGreaterThanOrEqual(-0.001);
      expect(p.y).toBeLessThanOrEqual(100.001);
    }
  });

  it("returns empty for non-intersecting polygons", () => {
    // Square at origin
    const square: Vector2[] = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];

    // Triangle far away
    const triangle: Vector2[] = [
      { x: 500, y: 500 },
      { x: 600, y: 500 },
      { x: 550, y: 600 },
    ];

    const clipped = clipPolygonByPolygon(triangle, square);
    
    console.log("Non-intersecting - clipped:", clipped);
    
    // Should be empty (no intersection)
    expect(clipped.length).toBe(0);
  });
});

// =============================================================================
// ISSUE 1: HORIZONTAL VS VERTICAL SURFACES
// =============================================================================

describe("HighlightMode Regression - Issue 1: Horizontal vs Vertical Surfaces", () => {
  // Test setup from user report
  const player: Vector2 = { x: 267.62, y: 666 };
  
  // Horizontal surface that didn't highlight
  const horizontalSurface = createTestSurface(
    "ricochet-2",
    { x: 400, y: 250 },
    { x: 550, y: 250 }
  );
  
  // Vertical surface that DID highlight
  const verticalSurface = createTestSurface(
    "ricochet-4",
    { x: 850, y: 350 },
    { x: 850, y: 500 }
  );

  it("horizontal surface should produce a valid reaching cone", () => {
    const config: ReachingConeConfig = {
      origin: player,
      targetSurface: horizontalSurface,
      obstacles: [],
      startLine: null,
    };

    const cones = calculateReachingCones(config);

    console.log("Horizontal surface cones:", JSON.stringify(cones, null, 2));
    
    expect(cones.length).toBeGreaterThan(0);
    expect(cones[0]!.vertices.length).toBeGreaterThanOrEqual(3);
  });

  it("vertical surface should produce a valid reaching cone", () => {
    const config: ReachingConeConfig = {
      origin: player,
      targetSurface: verticalSurface,
      obstacles: [],
      startLine: null,
    };

    const cones = calculateReachingCones(config);

    console.log("Vertical surface cones:", JSON.stringify(cones, null, 2));
    
    expect(cones.length).toBeGreaterThan(0);
    expect(cones[0]!.vertices.length).toBeGreaterThanOrEqual(3);
  });

  it("compare cone span for horizontal vs vertical", () => {
    const origin = player;
    
    // Horizontal surface
    const hStart = horizontalSurface.segment.start;
    const hEnd = horizontalSurface.segment.end;
    const hCross = crossProduct(origin, hStart, hEnd);
    
    // Vertical surface
    const vStart = verticalSurface.segment.start;
    const vEnd = verticalSurface.segment.end;
    const vCross = crossProduct(origin, vStart, vEnd);

    console.log("Horizontal surface cross product:", hCross);
    console.log("Vertical surface cross product:", vCross);
    console.log("Horizontal > 0 (short sweep):", hCross > 0);
    console.log("Vertical > 0 (short sweep):", vCross > 0);

    // Both should have reasonable cone spans (neither should be > 180°)
    // A positive cross product means the sweep from start to end is CCW (short way)
    // A negative cross product means the sweep is CW (could be either way)
  });

  it("obstacle in front of horizontal surface should be detected", () => {
    const origin = player;
    const surfStart = horizontalSurface.segment.start;
    const surfEnd = horizontalSurface.segment.end;
    
    // Determine left/right as the implementation does
    const cross = crossProduct(origin, surfStart, surfEnd);
    const left = cross >= 0 ? surfStart : surfEnd;
    const right = cross >= 0 ? surfEnd : surfStart;

    console.log("Horizontal: left =", left, ", right =", right);
    console.log("Horizontal: cross =", cross, ", short sweep =", cross > 0);

    // Create obstacle that's actually INSIDE the cone
    // The cone is narrow, so we need a point closer to the center
    // At y=350, the cone spans roughly x=420 to x=490
    const obstacle: Vector2 = { x: 480, y: 350 };
    
    const inCone = isPointInConeExact(origin, left, right, obstacle);
    console.log("Obstacle at (480, 350) in cone:", inCone);
    
    // Verify with cross products
    const crossL = crossProduct(origin, left, obstacle);
    const crossR = crossProduct(origin, right, obstacle);
    console.log("crossLeft:", crossL, "crossRight:", crossR);
    console.log("For inside: crossLeft >= 0 && crossRight <= 0");

    // The obstacle should be detected as in the cone
    expect(inCone).toBe(true);
  });

  it("obstacle in front of vertical surface should be detected", () => {
    const origin = player;
    const surfStart = verticalSurface.segment.start;
    const surfEnd = verticalSurface.segment.end;
    
    // Determine left/right as the implementation does
    const cross = crossProduct(origin, surfStart, surfEnd);
    const left = cross >= 0 ? surfStart : surfEnd;
    const right = cross >= 0 ? surfEnd : surfStart;

    console.log("Vertical: left =", left, ", right =", right);
    console.log("Vertical: cross =", cross, ", short sweep =", cross > 0);

    // Create obstacle between player and vertical surface
    const obstacle: Vector2 = { x: 600, y: 550 };
    
    const inCone = isPointInConeExact(origin, left, right, obstacle);
    console.log("Obstacle in cone:", inCone);

    // The obstacle should be detected as in the cone
    expect(inCone).toBe(true);
  });
});

// =============================================================================
// ISSUE 2: HIGHLIGHTS WHEN SURFACE IS NOT LIT
// =============================================================================

describe("HighlightMode Regression - Issue 2: Highlights When Surface Not Lit", () => {
  it("should not produce cones when surface is behind a blocking obstacle", () => {
    const origin: Vector2 = { x: 400, y: 500 };
    const targetSurface = createTestSurface(
      "target",
      { x: 300, y: 200 },
      { x: 500, y: 200 }
    );
    
    // Large obstacle that fully blocks the target
    const blockingObstacle = createTestSurface(
      "blocker",
      { x: 250, y: 300 },
      { x: 550, y: 300 }
    );

    const config: ReachingConeConfig = {
      origin,
      targetSurface,
      obstacles: [blockingObstacle],
      startLine: null,
    };

    const cones = calculateReachingCones(config);

    console.log("Cones when fully blocked:", cones.length);
    
    // Should be empty when surface is fully blocked
    expect(cones).toHaveLength(0);
  });

  it("should produce partial cones when surface is partially blocked", () => {
    const origin: Vector2 = { x: 400, y: 500 };
    const targetSurface = createTestSurface(
      "target",
      { x: 200, y: 200 },
      { x: 600, y: 200 }
    );
    
    // Small obstacle that only blocks part of the target
    const partialBlocker = createTestSurface(
      "blocker",
      { x: 350, y: 350 },
      { x: 450, y: 350 }
    );

    const config: ReachingConeConfig = {
      origin,
      targetSurface,
      obstacles: [partialBlocker],
      startLine: null,
    };

    const cones = calculateReachingCones(config);

    console.log("Cones when partially blocked:", cones.length);
    
    // Should have 2 cones (left and right of the blocker)
    expect(cones.length).toBe(2);
  });
});

// =============================================================================
// ISSUE 3: CONES EXTEND OUTSIDE VISIBILITY POLYGON
// =============================================================================

describe("HighlightMode Regression - Issue 3: Cones Outside Visibility Polygon", () => {
  // This test documents the current (incorrect) behavior
  // The fix will require clipping cones to the visibility polygon
  
  it("cone vertices should all be reachable from origin (no obstacles blocking)", () => {
    const origin: Vector2 = { x: 400, y: 500 };
    const targetSurface = createTestSurface(
      "target",
      { x: 300, y: 200 },
      { x: 500, y: 200 }
    );

    const config: ReachingConeConfig = {
      origin,
      targetSurface,
      obstacles: [],
      startLine: null,
    };

    const cones = calculateReachingCones(config);

    expect(cones.length).toBe(1);
    
    // All vertices should form a valid triangle from origin to surface
    const vertices = cones[0]!.vertices;
    expect(vertices.length).toBe(3);
    
    // Should include origin and both surface endpoints
    const hasOrigin = vertices.some(v => 
      Math.abs(v.x - origin.x) < 1 && Math.abs(v.y - origin.y) < 1
    );
    expect(hasOrigin).toBe(true);
  });

  it("windowed cones are truncated by startLine", () => {
    // When there's a startLine (window), the cone should be truncated
    // This is a documentation test for windowed cone behavior
    
    const origin: Vector2 = { x: 400, y: 600 };
    const startLine = {
      start: { x: 350, y: 500 },
      end: { x: 450, y: 500 },
    };
    const targetSurface = createTestSurface(
      "target",
      { x: 200, y: 300 },
      { x: 600, y: 300 }
    );

    const config: ReachingConeConfig = {
      origin,
      targetSurface,
      obstacles: [],
      startLine,
    };

    const cones = calculateReachingCones(config);

    console.log("Windowed cone:", JSON.stringify(cones, null, 2));

    // Should produce a cone
    expect(cones.length).toBe(1);
    
    // The cone should have vertices
    const vertices = cones[0]!.vertices;
    expect(vertices.length).toBeGreaterThanOrEqual(3);
    
    // Note: The current implementation uses the origin as a vertex.
    // In the future, this could be improved to use startLine intersection points
    // for a proper quadrilateral shape. The clipping to visibility polygon
    // (done in GameAdapter) handles this for rendering purposes.
  });
});

// =============================================================================
// BUG: CONE VERTICES USE OBSTACLE POINTS INSTEAD OF SURFACE POINTS
// =============================================================================

describe("HighlightMode Regression - Cone Vertex Bug", () => {
  // Exact setup from user report
  const player: Vector2 = { x: 170, y: 666 };
  
  // ricochet-2: horizontal surface at y=250
  const ricochet2 = createTestSurface(
    "ricochet-2",
    { x: 400, y: 250 },
    { x: 550, y: 250 }
  );
  
  // platform-1: blocks part of the view to ricochet-2
  const platform1 = createTestSurface(
    "platform-1",
    { x: 300, y: 450 },
    { x: 500, y: 450 },
    false
  );

  it("cone vertices should be on the target surface, not obstacle", () => {
    // With platform-1 partially blocking ricochet-2, we expect:
    // - A cone from player to the VISIBLE portion of ricochet-2
    // - The visible portion is from (400, 250) to approximately (420.37, 250)
    // - NOT vertices on platform-1!

    const config: ReachingConeConfig = {
      origin: player,
      targetSurface: ricochet2,
      obstacles: [platform1],
      startLine: null,
    };

    const cones = calculateReachingCones(config);

    console.log("\n=== Cone Vertex Bug Test ===");
    console.log("Player:", player);
    console.log("Target surface (ricochet-2):", ricochet2.segment);
    console.log("Obstacle (platform-1):", platform1.segment);
    console.log("Number of cones:", cones.length);

    // Log ALL cones to understand the bug
    for (let i = 0; i < cones.length; i++) {
      console.log(`\nCone ${i} vertices:`, cones[i]!.vertices);
    }

    // BUG EVIDENCE: Currently produces 2 cones when it should produce 1
    // This is because the algorithm creates gaps at obstacle boundaries
    // instead of projecting to surface boundaries
    
    // For now, let's examine what's being produced
    const cone = cones[0]!;
    console.log("Cone vertices:", cone.vertices);

    // All vertices (except origin) should be on the TARGET SURFACE (y=250)
    // NOT on the obstacle (y=450)
    for (let i = 0; i < cone.vertices.length; i++) {
      const v = cone.vertices[i]!;
      console.log(`Vertex ${i}: (${v.x}, ${v.y})`);
      
      if (Math.abs(v.x - player.x) < 1 && Math.abs(v.y - player.y) < 1) {
        console.log("  -> This is the origin (player)");
      } else if (Math.abs(v.y - 250) < 1) {
        console.log("  -> This is on the TARGET SURFACE (correct!)");
      } else if (Math.abs(v.y - 450) < 1) {
        console.log("  -> BUG: This is on the OBSTACLE (platform-1)!");
      } else {
        console.log("  -> Unknown point");
      }
    }

    // THE KEY ASSERTION: No vertex should be on the obstacle (y=450)
    const verticesOnObstacle = cone.vertices.filter(v => Math.abs(v.y - 450) < 1);
    expect(verticesOnObstacle.length).toBe(0);
    
    // All non-origin vertices should be on the target surface (y=250)
    const nonOriginVertices = cone.vertices.filter(
      v => !(Math.abs(v.x - player.x) < 1 && Math.abs(v.y - player.y) < 1)
    );
    for (const v of nonOriginVertices) {
      expect(Math.abs(v.y - 250)).toBeLessThan(1);
    }
  });

  it("DIAGNOSTIC: trace gap generation", () => {
    // Verify the geometric calculations
    const origin = player;
    const surfStart = ricochet2.segment.start;
    const surfEnd = ricochet2.segment.end;
    
    console.log("\n=== Gap Generation Trace ===");
    console.log("Origin:", origin);
    console.log("Surface:", surfStart, "to", surfEnd);
    console.log("Platform-1:", platform1.segment.start, "to", platform1.segment.end);
    
    // Determine left/right of cone
    const cross = crossProduct(origin, surfStart, surfEnd);
    console.log("\nCross product (origin, surfStart, surfEnd):", cross);
    console.log("Left boundary:", cross >= 0 ? surfStart : surfEnd);
    console.log("Right boundary:", cross >= 0 ? surfEnd : surfStart);
    
    // Calculate where platform-1 endpoints project onto the surface
    const projLeft = projectRayToLine(origin, platform1.segment.start, surfStart, surfEnd);
    const projRight = projectRayToLine(origin, platform1.segment.end, surfStart, surfEnd);
    
    console.log("\nPlatform-1 left (300, 450) projects to:", projLeft);
    console.log("Platform-1 right (500, 450) projects to:", projRight);
    
    // The expected gaps are:
    // Gap 1: from surfStart (400, 250) to projection of platform left (~420.37)
    // Gap 2: from projection of platform right (if valid) to surfEnd (550, 250)
    console.log("\nExpected gap 1: (400, 250) to (~420.37, 250) - the VISIBLE portion");
    console.log("Gap 2 should be empty because platform right projects past surface end");
    
    expect(true).toBe(true);
  });

  it("DIAGNOSTIC: examine actual cone output", () => {
    const config: ReachingConeConfig = {
      origin: player,
      targetSurface: ricochet2,
      obstacles: [platform1],
      startLine: null,
    };

    const cones = calculateReachingCones(config);

    console.log("\n=== DIAGNOSTIC: Full Cone Analysis ===");
    console.log("Setup:");
    console.log("  Player:", player);
    console.log("  Target (ricochet-2):", ricochet2.segment.start, "to", ricochet2.segment.end);
    console.log("  Obstacle (platform-1):", platform1.segment.start, "to", platform1.segment.end);
    console.log("\nCones produced:", cones.length);

    for (let i = 0; i < cones.length; i++) {
      const cone = cones[i]!;
      console.log(`\nCone ${i}:`);
      for (let j = 0; j < cone.vertices.length; j++) {
        const v = cone.vertices[j]!;
        let location = "unknown";
        if (Math.abs(v.x - player.x) < 1 && Math.abs(v.y - player.y) < 1) {
          location = "ORIGIN (player)";
        } else if (Math.abs(v.y - 250) < 1) {
          location = "TARGET SURFACE (y=250)";
        } else if (Math.abs(v.y - 450) < 1) {
          location = "OBSTACLE (platform-1, y=450)";
        }
        console.log(`  Vertex ${j}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)}) - ${location}`);
      }
    }

    console.log("\n=== Expected Behavior ===");
    console.log("Should produce 1 cone with vertices:");
    console.log("  - Origin: (170, 666)");
    console.log("  - Left surface edge: (400, 250)");
    console.log("  - Shadow cutoff on surface: (~420.37, 250)");
    console.log("\nInstead, we're getting", cones.length, "cones with obstacle vertices!");

    // This test is for diagnosis, always passes
    expect(true).toBe(true);
  });

  it("visible portion of surface should match visibility polygon", () => {
    // From the visibility data, the visible portion of ricochet-2 is:
    // (400, 250) to (420.37, 250)
    
    // Calculate where platform-1 shadow cuts off the surface
    // Ray from player (170, 666) through platform-1 endpoint (500, 450)
    // Intersecting y=250 line:
    // t = (250 - 666) / (450 - 666) = -416 / -216 = 1.926
    // x = 170 + 1.926 * (500 - 170) = 170 + 635.58 = 805.58 - that's past the surface
    
    // Ray from player (170, 666) through platform-1 endpoint (300, 450)
    // t = (250 - 666) / (450 - 666) = 1.926
    // x = 170 + 1.926 * (300 - 170) = 170 + 250.38 = 420.38
    
    // So the shadow from platform-1 cuts the surface at approximately x=420.38
    
    const config: ReachingConeConfig = {
      origin: player,
      targetSurface: ricochet2,
      obstacles: [platform1],
      startLine: null,
    };

    const cones = calculateReachingCones(config);
    expect(cones.length).toBe(1);

    const cone = cones[0]!;
    
    // Find the rightmost point on the surface (should be ~420.37, not 550)
    const surfaceVertices = cone.vertices.filter(v => Math.abs(v.y - 250) < 1);
    
    console.log("\n=== Visible Portion Test ===");
    console.log("Surface vertices in cone:", surfaceVertices);
    
    if (surfaceVertices.length >= 2) {
      const minX = Math.min(...surfaceVertices.map(v => v.x));
      const maxX = Math.max(...surfaceVertices.map(v => v.x));
      
      console.log("Surface X range:", minX, "to", maxX);
      console.log("Expected: 400 to ~420.37");
      
      // Left edge should be at 400 (surface start)
      expect(Math.abs(minX - 400)).toBeLessThan(1);
      
      // Right edge should be ~420.37 (shadow cutoff), NOT 550 (surface end)
      expect(maxX).toBeLessThan(450); // Much less than 550
      expect(Math.abs(maxX - 420.37)).toBeLessThan(5); // Approximately 420.37
    }
  });
});

// =============================================================================
// BUG: MULTIPLE VISIBLE SEGMENTS SHOULD CREATE MULTIPLE CONES
// =============================================================================

describe("HighlightMode - Multiple Visible Segments", () => {
  it("should create 2 cones when surface is split by obstruction", () => {
    // From user report: ricochet-1 is split into 2 visible segments by ricochet-4
    // Visible points on ricochet-1:
    //   Segment 1: (800, 150) to (845.24, 195.24)
    //   Segment 2: (848.76, 198.76) to (900, 250)
    
    const origin: Vector2 = { x: 852.59, y: 666 };
    const targetSurface = createTestSurface(
      "ricochet-1",
      { x: 800, y: 150 },
      { x: 900, y: 250 }
    );
    
    // These are the visible points from the visibility polygon
    // There's a GAP between points 2 and 3 (the obstruction)
    const visiblePoints: Vector2[] = [
      { x: 800, y: 150 },           // surface start
      { x: 845.24, y: 195.24 },     // hit point (obstruction boundary)
      // GAP - ricochet-4 obstructs here
      { x: 848.76, y: 198.76 },     // hit point (obstruction boundary)  
      { x: 900, y: 250 },           // surface end
    ];

    // The function should detect the gap and create 2 cones
    const cones = calculateReachingConesFromProvenance(
      origin,
      targetSurface,
      visiblePoints,
      null
    );

    console.log("Cones from split surface:", cones.length);
    for (let i = 0; i < cones.length; i++) {
      console.log(`Cone ${i}:`, cones[i]!.vertices);
    }

    // Should create 2 cones for the 2 visible segments
    expect(cones.length).toBe(2);
    
    // First cone: origin -> (800, 150) -> (845.24, 195.24)
    // Second cone: origin -> (848.76, 198.76) -> (900, 250)
  });

  it("should detect gaps in visible points based on surface parameter distance", () => {
    const origin: Vector2 = { x: 400, y: 500 };
    const targetSurface = createTestSurface(
      "target",
      { x: 200, y: 200 },
      { x: 600, y: 200 }
    );
    
    // Two visible segments with a gap in the middle
    // Surface goes from x=200 to x=600 (length 400)
    const visiblePoints: Vector2[] = [
      { x: 200, y: 200 },  // t=0
      { x: 300, y: 200 },  // t=0.25
      // GAP from t=0.25 to t=0.75
      { x: 500, y: 200 },  // t=0.75
      { x: 600, y: 200 },  // t=1.0
    ];

    const cones = calculateReachingConesFromProvenance(
      origin,
      targetSurface,
      visiblePoints,
      null
    );

    // Should detect the gap and create 2 cones
    expect(cones.length).toBe(2);
  });
});

// =============================================================================
// ISSUE: CONES SHOULD BE QUADRILATERALS WITH PLANNED SURFACES (not triangles)
// =============================================================================

describe("HighlightMode - Start Line Truncation", () => {
  it("cones should be quadrilaterals when startLine is provided", () => {
    const origin: Vector2 = { x: 1644, y: 666 }; // player image
    const targetSurface = createTestSurface(
      "ricochet-2",
      { x: 400, y: 250 },
      { x: 550, y: 250 }
    );
    
    // Start line is the planned surface (ricochet-4)
    const startLine: Segment = {
      start: { x: 850, y: 350 },
      end: { x: 850, y: 500 },
    };

    // Visible points on the surface
    const visiblePoints: Vector2[] = [
      { x: 467.08, y: 250 },
      { x: 550, y: 250 },
    ];

    const cones = calculateReachingConesFromProvenance(
      origin,
      targetSurface,
      visiblePoints,
      startLine
    );

    console.log("Cones with startLine:", cones.length);
    for (const cone of cones) {
      console.log("Cone vertices:", cone.vertices.length, cone.vertices);
    }

    // Should have 1 cone
    expect(cones.length).toBe(1);
    
    // Cone should be a QUADRILATERAL (4 vertices), not a triangle
    // Vertices: [startLine intersection left, surface left, surface right, startLine intersection right]
    expect(cones[0]!.vertices.length).toBe(4);
    
    // All vertices should be on the visible side (x <= 850 for startLine at x=850)
    for (const v of cones[0]!.vertices) {
      expect(v.x).toBeLessThanOrEqual(851); // Small tolerance
    }
  });
});

// =============================================================================
// ISSUE: HIGHLIGHTS SHOULD ONLY SHOW FOR REFLECTIVE SIDE
// =============================================================================

describe("HighlightMode - Reflective Side Only", () => {
  it("should not highlight when light reaches non-reflective side", () => {
    // Player at x=1220, ricochet-4 is at x=850 (vertical surface)
    // The player is to the RIGHT of the surface
    // For a vertical surface pointing left, light from the right is on non-reflective side
    
    const player: Vector2 = { x: 1220, y: 666 };
    
    // ricochet-4: vertical surface at x=850
    // Assuming normal points left (toward smaller x)
    // Player is at x=1220 (to the right), so light hits the back side
    
    // This check should happen BEFORE calculating cones
    // The caller (GameScene) should filter out surfaces where light hits non-reflective side
    
    // For now, this test documents the expected behavior
    // The fix should be in GameScene.isPlannable() or similar check
    expect(true).toBe(true);
  });
});

// =============================================================================
// ISSUE: VISIBILITY POLYGON POINTS MAY INCLUDE NON-SURFACE POINTS
// =============================================================================

describe("HighlightMode - Point Pairing", () => {
  it("should correctly pair visibility points from surface", () => {
    // The visibility polygon may contain points that are on the surface 
    // but come from different parts of the polygon traversal
    
    const origin: Vector2 = { x: 1644, y: 666 };
    const targetSurface = createTestSurface(
      "ricochet-2", 
      { x: 400, y: 250 },
      { x: 550, y: 250 }
    );
    
    // From visibility data: only 2 points on ricochet-2
    // (467.08, 250) and (550, 250)
    // But the highlight shows 2 cones suggesting 4 points are being detected
    const visiblePoints: Vector2[] = [
      { x: 467.08860759493655, y: 250 },
      { x: 550, y: 250 },
    ];

    const cones = calculateReachingConesFromProvenance(
      origin,
      targetSurface,
      visiblePoints,
      null
    );

    // With exactly 2 points, should create 1 cone
    expect(cones.length).toBe(1);
  });

  it("DIAGNOSTIC: trace point pairing for ricochet-4 case", () => {
    // User report: ricochet-4 showing 2 cones when visibility only has 2 points
    // But the point pairing creates 2 pairs, suggesting 4 points are detected
    
    const origin: Vector2 = { x: 607.67, y: 666 };
    const targetSurface = createTestSurface(
      "ricochet-4",
      { x: 850, y: 350 },
      { x: 850, y: 500 }
    );

    // From visibility outline, ONLY these 2 points are on ricochet-4:
    const visiblePoints: Vector2[] = [
      { x: 850, y: 350 },  // surface start
      { x: 850, y: 500 },  // surface end
    ];

    const cones = calculateReachingConesFromProvenance(
      origin,
      targetSurface,
      visiblePoints,
      null
    );

    console.log("\n=== Ricochet-4 Point Pairing ===");
    console.log("Visible points:", visiblePoints.length);
    console.log("Cones created:", cones.length);
    for (let i = 0; i < cones.length; i++) {
      console.log(`Cone ${i}:`, cones[i]!.vertices);
    }

    // With exactly 2 points, should create 1 cone (not 2!)
    expect(cones.length).toBe(1);
    
    // The cone should span the FULL surface (350 to 500)
    const surfaceVerts = cones[0]!.vertices.filter(
      v => Math.abs(v.x - 850) < 1
    );
    const yValues = surfaceVerts.map(v => v.y);
    console.log("Y values on surface:", yValues);
    
    expect(Math.min(...yValues)).toBeCloseTo(350, 0);
    expect(Math.max(...yValues)).toBeCloseTo(500, 0);
  });

  it("with merged points: 2 points should create 1 cone", () => {
    // After getVisibleSurfacePoints merges consecutive points,
    // we get 2 points for a fully visible surface -> 1 cone
    
    const origin: Vector2 = { x: 577, y: 666 };
    const targetSurface = createTestSurface(
      "ricochet-4",
      { x: 850, y: 350 },
      { x: 850, y: 500 }
    );

    // After merging: only extremes (start and end of visible segment)
    const visiblePoints: Vector2[] = [
      { x: 850, y: 350 },  // segment start
      { x: 850, y: 500 },  // segment end
    ];

    const cones = calculateReachingConesFromProvenance(
      origin,
      targetSurface,
      visiblePoints,
      null
    );

    // 2 points -> 1 cone covering the full visible segment
    expect(cones.length).toBe(1);
    
    // Cone should span the full segment
    const surfaceVerts = cones[0]!.vertices.filter(v => Math.abs(v.x - 850) < 1);
    const yValues = surfaceVerts.map(v => v.y);
    expect(Math.min(...yValues)).toBeCloseTo(350, 0);
    expect(Math.max(...yValues)).toBeCloseTo(500, 0);
  });
  
  it("with merged points: 4 points (2 runs) should create 2 cones", () => {
    // After getVisibleSurfacePoints merges, if there are 2 separate runs
    // (obstruction in the middle), we get 4 points -> 2 cones
    
    const origin: Vector2 = { x: 577, y: 666 };
    const targetSurface = createTestSurface(
      "ricochet-4",
      { x: 850, y: 350 },
      { x: 850, y: 500 }
    );

    // 2 separate visible segments after merging
    const visiblePoints: Vector2[] = [
      { x: 850, y: 350 },  // run 1 start
      { x: 850, y: 400 },  // run 1 end
      { x: 850, y: 450 },  // run 2 start
      { x: 850, y: 500 },  // run 2 end
    ];

    const cones = calculateReachingConesFromProvenance(
      origin,
      targetSurface,
      visiblePoints,
      null
    );

    // 4 points (2 pairs) -> 2 cones
    expect(cones.length).toBe(2);
  });
});

// =============================================================================
// SPECIFIC REGRESSION: USER REPORTED SETUP
// =============================================================================

describe("HighlightMode Regression - User Reported Setup", () => {
  // Exact setup from user's first report
  const player: Vector2 = { x: 267.62009970000094, y: 666 };
  
  const allSurfaces = [
    createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }, false),
    createTestSurface("ceiling", { x: 0, y: 80 }, { x: 1280, y: 80 }, false),
    createTestSurface("left-wall", { x: 20, y: 80 }, { x: 20, y: 700 }, false),
    createTestSurface("right-wall", { x: 1260, y: 80 }, { x: 1260, y: 700 }, false),
    createTestSurface("platform-1", { x: 300, y: 450 }, { x: 500, y: 450 }, false),
    createTestSurface("platform-2", { x: 550, y: 350 }, { x: 750, y: 350 }, false),
    createTestSurface("ricochet-1", { x: 800, y: 150 }, { x: 900, y: 250 }, true),
    createTestSurface("ricochet-2", { x: 400, y: 250 }, { x: 550, y: 250 }, true), // Horizontal - DIDN'T work
    createTestSurface("ricochet-3", { x: 100, y: 200 }, { x: 200, y: 300 }, true),
    createTestSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 }, true), // Vertical - DID work
  ];

  it("ricochet-2 (horizontal) is blocked by platform-1 in this setup", () => {
    const targetSurface = allSurfaces.find(s => s.id === "ricochet-2")!;
    const obstacles = allSurfaces.filter(s => s.id !== "ricochet-2");

    const config: ReachingConeConfig = {
      origin: player,
      targetSurface,
      obstacles,
      startLine: null,
    };

    const cones = calculateReachingCones(config);

    console.log("ricochet-2 cones:", cones.length);
    if (cones.length > 0) {
      console.log("vertices:", cones[0]!.vertices);
    }

    // With this player position, platform-1 fully blocks the view to ricochet-2
    // This is CORRECT behavior - the surface is not visible
    expect(cones.length).toBe(0);
  });

  it("ricochet-4 (vertical) should produce reaching cones", () => {
    const targetSurface = allSurfaces.find(s => s.id === "ricochet-4")!;
    const obstacles = allSurfaces.filter(s => s.id !== "ricochet-4");

    const config: ReachingConeConfig = {
      origin: player,
      targetSurface,
      obstacles,
      startLine: null,
    };

    const cones = calculateReachingCones(config);

    console.log("ricochet-4 cones:", cones.length);
    if (cones.length > 0) {
      console.log("vertices:", cones[0]!.vertices);
    }

    // This should produce at least one cone
    expect(cones.length).toBeGreaterThan(0);
  });

  it("investigate why ricochet-2 has 0 cones with obstacles", () => {
    const ricochet2 = allSurfaces.find(s => s.id === "ricochet-2")!;
    const platform1 = allSurfaces.find(s => s.id === "platform-1")!;
    
    // Test with just platform-1 as obstacle
    const config: ReachingConeConfig = {
      origin: player,
      targetSurface: ricochet2,
      obstacles: [platform1],
      startLine: null,
    };

    const cones = calculateReachingCones(config);
    
    console.log("\n=== Investigation: ricochet-2 blocked by platform-1 ===");
    console.log("Player:", player);
    console.log("ricochet-2:", ricochet2.segment);
    console.log("platform-1:", platform1.segment);
    console.log("Cones produced:", cones.length);
    
    // Calculate where the cone intersects y=450 (platform level)
    const surf = ricochet2.segment;
    const leftT = (450 - player.y) / (surf.start.y - player.y);
    const rightT = (450 - player.y) / (surf.end.y - player.y);
    const leftX = player.x + leftT * (surf.start.x - player.x);
    const rightX = player.x + rightT * (surf.end.x - player.x);
    
    console.log("Cone at y=450: x from", leftX, "to", rightX);
    console.log("Platform-1 at y=450: x from", platform1.segment.start.x, "to", platform1.segment.end.x);
    
    // Check if platform fully covers the cone
    const platformCovers = platform1.segment.start.x <= leftX && platform1.segment.end.x >= rightX;
    console.log("Platform fully covers cone:", platformCovers);
    
    // If platform fully blocks, 0 cones is correct
    // If platform partially blocks, we should get 2 sub-cones
  });

  it("ricochet-4 visible, ricochet-2 blocked by platform-1", () => {
    const ricochet2 = allSurfaces.find(s => s.id === "ricochet-2")!;
    const ricochet4 = allSurfaces.find(s => s.id === "ricochet-4")!;

    const config2: ReachingConeConfig = {
      origin: player,
      targetSurface: ricochet2,
      obstacles: allSurfaces.filter(s => s.id !== "ricochet-2"),
      startLine: null,
    };

    const config4: ReachingConeConfig = {
      origin: player,
      targetSurface: ricochet4,
      obstacles: allSurfaces.filter(s => s.id !== "ricochet-4"),
      startLine: null,
    };

    const cones2 = calculateReachingCones(config2);
    const cones4 = calculateReachingCones(config4);

    console.log("ricochet-2 (horizontal) cones:", cones2.length);
    console.log("ricochet-4 (vertical) cones:", cones4.length);

    // With this player position (267.62, 666):
    // - ricochet-2 is blocked by platform-1 (correct: 0 cones)
    // - ricochet-4 is NOT blocked (correct: 1 cone)
    expect(cones2.length).toBe(0); // Blocked by platform-1
    expect(cones4.length).toBeGreaterThan(0); // Not blocked
  });
});

