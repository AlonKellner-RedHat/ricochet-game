/**
 * Near-Parallel Visibility Bug Investigation
 *
 * UPDATED INVESTIGATION:
 * ======================
 * After fixing the crossing surfaces (which was an invalid test scene),
 * a DIFFERENT bug was revealed: the visibility polygon is missing screen
 * boundary corners, causing invalid adjacent pairs.
 *
 * NEW BUG MANIFESTATION:
 * - HitPoint[screen-right](1280.0, 720.0) ↔ Junction[screen-bottom+screen-left](0.0, 720.0)
 *   These skip the entire bottom edge!
 * - HitPoint[screen-top](525.3, 0.0) ↔ HitPoint[screen-right](1280.0, 0.0)
 *   These are on different screen surfaces with no shared corner.
 *
 * SCENE (now fixed):
 * - p1: (400, 300) → (600, 300) - horizontal
 * - p2: (400, 302) → (600, 302) - parallel, 2px below p1
 * - Origin: (668, 574)
 */

import { describe, expect, it } from "vitest";
import {
  HitPoint,
  OriginPoint,
  Endpoint,
  isHitPoint,
  isEndpoint,
  isOriginPoint,
  type SourcePoint,
} from "@/trajectory-v2/geometry/SourcePoint";
import {
  createRicochetChain,
  isJunctionPoint,
  type SurfaceChain,
} from "@/trajectory-v2/geometry/SurfaceChain";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2, Ray } from "@/trajectory-v2/geometry/types";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import { projectConeV2, createFullCone } from "@/trajectory-v2/visibility/ConeProjectionV2";
import { getSourceSurfaceIds } from "../invariants/polygon-edges-provenance";

// Scene constants - EXACTLY matching the failing invariant test
const ORIGIN: Vector2 = { x: 668.19, y: 573.89 };
const SCREEN_BOUNDS = { minX: 0, minY: 0, maxX: 1280, maxY: 720 };

// Screen boundary chain - included in all chains for unified handling
const SCREEN_CHAIN = createScreenBoundaryChain(SCREEN_BOUNDS);

/**
 * Create the near-parallel scene chains (fixed - no crossing).
 * Includes the screen boundary chain for unified handling.
 */
function createNearParallelChains(): SurfaceChain[] {
  const chain1 = createRicochetChain(
    "p1",
    [
      { x: 400, y: 300 },
      { x: 600, y: 300 },
    ],
    false
  );
  const chain2 = createRicochetChain(
    "p2",
    [
      { x: 400, y: 302 }, // 2 pixels below p1, truly parallel
      { x: 600, y: 302 },
    ],
    false
  );
  // Include screen chain for unified handling - no special cases
  return [chain1, chain2, SCREEN_CHAIN];
}

/**
 * Calculate angle from origin to point (in degrees).
 */
function angleFromOrigin(point: Vector2, origin: Vector2): number {
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return (Math.atan2(dy, dx) * 180) / Math.PI;
}

/**
 * Describe a SourcePoint for logging.
 */
function describePoint(sp: SourcePoint): string {
  const xy = sp.computeXY();
  const angle = angleFromOrigin(xy, ORIGIN).toFixed(1);
  const pos = `(${xy.x.toFixed(1)}, ${xy.y.toFixed(1)})`;

  if (isHitPoint(sp)) {
    return `HitPoint[${sp.hitSurface.id}] ${pos} @ ${angle}°`;
  }
  if (isEndpoint(sp)) {
    return `Endpoint[${sp.surface.id}] ${pos} @ ${angle}°`;
  }
  if (isJunctionPoint(sp)) {
    const ids = getSourceSurfaceIds(sp);
    return `Junction[${ids.join("+")}] ${pos} @ ${angle}°`;
  }
  if (isOriginPoint(sp)) {
    return `Origin ${pos} @ ${angle}°`;
  }
  return `Unknown ${pos} @ ${angle}°`;
}

describe("Near-Parallel Visibility Bug Investigation", () => {
  const chains = createNearParallelChains();

  describe("Phase 1: Expected Polygon Analysis", () => {
    it("should analyze surface endpoints and expected vertices", () => {
      console.log("=== Phase 1.1: Surface Endpoint Analysis ===\n");

      // Get all surfaces
      const allSurfaces = chains.flatMap((c) => c.getSurfaces());

      console.log("Surfaces:");
      for (const surface of allSurfaces) {
        const startAngle = angleFromOrigin(surface.segment.start, ORIGIN);
        const endAngle = angleFromOrigin(surface.segment.end, ORIGIN);
        console.log(
          `  ${surface.id}: (${surface.segment.start.x}, ${surface.segment.start.y}) → (${surface.segment.end.x}, ${surface.segment.end.y})`
        );
        console.log(`    Start angle: ${startAngle.toFixed(2)}°, End angle: ${endAngle.toFixed(2)}°`);
      }

      console.log("\n=== Expected Vertices in Gap Region (85° - 130°) ===\n");
      console.log("Between the two failing HitPoints, we expect:");
      console.log("  1. Endpoint of p2 at (600, 298) - right end");
      console.log("  2. Endpoint of p1 at (600, 300) - right end");
      console.log("  3. OR rays through these endpoints hitting something");
      console.log("\nLet's calculate the angles to these endpoints:");

      const p2RightEnd = { x: 600, y: 298 };
      const p1RightEnd = { x: 600, y: 300 };
      const p2LeftEnd = { x: 400, y: 302 };
      const p1LeftEnd = { x: 400, y: 300 };

      console.log(`  p2 right (600, 298): ${angleFromOrigin(p2RightEnd, ORIGIN).toFixed(2)}°`);
      console.log(`  p1 right (600, 300): ${angleFromOrigin(p1RightEnd, ORIGIN).toFixed(2)}°`);
      console.log(`  p2 left  (400, 302): ${angleFromOrigin(p2LeftEnd, ORIGIN).toFixed(2)}°`);
      console.log(`  p1 left  (400, 300): ${angleFromOrigin(p1LeftEnd, ORIGIN).toFixed(2)}°`);

      expect(true).toBe(true);
    });

    it("should generate visibility polygon and list all vertices", () => {
      console.log("\n=== Phase 1.2: Actual Polygon Analysis ===\n");

      const source = createFullCone(ORIGIN);
      const sourcePoints = projectConeV2(source, chains);

      console.log(`Polygon has ${sourcePoints.length} vertices:\n`);

      // List all vertices with their angles
      const vertexData: Array<{
        index: number;
        point: SourcePoint;
        xy: Vector2;
        angle: number;
      }> = [];

      for (let i = 0; i < sourcePoints.length; i++) {
        const sp = sourcePoints[i]!;
        const xy = sp.computeXY();
        const angle = angleFromOrigin(xy, ORIGIN);
        vertexData.push({ index: i, point: sp, xy, angle });
      }

      // Sort by angle for display
      const sortedByAngle = [...vertexData].sort((a, b) => a.angle - b.angle);

      console.log("Vertices sorted by angle:");
      for (const v of sortedByAngle) {
        const marker = v.angle >= 85 && v.angle <= 130 ? " <-- GAP REGION" : "";
        console.log(`  [${v.index}] ${describePoint(v.point)}${marker}`);
      }

      // Find vertices in the gap region (85° - 130°)
      console.log("\n=== Vertices in Gap Region (85° - 130°) ===");
      const gapVertices = vertexData.filter((v) => v.angle >= 85 && v.angle <= 130);
      console.log(`Found ${gapVertices.length} vertices in gap region:`);
      for (const v of gapVertices) {
        console.log(`  [${v.index}] ${describePoint(v.point)}`);
      }

      // Check for missing endpoints
      console.log("\n=== Missing Endpoint Analysis ===");
      const p2RightAngle = angleFromOrigin({ x: 600, y: 298 }, ORIGIN);
      const p1RightAngle = angleFromOrigin({ x: 600, y: 300 }, ORIGIN);

      const hasP2Right = gapVertices.some(
        (v) => Math.abs(v.xy.x - 600) < 1 && Math.abs(v.xy.y - 298) < 1
      );
      const hasP1Right = gapVertices.some(
        (v) => Math.abs(v.xy.x - 600) < 1 && Math.abs(v.xy.y - 300) < 1
      );

      console.log(`p2 right endpoint (600, 298) @ ${p2RightAngle.toFixed(2)}°: ${hasP2Right ? "PRESENT" : "MISSING"}`);
      console.log(`p1 right endpoint (600, 300) @ ${p1RightAngle.toFixed(2)}°: ${hasP1Right ? "PRESENT" : "MISSING"}`);

      expect(true).toBe(true);
    });

    it("should identify the invalid adjacent pair", () => {
      console.log("\n=== Phase 1.3: Invalid Adjacent Pair Analysis ===\n");

      const source = createFullCone(ORIGIN);
      const sourcePoints = projectConeV2(source, chains);

      // Find the invalid pair
      console.log("Checking adjacent pairs for shared surface or continuation:");

      for (let i = 0; i < sourcePoints.length; i++) {
        const s1 = sourcePoints[i]!;
        const s2 = sourcePoints[(i + 1) % sourcePoints.length]!;

        const xy1 = s1.computeXY();
        const xy2 = s2.computeXY();
        const angle1 = angleFromOrigin(xy1, ORIGIN);
        const angle2 = angleFromOrigin(xy2, ORIGIN);

        // Check if this is the problematic pair (in the 85-130 range and both HitPoints)
        if (isHitPoint(s1) && isHitPoint(s2)) {
          const id1 = s1.hitSurface.id;
          const id2 = s2.hitSurface.id;

          if (id1 !== id2 && !id1.startsWith("screen-") && !id2.startsWith("screen-")) {
            console.log(`\n*** INVALID PAIR FOUND ***`);
            console.log(`  Vertex ${i}: ${describePoint(s1)}`);
            console.log(`  Vertex ${(i + 1) % sourcePoints.length}: ${describePoint(s2)}`);
            console.log(`  Surface 1: ${id1}`);
            console.log(`  Surface 2: ${id2}`);
            console.log(`  Angle gap: ${Math.abs(angle1 - angle2).toFixed(2)}°`);
          }
        }
      }

      expect(true).toBe(true);
    });
  });

  describe("Phase 2: Algorithm Tracing", () => {
    it("should trace ray targets in the gap region", () => {
      console.log("\n=== Phase 2.1: Ray Target Analysis ===\n");

      // Get all endpoints from chains
      const allEndpoints: Array<{ surface: Surface; s: number; xy: Vector2 }> = [];

      for (const chain of chains) {
        for (const surface of chain.getSurfaces()) {
          allEndpoints.push({
            surface,
            s: 0,
            xy: surface.segment.start,
          });
          allEndpoints.push({
            surface,
            s: 1,
            xy: surface.segment.end,
          });
        }
      }

      console.log("All surface endpoints (potential ray targets):");
      for (const ep of allEndpoints) {
        const angle = angleFromOrigin(ep.xy, ORIGIN);
        const inGap = angle >= 85 && angle <= 130 ? " <-- IN GAP" : "";
        console.log(
          `  ${ep.surface.id} s=${ep.s}: (${ep.xy.x}, ${ep.xy.y}) @ ${angle.toFixed(2)}°${inGap}`
        );
      }

      // Check which endpoints are in the gap region
      const gapEndpoints = allEndpoints.filter((ep) => {
        const angle = angleFromOrigin(ep.xy, ORIGIN);
        return angle >= 85 && angle <= 130;
      });

      console.log(`\nEndpoints in gap region: ${gapEndpoints.length}`);
      for (const ep of gapEndpoints) {
        console.log(`  ${ep.surface.id} at (${ep.xy.x}, ${ep.xy.y})`);
      }

      expect(true).toBe(true);
    });

    it("should check if rays are blocked before reaching gap endpoints", () => {
      console.log("\n=== Phase 2.2: Ray Blocking Analysis ===\n");

      // For each endpoint in the gap, trace a ray and see what it hits first
      const gapTargets = [
        { name: "p2 right", xy: { x: 600, y: 298 } },
        { name: "p1 right", xy: { x: 600, y: 300 } },
      ];

      const allSurfaces = chains.flatMap((c) => c.getSurfaces());

      for (const target of gapTargets) {
        console.log(`\nRay to ${target.name} (${target.xy.x}, ${target.xy.y}):`);

        // Calculate ray direction
        const dirX = target.xy.x - ORIGIN.x;
        const dirY = target.xy.y - ORIGIN.y;
        const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);

        console.log(`  Direction: (${(dirX / dirLen).toFixed(4)}, ${(dirY / dirLen).toFixed(4)})`);

        // Check intersection with each surface
        for (const surface of allSurfaces) {
          const hit = raySegmentIntersect(ORIGIN, target.xy, surface.segment.start, surface.segment.end);

          if (hit) {
            console.log(
              `  Hits ${surface.id} at t=${hit.t.toFixed(4)}, s=${hit.s.toFixed(4)} ` +
                `pos=(${hit.x.toFixed(2)}, ${hit.y.toFixed(2)})`
            );

            if (hit.t < 0.999) {
              console.log(`    *** BLOCKED BEFORE TARGET ***`);
            }
          }
        }
      }

      expect(true).toBe(true);
    });
  });

  describe("Phase 3: Hypothesis Testing", () => {
    it("HYPOTHESIS A: Check if gap endpoints are included as ray targets", () => {
      console.log("\n=== Hypothesis A: Missing Ray Targets ===\n");

      // The endpoints at (600, 298) and (600, 300) should be ray targets
      // These are the right endpoints of p2 and p1 respectively

      const p2RightEnd = { x: 600, y: 298 };
      const p1RightEnd = { x: 600, y: 300 };

      // Generate the polygon
      const source = createFullCone(ORIGIN);
      const sourcePoints = projectConeV2(source, chains);

      // Check if any vertex is at or near these endpoints
      let foundP2Right = false;
      let foundP1Right = false;

      for (const sp of sourcePoints) {
        const xy = sp.computeXY();
        if (Math.abs(xy.x - 600) < 2 && Math.abs(xy.y - 298) < 2) {
          foundP2Right = true;
          console.log(`Found p2 right endpoint: ${describePoint(sp)}`);
        }
        if (Math.abs(xy.x - 600) < 2 && Math.abs(xy.y - 300) < 2) {
          foundP1Right = true;
          console.log(`Found p1 right endpoint: ${describePoint(sp)}`);
        }
      }

      console.log(`\np2 right endpoint (600, 298): ${foundP2Right ? "FOUND" : "NOT FOUND"}`);
      console.log(`p1 right endpoint (600, 300): ${foundP1Right ? "FOUND" : "NOT FOUND"}`);

      if (!foundP2Right || !foundP1Right) {
        console.log("\n*** HYPOTHESIS A CONFIRMED: Endpoints are missing as ray targets ***");
      }

      // This test documents the finding, not enforces it
      expect(true).toBe(true);
    });

    it("HYPOTHESIS B: Check if rays to gap endpoints are being cast", () => {
      console.log("\n=== Hypothesis B: Rays Not Cast ===\n");

      // Check what obstacles the ray would encounter
      const allSurfaces = chains.flatMap((c) => c.getSurfaces());

      // Ray to p2's right endpoint
      const p2Right = { x: 600, y: 298 };
      console.log("Ray to p2 right (600, 298):");

      for (const surface of allSurfaces) {
        const hit = raySegmentIntersect(ORIGIN, p2Right, surface.segment.start, surface.segment.end);
        if (hit && hit.t > 0.001 && hit.t < 1.1 && hit.s >= 0 && hit.s <= 1) {
          console.log(`  Intersects ${surface.id} at t=${hit.t.toFixed(4)}, s=${hit.s.toFixed(4)}`);
        }
      }

      // Ray to p1's right endpoint
      const p1Right = { x: 600, y: 300 };
      console.log("\nRay to p1 right (600, 300):");

      for (const surface of allSurfaces) {
        const hit = raySegmentIntersect(ORIGIN, p1Right, surface.segment.start, surface.segment.end);
        if (hit && hit.t > 0.001 && hit.t < 1.1 && hit.s >= 0 && hit.s <= 1) {
          console.log(`  Intersects ${surface.id} at t=${hit.t.toFixed(4)}, s=${hit.s.toFixed(4)}`);
        }
      }

      expect(true).toBe(true);
    });

    it("HYPOTHESIS C: Check if gap vertices exist but are sorted wrong", () => {
      console.log("\n=== Hypothesis C: Sorting Bug ===\n");

      const source = createFullCone(ORIGIN);
      const sourcePoints = projectConeV2(source, chains);

      // Check if the polygon vertices are in correct angular order
      console.log("Checking angular order of vertices:");

      let prevAngle = -Infinity;
      let sortingError = false;

      for (let i = 0; i < sourcePoints.length; i++) {
        const sp = sourcePoints[i]!;
        const xy = sp.computeXY();
        const angle = angleFromOrigin(xy, ORIGIN);

        // Allow wrap-around at 180/-180
        const angleDiff = angle - prevAngle;
        if (angleDiff < -180) {
          // Wrapped around
        } else if (angleDiff < 0 && Math.abs(angleDiff) > 1) {
          console.log(`  *** Sorting anomaly at vertex ${i}: angle ${angle.toFixed(2)}° < prev ${prevAngle.toFixed(2)}°`);
          sortingError = true;
        }

        prevAngle = angle;
      }

      if (!sortingError) {
        console.log("  No obvious sorting errors detected in angular order");
      }

      expect(true).toBe(true);
    });

    it("HYPOTHESIS D: Check surface occlusion - p2 blocks rays to p1 endpoints", () => {
      console.log("\n=== Hypothesis D: Surface Occlusion ===\n");

      // The key insight: p2 is ABOVE p1 (closer to origin)
      // Rays going to the gap between p1 and p2 might be blocked by p2

      const p2Surface = chains[1]!.getSurfaces()[0]!;
      const p1Surface = chains[0]!.getSurfaces()[0]!;

      // Ray from origin to p1's right endpoint (600, 300)
      const p1Right = { x: 600, y: 300 };

      console.log("Testing if p2 blocks the ray to p1's right endpoint:");

      const hitP2 = raySegmentIntersect(ORIGIN, p1Right, p2Surface.segment.start, p2Surface.segment.end);

      if (hitP2 && hitP2.t > 0 && hitP2.t < 1 && hitP2.s >= 0 && hitP2.s <= 1) {
        console.log(`  YES! Ray to p1-right (600, 300) hits p2 first at t=${hitP2.t.toFixed(4)}`);
        console.log(`  Hit position: (${hitP2.x.toFixed(2)}, ${hitP2.y.toFixed(2)})`);
        console.log(`\n*** HYPOTHESIS D POTENTIALLY CONFIRMED: p2 occludes rays to p1 endpoints ***`);
      } else {
        console.log("  No, ray to p1-right does not hit p2");
      }

      // Also check p1's left endpoint
      const p1Left = { x: 400, y: 300 };
      console.log("\nTesting if p2 blocks the ray to p1's left endpoint:");

      const hitP2Left = raySegmentIntersect(ORIGIN, p1Left, p2Surface.segment.start, p2Surface.segment.end);

      if (hitP2Left && hitP2Left.t > 0 && hitP2Left.t < 1 && hitP2Left.s >= 0 && hitP2Left.s <= 1) {
        console.log(`  YES! Ray to p1-left (400, 300) hits p2 first at t=${hitP2Left.t.toFixed(4)}`);
      } else {
        console.log("  No, ray to p1-left does not hit p2");
      }

      expect(true).toBe(true);
    });

    it("HYPOTHESIS E: The gap requires visibility through the gap between surfaces", () => {
      console.log("\n=== Hypothesis E: Gap Visibility ===\n");

      // The gap between p1 and p2 is very small (2 pixels)
      // From the origin, can we even see through this gap?

      // p1 is at y=300, p2 varies from y=302 (left) to y=298 (right)
      // At x=600: p1 is at 300, p2 is at 298 - p2 is BELOW p1 (inverted!)
      // At x=400: p1 is at 300, p2 is at 302 - p2 is ABOVE p1

      console.log("Gap analysis:");
      console.log("  At x=400: p1 y=300, p2 y=302 → p2 is 2px above p1");
      console.log("  At x=600: p1 y=300, p2 y=298 → p2 is 2px below p1");
      console.log("  The surfaces CROSS at some point!");

      // Find where they cross
      // p1: y = 300 (constant)
      // p2: y = 302 - 4*(x-400)/200 = 302 - 0.02*(x-400)
      // They cross when 300 = 302 - 0.02*(x-400)
      // 0.02*(x-400) = 2
      // x-400 = 100
      // x = 500

      console.log("  Surfaces cross at approximately x=500");

      const crossPoint = { x: 500, y: 300 };
      console.log(`  Cross point: (${crossPoint.x}, ${crossPoint.y})`);
      console.log(`  Angle to cross point: ${angleFromOrigin(crossPoint, ORIGIN).toFixed(2)}°`);

      // The failing edge is between angles 85° and 129°
      // The cross point is at a specific angle
      console.log("\n*** The surfaces INTERSECT, making the visibility polygon complex ***");

      expect(true).toBe(true);
    });
  });

  describe("Phase 4: Screen Boundary Bug Investigation", () => {
    it("should show all polygon vertices with screen boundary analysis", () => {
      console.log("\n=== PHASE 4: Screen Boundary Bug ===\n");

      const source = createFullCone(ORIGIN);
      const sourcePoints = projectConeV2(source, chains);

      console.log(`Polygon has ${sourcePoints.length} vertices:\n`);

      for (let i = 0; i < sourcePoints.length; i++) {
        const sp = sourcePoints[i]!;
        const nextSp = sourcePoints[(i + 1) % sourcePoints.length]!;
        const desc = describePoint(sp);
        const nextDesc = describePoint(nextSp);

        console.log(`[${i}] ${desc}`);

        // Check if this edge is valid
        const ids1 = getSourceSurfaceIds(sp);
        const ids2 = getSourceSurfaceIds(nextSp);
        const sharedSurface = ids1.some((id) => ids2.includes(id));

        if (!sharedSurface) {
          console.log(`    *** INVALID EDGE to [${(i + 1) % sourcePoints.length}] ${nextDesc}`);
          console.log(`    Surfaces: ${ids1.join(",")} → ${ids2.join(",")}`);
        }
      }

      expect(true).toBe(true);
    });

    it("PROVEN: Missing screen corners between HitPoints on different screen edges", () => {
      console.log("\n=== PROOF: Missing Screen Corners ===\n");

      const source = createFullCone(ORIGIN);
      const sourcePoints = projectConeV2(source, chains);

      // Find invalid pairs involving screen boundaries
      const invalidPairs: Array<{
        idx: number;
        s1: SourcePoint;
        s2: SourcePoint;
        s1Surface: string;
        s2Surface: string;
      }> = [];

      for (let i = 0; i < sourcePoints.length; i++) {
        const s1 = sourcePoints[i]!;
        const s2 = sourcePoints[(i + 1) % sourcePoints.length]!;

        const ids1 = getSourceSurfaceIds(s1);
        const ids2 = getSourceSurfaceIds(s2);
        const sharedSurface = ids1.some((id) => ids2.includes(id));

        if (!sharedSurface) {
          invalidPairs.push({
            idx: i,
            s1,
            s2,
            s1Surface: ids1.join(","),
            s2Surface: ids2.join(","),
          });
        }
      }

      console.log(`Found ${invalidPairs.length} invalid adjacent pairs:\n`);

      for (const pair of invalidPairs) {
        console.log(`[${pair.idx}→${(pair.idx + 1) % sourcePoints.length}]`);
        console.log(`  From: ${describePoint(pair.s1)}`);
        console.log(`  To:   ${describePoint(pair.s2)}`);
        console.log(`  Surfaces: ${pair.s1Surface} → ${pair.s2Surface}`);

        // Analyze what's missing
        const xy1 = pair.s1.computeXY();
        const xy2 = pair.s2.computeXY();

        if (pair.s1Surface.includes("screen-") && pair.s2Surface.includes("screen-")) {
          console.log(`  *** MISSING SCREEN CORNER(S) between these edges ***`);

          // Determine which corners are missing
          const corners = [
            { name: "top-left", x: 0, y: 0 },
            { name: "top-right", x: 1280, y: 0 },
            { name: "bottom-right", x: 1280, y: 720 },
            { name: "bottom-left", x: 0, y: 720 },
          ];

          for (const corner of corners) {
            const onEdge1 =
              (pair.s1Surface === "screen-top" && corner.y === 0) ||
              (pair.s1Surface === "screen-bottom" && corner.y === 720) ||
              (pair.s1Surface === "screen-left" && corner.x === 0) ||
              (pair.s1Surface === "screen-right" && corner.x === 1280);

            const onEdge2 =
              (pair.s2Surface === "screen-top" && corner.y === 0) ||
              (pair.s2Surface === "screen-bottom" && corner.y === 720) ||
              (pair.s2Surface === "screen-left" && corner.x === 0) ||
              (pair.s2Surface === "screen-right" && corner.x === 1280);

            if (onEdge1 && onEdge2) {
              console.log(`  Missing corner: ${corner.name} (${corner.x}, ${corner.y})`);
            }
          }
        }
        console.log("");
      }

      // The proof: there are invalid pairs
      expect(invalidPairs.length).toBeGreaterThan(0);
      console.log("*** PROVEN: Visibility polygon is missing screen boundary corners ***");
    });

    it("TRACE: Check which screen boundary is hit first when targeting corner", () => {
      console.log("\n=== Tracing ray to screen corner (1280, 720) ===\n");

      // Screen corner at (1280, 720) - intersection of screen-right and screen-bottom
      const corner = { x: 1280, y: 720 };

      console.log(`Origin: (${ORIGIN.x}, ${ORIGIN.y})`);
      console.log(`Target corner: (${corner.x}, ${corner.y})`);

      // Ray parameters
      const dx = corner.x - ORIGIN.x;
      const dy = corner.y - ORIGIN.y;
      const scale = 10;
      const rayEnd = { x: ORIGIN.x + dx * scale, y: ORIGIN.y + dy * scale };
      const targetT = 1 / scale;

      console.log(`\nRay direction: (${dx.toFixed(4)}, ${dy.toFixed(4)})`);
      console.log(`Target t-value: ${targetT}`);

      // Check intersection with screen-right (x = 1280, y from 0 to 720)
      const screenRightStart = { x: 1280, y: 0 };
      const screenRightEnd = { x: 1280, y: 720 };

      // Check intersection with screen-bottom (y = 720, x from 0 to 1280)
      const screenBottomStart = { x: 0, y: 720 };
      const screenBottomEnd = { x: 1280, y: 720 };

      // Line-line intersection helper
      function intersect(
        p1: { x: number; y: number },
        p2: { x: number; y: number },
        q1: { x: number; y: number },
        q2: { x: number; y: number }
      ) {
        const d1x = p2.x - p1.x;
        const d1y = p2.y - p1.y;
        const d2x = q2.x - q1.x;
        const d2y = q2.y - q1.y;
        const denom = d1x * d2y - d1y * d2x;
        if (Math.abs(denom) < 1e-10) return null;
        const qpx = q1.x - p1.x;
        const qpy = q1.y - p1.y;
        const t = (qpx * d2y - qpy * d2x) / denom;
        const s = (qpx * d1y - qpy * d1x) / denom;
        return { t, s };
      }

      const hitRight = intersect(ORIGIN, rayEnd, screenRightStart, screenRightEnd);
      const hitBottom = intersect(ORIGIN, rayEnd, screenBottomStart, screenBottomEnd);

      console.log("\n=== Screen-right intersection ===");
      if (hitRight) {
        console.log(`  t = ${hitRight.t}`);
        console.log(`  s = ${hitRight.s} (valid if 0 <= s <= 1)`);
        console.log(`  Valid: ${hitRight.s >= 0 && hitRight.s <= 1 && hitRight.t > 0}`);
      }

      console.log("\n=== Screen-bottom intersection ===");
      if (hitBottom) {
        console.log(`  t = ${hitBottom.t}`);
        console.log(`  s = ${hitBottom.s} (valid if 0 <= s <= 1)`);
        console.log(`  Valid: ${hitBottom.s >= 0 && hitBottom.s <= 1 && hitBottom.t > 0}`);
      }

      // Which is closer?
      console.log("\n=== Analysis ===");
      if (hitRight && hitBottom) {
        const rightValid = hitRight.s >= 0 && hitRight.s <= 1 && hitRight.t > 0;
        const bottomValid = hitBottom.s >= 0 && hitBottom.s <= 1 && hitBottom.t > 0;

        if (rightValid && bottomValid) {
          if (hitRight.t < hitBottom.t) {
            console.log("Screen-right is hit FIRST (closer)");
            console.log(`  Hit at t=${hitRight.t}, target at t=${targetT}`);
          } else if (hitBottom.t < hitRight.t) {
            console.log("Screen-bottom is hit FIRST (closer)");
            console.log(`  Hit at t=${hitBottom.t}, target at t=${targetT}`);
          } else {
            console.log("Both hit at same t (corner)");
          }
        }

        // Check if bottom hit is BEFORE target
        if (bottomValid && hitBottom.t < targetT) {
          console.log("\n*** BUG: Screen-bottom blocks ray BEFORE reaching corner! ***");
          console.log(`  Bottom hit t = ${hitBottom.t}`);
          console.log(`  Target t = ${targetT}`);
          console.log(`  Difference = ${targetT - hitBottom.t}`);
        }
      }

      expect(true).toBe(true);
    });

    it("should verify isContinuationPair recognizes valid continuation rays", async () => {
      console.log("\n=== Testing isContinuationPair directly ===\n");

      // Import the function we're testing
      const { validateAdjacentRelationship } = await import(
        "../invariants/adjacent-vertices-related"
      );

      const source = createFullCone(ORIGIN);
      const sourcePoints = projectConeV2(source, chains);

      // Test case: HitPoint[screen-top] → Endpoint[p2-0] (should be valid continuation)
      // Find these specific points
      let hitScreenTop: SourcePoint | null = null;
      let endpointP2: SourcePoint | null = null;

      for (const sp of sourcePoints) {
        const xy = sp.computeXY();
        if (isHitPoint(sp) && sp.hitSurface.id === "screen-top" && Math.abs(xy.x - 102.4) < 1) {
          hitScreenTop = sp;
        }
        if (isEndpoint(sp) && sp.surface.id === "p2-0" && Math.abs(xy.x - 400) < 1) {
          endpointP2 = sp;
        }
      }

      if (hitScreenTop && endpointP2) {
        console.log("Testing: HitPoint[screen-top] → Endpoint[p2-0]");
        console.log("  HitPoint:", hitScreenTop.computeXY());
        console.log("  Endpoint:", endpointP2.computeXY());

        const result = validateAdjacentRelationship(hitScreenTop, endpointP2, ORIGIN);
        console.log("  Result:", result);

        // This SHOULD be valid - they're on the same continuation ray
        expect(result.valid).toBe(true);
      } else {
        console.log("Could not find the test points");
        expect(hitScreenTop).not.toBeNull();
        expect(endpointP2).not.toBeNull();
      }
    });
  });
});

/**
 * Ray-segment intersection helper.
 */
function raySegmentIntersect(
  rayStart: Vector2,
  rayEnd: Vector2,
  segStart: Vector2,
  segEnd: Vector2
): { t: number; s: number; x: number; y: number } | null {
  const dx = rayEnd.x - rayStart.x;
  const dy = rayEnd.y - rayStart.y;
  const sx = segEnd.x - segStart.x;
  const sy = segEnd.y - segStart.y;

  const denom = dx * sy - dy * sx;
  if (Math.abs(denom) < 1e-10) return null;

  const t = ((segStart.x - rayStart.x) * sy - (segStart.y - rayStart.y) * sx) / denom;
  const s = ((segStart.x - rayStart.x) * dy - (segStart.y - rayStart.y) * dx) / denom;

  return {
    t,
    s,
    x: rayStart.x + t * dx,
    y: rayStart.y + t * dy,
  };
}
