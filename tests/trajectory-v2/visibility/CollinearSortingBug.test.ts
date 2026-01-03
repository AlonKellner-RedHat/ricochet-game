/**
 * Test to investigate the collinear sorting bug after removing distance tiebreaker.
 * 
 * The issue: Polygon vertices are sorted incorrectly, causing self-intersecting edges.
 */
import { describe, it, expect } from "vitest";
import { RicochetSurface } from "@/surfaces/RicochetSurface";
import {
  projectConeV2,
  createConeThroughWindow,
  toVector2Array,
  PreComputedPairs,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import {
  createRicochetChain,
  type SurfaceChain,
} from "@/trajectory-v2/geometry/SurfaceChain";
import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";
import { Endpoint, HitPoint, OriginPoint, isEndpoint, isHitPoint, isOriginPoint } from "@/trajectory-v2/geometry/SourcePoint";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

// Helper to check if two edges intersect (excluding shared endpoints)
function edgesIntersect(a1: Vector2, a2: Vector2, b1: Vector2, b2: Vector2): boolean {
  const cross = (o: Vector2, a: Vector2, b: Vector2) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const d1 = cross(b1, b2, a1);
  const d2 = cross(b1, b2, a2);
  const d3 = cross(a1, a2, b1);
  const d4 = cross(a1, a2, b2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  return false;
}

describe("Collinear Sorting Bug Investigation", () => {
  // Screen bounds
  const SCREEN_BOUNDS = { minX: 0, minY: 0, maxX: 1280, maxY: 720 };

  // Simple horizontal surface at center of screen
  const HORIZONTAL_SURFACE = createRicochetChain("h1", [
    { x: 540, y: 300 },
    { x: 740, y: 300 },
  ]);

  it("should investigate reflected cone sorting with player=(581,81)", () => {
    const player = { x: 581, y: 81 };
    const chains = [HORIZONTAL_SURFACE];
    const surface = HORIZONTAL_SURFACE.getSurfaces()[0]!;

    // Calculate reflected origin through the horizontal surface
    const reflectedOrigin = reflectPointThroughLine(
      player,
      surface.segment.start,
      surface.segment.end
    );

    console.log("=== SCENARIO ===");
    console.log(`Player: (${player.x}, ${player.y})`);
    console.log(`Reflected origin: (${reflectedOrigin.x.toFixed(2)}, ${reflectedOrigin.y.toFixed(2)})`);
    console.log(`Surface: (${surface.segment.start.x}, ${surface.segment.start.y}) → (${surface.segment.end.x}, ${surface.segment.end.y})`);

    // Create windowed cone through surface
    const window = { start: surface.segment.start, end: surface.segment.end };
    const cone = createConeThroughWindow(reflectedOrigin, window.start, window.end);

    // Get polygon vertices
    const sourcePoints = projectConeV2(cone, chains, SCREEN_BOUNDS, surface.id);
    const vertices = toVector2Array(sourcePoints);

    console.log("\n=== POLYGON VERTICES ===");
    vertices.forEach((v, i) => {
      console.log(`  ${i}: (${v.x.toFixed(2)}, ${v.y.toFixed(2)})`);
    });

    // Check for self-intersections
    const intersections: string[] = [];
    for (let i = 0; i < vertices.length; i++) {
      const a1 = vertices[i]!;
      const a2 = vertices[(i + 1) % vertices.length]!;

      for (let j = i + 2; j < vertices.length; j++) {
        // Skip adjacent edges
        if ((j + 1) % vertices.length === i) continue;

        const b1 = vertices[j]!;
        const b2 = vertices[(j + 1) % vertices.length]!;

        if (edgesIntersect(a1, a2, b1, b2)) {
          intersections.push(
            `Edge ${i}→${(i + 1) % vertices.length} crosses Edge ${j}→${(j + 1) % vertices.length}`
          );
        }
      }
    }

    if (intersections.length > 0) {
      console.log("\n=== SELF-INTERSECTIONS ===");
      intersections.forEach((s) => console.log(`  ${s}`));
    }

    // Analyze the sorting - compute cross products from origin
    console.log("\n=== CROSS PRODUCT ANALYSIS ===");
    console.log(`Origin: (${reflectedOrigin.x.toFixed(2)}, ${reflectedOrigin.y.toFixed(2)})`);
    
    for (let i = 0; i < vertices.length; i++) {
      const current = vertices[i]!;
      const next = vertices[(i + 1) % vertices.length]!;
      
      // Vectors from origin
      const vCurrent = { x: current.x - reflectedOrigin.x, y: current.y - reflectedOrigin.y };
      const vNext = { x: next.x - reflectedOrigin.x, y: next.y - reflectedOrigin.y };
      
      // Cross product between consecutive vertices
      const cross = vCurrent.x * vNext.y - vCurrent.y * vNext.x;
      
      console.log(`  ${i}→${(i + 1) % vertices.length}: cross=${cross.toFixed(2)} (${cross > 0 ? "CCW" : cross < 0 ? "CW" : "COLLINEAR"})`);
    }

    // Analyze the source points to understand their types
    console.log("\n=== SOURCE POINT TYPES ===");
    sourcePoints.forEach((p, i) => {
      const xy = p.computeXY();
      const type = isEndpoint(p) ? "Endpoint" : isHitPoint(p) ? "HitPoint" : isOriginPoint(p) ? "OriginPoint" : "Unknown";
      console.log(`  ${i}: ${type} at (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)}) key=${p.getKey()}`);
    });

    // Simulate the sorting comparisons to understand what's happening
    console.log("\n=== SORTING SIMULATION ===");
    
    // Calculate reference direction (same as in sortPolygonVerticesSourcePoint)
    const startLine = { start: surface.segment.start, end: surface.segment.end };
    const startDir = { x: startLine.start.x - reflectedOrigin.x, y: startLine.start.y - reflectedOrigin.y };
    const endDir = { x: startLine.end.x - reflectedOrigin.x, y: startLine.end.y - reflectedOrigin.y };
    const boundaryCross = startDir.x * endDir.y - startDir.y * endDir.x;
    const rightBoundary = boundaryCross >= 0 ? startLine.end : startLine.start;
    const refDirection = { x: rightBoundary.x - reflectedOrigin.x, y: rightBoundary.y - reflectedOrigin.y };
    
    console.log(`Reference direction: (${refDirection.x.toFixed(2)}, ${refDirection.y.toFixed(2)})`);
    console.log(`Boundary cross: ${boundaryCross.toFixed(2)} -> right boundary is ${boundaryCross >= 0 ? "end" : "start"}`);
    
    // Calculate aRef for each point
    console.log("\n=== aRef VALUES (cross with reference) ===");
    for (let i = 0; i < sourcePoints.length; i++) {
      const p = sourcePoints[i]!;
      const xy = p.computeXY();
      const vec = { x: xy.x - reflectedOrigin.x, y: xy.y - reflectedOrigin.y };
      const aRef = refDirection.x * vec.y - refDirection.y * vec.x;
      console.log(`  ${i}: aRef=${aRef.toFixed(2)} (${aRef > 0 ? "left of ref" : aRef < 0 ? "right of ref" : "ON ref"})`);
    }

    // Compare all pairs and show what the sort comparison would return
    console.log("\n=== PAIRWISE COMPARISONS (cross product only, ignoring PreComputedPairs) ===");
    for (let i = 0; i < sourcePoints.length; i++) {
      for (let j = i + 1; j < sourcePoints.length; j++) {
        const a = sourcePoints[i]!;
        const b = sourcePoints[j]!;
        const aXY = a.computeXY();
        const bXY = b.computeXY();
        const aVec = { x: aXY.x - reflectedOrigin.x, y: aXY.y - reflectedOrigin.y };
        const bVec = { x: bXY.x - reflectedOrigin.x, y: bXY.y - reflectedOrigin.y };
        const cross = aVec.x * bVec.y - aVec.y * bVec.x;
        const result = cross > 0 ? -1 : 1;
        console.log(`  ${i} vs ${j}: cross=${cross.toFixed(2)}, result=${result} (${result < 0 ? i + " first" : j + " first"})`);
      }
    }
    
    // Create PreComputedPairs and check what the expected pairs should be
    console.log("\n=== EXPECTED PRECOMPUTED PAIRS ===");
    console.log("The cone boundary rays should create pairs:");
    console.log("  (leftWindowOrigin, leftHit) and (rightWindowOrigin, rightHit)");
    console.log("\nBased on boundaryCross = 43800 >= 0:");
    console.log("  leftWindowOrigin = startLine.end = (740, 300)");
    console.log("  rightWindowOrigin = startLine.start = (540, 300)");
    console.log("\nThe cone boundary hits are:");
    console.log("  leftHit (ray through 740,300) → hits screen at ~(957.81, 0)");
    console.log("  rightHit (ray through 540,300) → hits screen at ~(483.84, 0)");
    console.log("\nExpected pairs in PreComputedPairs:");
    console.log("  (origin:740,300, hit:screen-top:0.748...) → -1");
    console.log("  (origin:540,300, hit:screen-top:0.377...) → -1");
    console.log("\nActual point keys:");
    sourcePoints.forEach((p, i) => {
      console.log(`  ${i}: ${p.getKey()}`);
    });
    console.log("\nIf PreComputedPairs worked, comparing 0 vs 2 should return -1 (0 first)");
    console.log("But the polygon shows 0→1→2→3, meaning 0 vs 2 returned 1 (2 first) - PreComputedPairs NOT working!");
    
    // Create our own PreComputedPairs to verify
    console.log("\n=== PRECOMPUTED PAIRS VERIFICATION ===");
    const testPairs = new PreComputedPairs();
    
    // Simulate what projectConeV2 does: register (rightWindowOrigin, rightHit)
    // rightWindowOrigin = OriginPoint(540, 300)
    // rightHit = HitPoint(483.84, 0) on screen-top
    
    // Get the actual points from sourcePoints
    const originPoint540 = sourcePoints[0]!; // OriginPoint(540, 300)
    const hitPoint483 = sourcePoints[2]!; // HitPoint(483.84, 0)
    
    testPairs.set(originPoint540, hitPoint483, -1);
    console.log(`Stored pair: (${originPoint540.getKey()}, ${hitPoint483.getKey()}) → -1`);
    
    // Now retrieve it
    const retrieved = testPairs.get(originPoint540, hitPoint483);
    console.log(`Retrieved: ${retrieved}`);
    
    // Also check if the actual PreComputedPairs in projectConeV2 has the right pairs
    // We can't access it directly, but we can infer from the behavior
    
    // Simulate the full sorting to see what order we should get
    console.log("\n=== FULL SORT SIMULATION ===");
    const pointsCopy = [...sourcePoints];
    
    // Sort using the same algorithm as ConeProjectionV2
    pointsCopy.sort((a, b) => {
      // Check preComputed (simulate - we know the pairs)
      const aKey = a.getKey();
      const bKey = b.getKey();
      
      // The pairs are: (origin:540,300, hit:screen-top:0.377...) and (origin:740,300, hit:screen-top:0.748...)
      if (aKey === "origin:540,300" && bKey === "hit:screen-top:0.3779965753424658") return -1;
      if (aKey === "hit:screen-top:0.3779965753424658" && bKey === "origin:540,300") return 1;
      if (aKey === "origin:740,300" && bKey === "hit:screen-top:0.7482876712328768") return -1;
      if (aKey === "hit:screen-top:0.7482876712328768" && bKey === "origin:740,300") return 1;
      
      const aXY = a.computeXY();
      const bXY = b.computeXY();
      const aVec = { x: aXY.x - reflectedOrigin.x, y: aXY.y - reflectedOrigin.y };
      const bVec = { x: bXY.x - reflectedOrigin.x, y: bXY.y - reflectedOrigin.y };
      
      // aRef check
      const aRef = refDirection.x * aVec.y - refDirection.y * aVec.x;
      const bRef = refDirection.x * bVec.y - refDirection.y * bVec.x;
      const oppositeSides = (aRef > 0 && bRef < 0) || (aRef < 0 && bRef > 0);
      if (oppositeSides) {
        return aRef > 0 ? -1 : 1;
      }
      
      // Cross product
      const cross = aVec.x * bVec.y - aVec.y * bVec.x;
      return cross > 0 ? -1 : 1;
    });
    
    console.log("Simulated sorted order (with PreComputedPairs):");
    pointsCopy.forEach((p, i) => {
      const xy = p.computeXY();
      console.log(`  ${i}: (${xy.x.toFixed(2)}, ${xy.y.toFixed(2)})`);
    });

    // The polygon should not have self-intersections
    expect(intersections.length).toBe(0);
  });

  it("should analyze collinear vertices in detail", () => {
    const player = { x: 581, y: 81 };
    const surface = HORIZONTAL_SURFACE.getSurfaces()[0]!;

    // Calculate reflected origin
    const reflectedOrigin = reflectPointThroughLine(
      player,
      surface.segment.start,
      surface.segment.end
    );

    // Key vertices from the failing scenario:
    // vertex 0: (540, 300) - surface start endpoint
    // vertex 1: (957.81, 0) - continuation ray hit
    // vertex 2: (483.84, 0) - continuation ray hit  
    // vertex 3: (740, 300) - surface end endpoint

    // Calculate cross products from origin for sorting
    const origin = reflectedOrigin;
    
    // Surface endpoints
    const surfaceStart = { x: 540, y: 300 };
    const surfaceEnd = { x: 740, y: 300 };
    
    // Calculate approximate continuation hit positions
    // Continuation from surfaceStart (540, 300) going away from origin
    const contFromStart = { x: 483.84, y: 0 }; // Approximate
    const contFromEnd = { x: 957.81, y: 0 }; // Approximate

    console.log("=== DETAILED COLLINEARITY ANALYSIS ===");
    console.log(`Origin: (${origin.x.toFixed(2)}, ${origin.y.toFixed(2)})`);
    
    const points = [
      { name: "surface-start", xy: surfaceStart },
      { name: "cont-from-start", xy: contFromStart },
      { name: "surface-end", xy: surfaceEnd },
      { name: "cont-from-end", xy: contFromEnd },
    ];

    // Check collinearity between each pair
    console.log("\n=== PAIRWISE CROSS PRODUCTS ===");
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const p1 = points[i]!;
        const p2 = points[j]!;
        
        const v1 = { x: p1.xy.x - origin.x, y: p1.xy.y - origin.y };
        const v2 = { x: p2.xy.x - origin.x, y: p2.xy.y - origin.y };
        
        const cross = v1.x * v2.y - v1.y * v2.x;
        const isCollinear = Math.abs(cross) < 1;
        
        console.log(`  ${p1.name} vs ${p2.name}: cross=${cross.toFixed(2)} ${isCollinear ? "(COLLINEAR)" : ""}`);
      }
    }

    // Show distances from origin (the tiebreaker we removed)
    console.log("\n=== DISTANCES FROM ORIGIN ===");
    for (const p of points) {
      const dx = p.xy.x - origin.x;
      const dy = p.xy.y - origin.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      console.log(`  ${p.name}: distance=${dist.toFixed(2)}`);
    }

    // Show the CORRECT order based on CCW traversal
    console.log("\n=== EXPECTED CCW ORDER ===");
    console.log("For a windowed cone, the correct CCW order should be:");
    console.log("  1. window boundary point (surface endpoint)");
    console.log("  2. its continuation hit");
    console.log("  3. other continuation hit");
    console.log("  4. other window boundary point");
    
    // Check if endpoints and their continuations are collinear
    console.log("\n=== ENDPOINT + CONTINUATION COLLINEARITY ===");
    
    // Surface start and its continuation
    const vSurfaceStart = { x: surfaceStart.x - origin.x, y: surfaceStart.y - origin.y };
    const vContStart = { x: contFromStart.x - origin.x, y: contFromStart.y - origin.y };
    const crossStartPair = vSurfaceStart.x * vContStart.y - vSurfaceStart.y * vContStart.x;
    console.log(`  surface-start + cont-from-start: cross=${crossStartPair.toFixed(6)}`);
    
    // Surface end and its continuation
    const vSurfaceEnd = { x: surfaceEnd.x - origin.x, y: surfaceEnd.y - origin.y };
    const vContEnd = { x: contFromEnd.x - origin.x, y: contFromEnd.y - origin.y };
    const crossEndPair = vSurfaceEnd.x * vContEnd.y - vSurfaceEnd.y * vContEnd.x;
    console.log(`  surface-end + cont-from-end: cross=${crossEndPair.toFixed(6)}`);
  });
});

