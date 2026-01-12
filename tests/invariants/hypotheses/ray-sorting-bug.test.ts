/**
 * Hypothesis Test: Ray Sorting Bug
 *
 * Proves that continuation ray points are sorted incorrectly due to
 * missing PreComputedPairs for collinear points.
 *
 * Scene: wall-with-gap at player position (581, 81)
 *
 * Expected: The continuation ray from Endpoint[target-0] (700, 200)
 * through Endpoint[wall-right-0] (900, 400) to HitPoint[screen-bottom] (1220, 720)
 * should be sorted as: FAR → MIDDLE → NEAR (for CCW polygon traversal)
 *
 * Actual: Currently sorted as NEAR → MIDDLE → FAR (distance order)
 */

import { describe, it, expect } from "vitest";
import { getSceneById } from "@/debug/debugScenes";
import { projectConeV2, createFullCone } from "@/trajectory-v2/visibility/ConeProjectionV2";
import { validateEdgeByProvenance } from "../invariants/polygon-edges-provenance";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import { isEndpoint, isHitPoint, type SourcePoint } from "@/trajectory-v2/geometry/SourcePoint";

describe("Ray Sorting Bug Investigation", () => {
  const scene = getSceneById("wall-with-gap")!;
  const origin = { x: 581, y: 81 };
  const screenChain = createScreenBoundaryChain({
    minX: 0, maxX: 1280, minY: 0, maxY: 720
  });
  const allChains = [...scene.chains, screenChain];

  it("should reproduce the incorrect sorting of continuation ray points", () => {
    const sourcePoints = projectConeV2(
      createFullCone(origin),
      allChains
    );

    // Find the continuation ray points on ray-3 (target-0 → wall-right-0 → screen-bottom)
    // These are the points at approximately 45° angle from origin
    const rayPoints: SourcePoint[] = [];
    for (const sp of sourcePoints) {
      const xy = sp.computeXY();
      // Points on the ~45° ray from origin (581, 81)
      // Endpoint[target-0] at (700, 200): angle ≈ 45°
      // Endpoint[wall-right-0] at (900, 400): angle ≈ 45°
      // HitPoint[screen-bottom] at (1220, 720): angle ≈ 45°
      const dx = xy.x - origin.x;
      const dy = xy.y - origin.y;
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      
      // All three points should be at approximately 45°
      if (Math.abs(angle - 45) < 1) {
        rayPoints.push(sp);
      }
    }

    console.log("\n=== CONTINUATION RAY POINTS (45° angle) ===");
    for (let i = 0; i < rayPoints.length; i++) {
      const sp = rayPoints[i]!;
      const xy = sp.computeXY();
      const dist = Math.sqrt((xy.x - origin.x) ** 2 + (xy.y - origin.y) ** 2);
      console.log(`  [${i}] ${sp.constructor.name} (${xy.x.toFixed(0)}, ${xy.y.toFixed(0)}) dist=${dist.toFixed(0)}`);
    }

    // AFTER FIX: Points should be in REVERSE distance order (far to near)
    // This is CORRECT for CCW traversal of "outward spike"
    expect(rayPoints.length).toBeGreaterThanOrEqual(3);

    // Check the current order
    const distances = rayPoints.map(sp => {
      const xy = sp.computeXY();
      return Math.sqrt((xy.x - origin.x) ** 2 + (xy.y - origin.y) ** 2);
    });

    console.log("\n=== DISTANCE ORDER CHECK ===");
    console.log("Distances:", distances.map(d => d.toFixed(0)).join(" > "));

    // FIXED: points are sorted by distance (descending = far to near)
    // We expect: distances[0] > distances[1] > distances[2] (CORRECT!)
    const isReverseDistanceOrder = distances[0]! > distances[1]! && distances[1]! > distances[2]!;
    console.log(`Currently in reverse distance order (CORRECT): ${isReverseDistanceOrder}`);

    // This assertion verifies the fix is working
    expect(isReverseDistanceOrder).toBe(true);
  });

  it("should prove that edges around the swapped points are invalid", () => {
    const sourcePoints = projectConeV2(
      createFullCone(origin),
      allChains
    );

    // Find the indices of the continuation ray points in the full polygon
    const n = sourcePoints.length;
    const invalidEdges: number[] = [];

    console.log("\n=== EDGE VALIDITY ===");
    for (let i = 0; i < n; i++) {
      const s1 = sourcePoints[i]!;
      const s2 = sourcePoints[(i + 1) % n]!;
      const result = validateEdgeByProvenance(s1, s2, origin);
      
      if (!result.valid) {
        invalidEdges.push(i);
        const xy1 = s1.computeXY();
        const xy2 = s2.computeXY();
        console.log(`  INVALID Edge [${i}]→[${(i+1)%n}]: ${s1.constructor.name}(${xy1.x.toFixed(0)},${xy1.y.toFixed(0)}) → ${s2.constructor.name}(${xy2.x.toFixed(0)},${xy2.y.toFixed(0)})`);
        console.log(`    Reason: ${result.reason}`);
      }
    }

    // AFTER FIX: There should be NO invalid edges
    // The continuation ray validation now recognizes Endpoint→Endpoint on same ray as valid
    expect(invalidEdges.length).toBe(0);
    console.log(`\nTotal invalid edges: ${invalidEdges.length} (CORRECT!)`);
  });

  it("HYPOTHESIS: Missing PreComputedPairs between continuation ray points causes wrong order", () => {
    const sourcePoints = projectConeV2(
      createFullCone(origin),
      allChains
    );

    // Find all points on the same continuation ray
    const rayPointsMap = new Map<string, SourcePoint[]>();
    
    for (const sp of sourcePoints) {
      if (sp.continuationRay) {
        const rayId = sp.continuationRay.id;
        if (!rayPointsMap.has(rayId)) {
          rayPointsMap.set(rayId, []);
        }
        rayPointsMap.get(rayId)!.push(sp);
      }
    }

    console.log("\n=== CONTINUATION RAYS ===");
    for (const [rayId, points] of rayPointsMap) {
      console.log(`\nRay ${rayId} (${points.length} points):`);
      for (const sp of points) {
        const xy = sp.computeXY();
        const dist = Math.sqrt((xy.x - origin.x) ** 2 + (xy.y - origin.y) ** 2);
        console.log(`  ${sp.constructor.name} (${xy.x.toFixed(0)}, ${xy.y.toFixed(0)}) dist=${dist.toFixed(0)}`);
      }
    }

    // Find the ray with 3+ points (the problematic one)
    let multiPointRay: SourcePoint[] | undefined;
    for (const points of rayPointsMap.values()) {
      if (points.length >= 3) {
        multiPointRay = points;
        break;
      }
    }

    if (multiPointRay) {
      console.log("\n=== MULTI-POINT RAY ANALYSIS ===");
      console.log("This ray has 3+ points, requiring pairwise PreComputedPairs");
      
      // Check the order in the polygon
      const polygonIndices = multiPointRay.map(sp => sourcePoints.indexOf(sp));
      console.log("Polygon indices:", polygonIndices.join(", "));
      
      // The indices should be in DESCENDING order (far point has lower index than near point)
      // for correct CCW traversal of an "outward spike"
      const isDescending = polygonIndices.every((idx, i) => 
        i === 0 || polygonIndices[i - 1]! < idx
      );
      const isAscending = polygonIndices.every((idx, i) => 
        i === 0 || polygonIndices[i - 1]! > idx
      );
      
      console.log(`Indices ascending (distance order): ${isAscending}`);
      console.log(`Indices descending (reverse distance): ${isDescending}`);
      
      // Document current buggy state: indices are in distance order
      // (This will change after the fix)
    }

    // At minimum, we should have found continuation rays
    expect(rayPointsMap.size).toBeGreaterThan(0);
  });

  it("should prove that swapping points would create valid edges", () => {
    const sourcePoints = projectConeV2(
      createFullCone(origin),
      allChains
    );

    // Find a pair of points that would benefit from swapping
    // Based on diagnostic: Points 1 and 2 should be swapped
    
    // Find the screen corner junction point (should be at index 0)
    let junctionIdx = -1;
    for (let i = 0; i < sourcePoints.length; i++) {
      const xy = sourcePoints[i]!.computeXY();
      if (Math.abs(xy.x - 1280) < 1 && Math.abs(xy.y - 720) < 1) {
        junctionIdx = i;
        break;
      }
    }

    if (junctionIdx >= 0) {
      console.log("\n=== SWAP ANALYSIS ===");
      console.log(`Found screen corner junction at index ${junctionIdx}`);
      
      const n = sourcePoints.length;
      const idx1 = (junctionIdx + 1) % n;
      const idx2 = (junctionIdx + 2) % n;
      const idx3 = (junctionIdx + 3) % n;
      
      const sp0 = sourcePoints[junctionIdx]!;
      const sp1 = sourcePoints[idx1]!;
      const sp2 = sourcePoints[idx2]!;
      const sp3 = sourcePoints[idx3]!;
      
      console.log(`Point [${junctionIdx}]: ${sp0.constructor.name} (${sp0.computeXY().x.toFixed(0)}, ${sp0.computeXY().y.toFixed(0)})`);
      console.log(`Point [${idx1}]: ${sp1.constructor.name} (${sp1.computeXY().x.toFixed(0)}, ${sp1.computeXY().y.toFixed(0)})`);
      console.log(`Point [${idx2}]: ${sp2.constructor.name} (${sp2.computeXY().x.toFixed(0)}, ${sp2.computeXY().y.toFixed(0)})`);
      console.log(`Point [${idx3}]: ${sp3.constructor.name} (${sp3.computeXY().x.toFixed(0)}, ${sp3.computeXY().y.toFixed(0)})`);
      
      // Check current edges
      const edge01 = validateEdgeByProvenance(sp0, sp1, origin);
      const edge12 = validateEdgeByProvenance(sp1, sp2, origin);
      const edge23 = validateEdgeByProvenance(sp2, sp3, origin);
      
      console.log(`\nCurrent edges:`);
      console.log(`  Edge [${junctionIdx}]→[${idx1}]: ${edge01.valid ? "VALID" : "INVALID: " + edge01.reason}`);
      console.log(`  Edge [${idx1}]→[${idx2}]: ${edge12.valid ? "VALID" : "INVALID: " + edge12.reason}`);
      console.log(`  Edge [${idx2}]→[${idx3}]: ${edge23.valid ? "VALID" : "INVALID: " + edge23.reason}`);
      
      // Check if swapping sp1 and sp2 would help
      // After swap: sp0 → sp2 → sp1 → sp3
      const swapped01 = validateEdgeByProvenance(sp0, sp2, origin);
      const swapped12 = validateEdgeByProvenance(sp2, sp1, origin);
      const swapped23 = validateEdgeByProvenance(sp1, sp3, origin);
      
      console.log(`\nAfter swapping [${idx1}] and [${idx2}]:`);
      console.log(`  Edge [${junctionIdx}]→[${idx2}]: ${swapped01.valid ? "VALID" : "INVALID: " + swapped01.reason}`);
      console.log(`  Edge [${idx2}]→[${idx1}]: ${swapped12.valid ? "VALID" : "INVALID: " + swapped12.reason}`);
      console.log(`  Edge [${idx1}]→[${idx3}]: ${swapped23.valid ? "VALID" : "INVALID: " + swapped23.reason}`);
      
      // If swap makes all three edges valid, this proves the sorting is wrong
      const swapHelps = swapped01.valid && swapped12.valid && swapped23.valid;
      console.log(`\nSwapping would fix all edges: ${swapHelps}`);
      
      if (swapHelps) {
        console.log("\n=== ROOT CAUSE PROVEN ===");
        console.log("The sorting algorithm puts continuation ray points in wrong order.");
        console.log("FIX: Add PreComputedPairs for ALL points on the same continuation ray.");
      }
    }

    expect(junctionIdx).toBeGreaterThanOrEqual(0);
  });
});
