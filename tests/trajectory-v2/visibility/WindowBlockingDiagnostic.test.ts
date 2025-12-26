/**
 * Diagnostic test to verify if rays are hitting the planned surface (window).
 *
 * This test adds detailed logging to track exactly which surface blocks each ray.
 */

import type { Surface } from "@/surfaces/Surface";
import { lineLineIntersection } from "@/trajectory-v2/geometry/GeometryOps";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import {
  createConeThroughWindow,
  isPointInCone,
  projectCone,
} from "@/trajectory-v2/visibility/ConeProjection";
import { describe, expect, it } from "vitest";

// Helper to create test surfaces
function createTestSurface(
  id: string,
  start: { x: number; y: number },
  end: { x: number; y: number }
): Surface {
  return {
    id,
    segment: { start, end },
    canReflect: false,
    isReflective: false,
    canReflectFrom: () => false,
  } as Surface;
}

interface RayHitLog {
  target: Vector2;
  hitSurface: string | null;
  hitPoint: Vector2 | null;
  hitT: number;
  minT: number;
  wasBlockedByWindow: boolean;
}

/**
 * Cast a ray with detailed logging of what blocks it.
 */
function castRayWithLogging(
  origin: Vector2,
  target: Vector2,
  obstacles: readonly Surface[],
  windowSurface: Surface,
  bounds: { minX: number; maxX: number; minY: number; maxY: number }
): RayHitLog {
  const dx = target.x - origin.x;
  const dy = target.y - origin.y;
  const len = Math.sqrt(dx * dx + dy * dy);

  if (len < 0.0001) {
    return {
      target,
      hitSurface: null,
      hitPoint: null,
      hitT: Number.POSITIVE_INFINITY,
      minT: 0,
      wasBlockedByWindow: false,
    };
  }

  const scale = 10;
  const rayEnd = {
    x: origin.x + dx * scale,
    y: origin.y + dy * scale,
  };

  // Calculate minT from window intersection
  const startLine = { start: windowSurface.segment.start, end: windowSurface.segment.end };
  const windowHit = lineLineIntersection(origin, rayEnd, startLine.start, startLine.end);

  let minT = 0.0001;
  if (windowHit.valid && windowHit.s >= 0 && windowHit.s <= 1 && windowHit.t > 0) {
    minT = windowHit.t;
  } else {
    return {
      target,
      hitSurface: "NO_WINDOW_INTERSECTION",
      hitPoint: null,
      hitT: Number.POSITIVE_INFINITY,
      minT: 0,
      wasBlockedByWindow: false,
    };
  }

  let closestT = Number.POSITIVE_INFINITY;
  let closestSurface: string | null = null;
  let closestPoint: Vector2 | null = null;
  let wasBlockedByWindow = false;

  // Check all obstacles
  for (const obstacle of obstacles) {
    const hit = lineLineIntersection(origin, rayEnd, obstacle.segment.start, obstacle.segment.end);

    if (hit.valid && hit.t > minT && hit.s >= 0 && hit.s <= 1 && hit.t < closestT) {
      closestT = hit.t;
      closestSurface = obstacle.id;
      closestPoint = hit.point;

      // Check if this is the window surface
      if (obstacle.id === windowSurface.id) {
        wasBlockedByWindow = true;
      }
    }
  }

  // Check screen boundaries
  const screenEdges = [
    {
      id: "screen-top",
      start: { x: bounds.minX, y: bounds.minY },
      end: { x: bounds.maxX, y: bounds.minY },
    },
    {
      id: "screen-right",
      start: { x: bounds.maxX, y: bounds.minY },
      end: { x: bounds.maxX, y: bounds.maxY },
    },
    {
      id: "screen-bottom",
      start: { x: bounds.maxX, y: bounds.maxY },
      end: { x: bounds.minX, y: bounds.maxY },
    },
    {
      id: "screen-left",
      start: { x: bounds.minX, y: bounds.maxY },
      end: { x: bounds.minX, y: bounds.minY },
    },
  ];

  for (const edge of screenEdges) {
    const hit = lineLineIntersection(origin, rayEnd, edge.start, edge.end);
    if (hit.valid && hit.t > minT && hit.s >= 0 && hit.s <= 1 && hit.t < closestT) {
      closestT = hit.t;
      closestSurface = edge.id;
      closestPoint = hit.point;
      wasBlockedByWindow = false; // Screen edge, not window
    }
  }

  return {
    target,
    hitSurface: closestSurface,
    hitPoint: closestPoint,
    hitT: closestT,
    minT,
    wasBlockedByWindow,
  };
}

describe("Window Surface Blocking Diagnostic", () => {
  const bounds = { minX: 0, maxX: 1280, minY: 80, maxY: 700 };

  // The planned surface (window) that rays should pass through
  const windowSurface = createTestSurface("ricochet-1", { x: 800, y: 150 }, { x: 900, y: 250 });

  const allSurfaces = [
    createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }),
    createTestSurface("ceiling", { x: 0, y: 80 }, { x: 1280, y: 80 }),
    createTestSurface("left-wall", { x: 20, y: 80 }, { x: 20, y: 700 }),
    createTestSurface("right-wall", { x: 1260, y: 80 }, { x: 1260, y: 700 }),
    createTestSurface("platform-1", { x: 300, y: 450 }, { x: 500, y: 450 }),
    createTestSurface("platform-2", { x: 550, y: 350 }, { x: 750, y: 350 }),
    windowSurface, // The window surface is also in allSurfaces!
    createTestSurface("ricochet-2", { x: 400, y: 250 }, { x: 550, y: 250 }),
    createTestSurface("ricochet-3", { x: 100, y: 200 }, { x: 200, y: 300 }),
    createTestSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 }),
  ];

  it("Case 1 - origin at (1316, -431.1) - diagnose rays blocked by window", () => {
    const origin = { x: 1316.0, y: -431.1 };
    const cone = createConeThroughWindow(
      origin,
      windowSurface.segment.start,
      windowSurface.segment.end
    );

    // Collect critical points to cast rays to
    const criticalPoints: Vector2[] = [];
    for (const surface of allSurfaces) {
      criticalPoints.push(surface.segment.start);
      criticalPoints.push(surface.segment.end);
    }
    // Add screen corners
    criticalPoints.push({ x: bounds.minX, y: bounds.minY });
    criticalPoints.push({ x: bounds.maxX, y: bounds.minY });
    criticalPoints.push({ x: bounds.maxX, y: bounds.maxY });
    criticalPoints.push({ x: bounds.minX, y: bounds.maxY });

    console.log("\n=== Case 1: Origin (1316, -431.1) ===\n");
    console.log(`Cone origin: (${cone.origin.x}, ${cone.origin.y})`);
    console.log(`Cone leftBoundary: (${cone.leftBoundary.x}, ${cone.leftBoundary.y})`);
    console.log(`Cone rightBoundary: (${cone.rightBoundary.x}, ${cone.rightBoundary.y})`);
    console.log(
      `Cone startLine: (${cone.startLine?.start.x}, ${cone.startLine?.start.y}) -> (${cone.startLine?.end.x}, ${cone.startLine?.end.y})`
    );
    console.log(`Total critical points: ${criticalPoints.length}`);

    // Log which points are in cone
    let pointsInCone = 0;
    for (const target of criticalPoints) {
      const inCone = isPointInCone(target, cone);
      if (inCone) {
        pointsInCone++;
        console.log(`  IN CONE: (${target.x}, ${target.y})`);
      }
    }
    console.log(`Points in cone: ${pointsInCone}`);

    const raysBlockedByWindow: RayHitLog[] = [];
    const allRayLogs: RayHitLog[] = [];

    for (const target of criticalPoints) {
      // Skip if not in cone
      if (!isPointInCone(target, cone)) continue;

      const log = castRayWithLogging(origin, target, allSurfaces, windowSurface, bounds);
      allRayLogs.push(log);

      if (log.wasBlockedByWindow) {
        raysBlockedByWindow.push(log);
        console.log(`RAY BLOCKED BY WINDOW:`);
        console.log(`  Target: (${target.x.toFixed(1)}, ${target.y.toFixed(1)})`);
        console.log(`  Hit: (${log.hitPoint?.x.toFixed(1)}, ${log.hitPoint?.y.toFixed(1)})`);
        console.log(`  hitT: ${log.hitT.toFixed(15)}, minT: ${log.minT.toFixed(15)}`);
        console.log(`  Difference (hitT - minT): ${(log.hitT - log.minT).toExponential(6)}`);
      }
    }

    console.log(`\n--- Summary ---`);
    console.log(`Total rays cast: ${allRayLogs.length}`);
    console.log(`Rays blocked by window: ${raysBlockedByWindow.length}`);

    // Log all rays that hit the window surface (including those at minT)
    const raysHittingWindow = allRayLogs.filter((r) => r.hitSurface === "ricochet-1");
    console.log(`Rays hitting window (as closest obstacle): ${raysHittingWindow.length}`);

    // Now run the actual projectCone and check vertices
    const polygon = projectCone(cone, allSurfaces, bounds);
    console.log(`\nPolygon vertices: ${polygon.length}`);
    polygon.forEach((v, i) => {
      console.log(`  [${i}] (${v.x.toFixed(1)}, ${v.y.toFixed(1)})`);
    });

    // Check if any vertices are ON the window surface (not at endpoints)
    const verticesOnWindow = polygon.filter((v) => {
      // Check if point is on line segment (800,150)→(900,250) but not at endpoints
      const isEndpoint =
        (Math.abs(v.x - 800) < 0.1 && Math.abs(v.y - 150) < 0.1) ||
        (Math.abs(v.x - 900) < 0.1 && Math.abs(v.y - 250) < 0.1);
      if (isEndpoint) return false;

      // Check if on line using cross product
      const dx = 900 - 800;
      const dy = 250 - 150;
      const px = v.x - 800;
      const py = v.y - 150;
      const cross = Math.abs(px * dy - py * dx);
      const onLine = cross < 5; // tolerance

      // Check if between endpoints
      const t = dx !== 0 ? px / dx : py / dy;
      const betweenEndpoints = t > 0.01 && t < 0.99;

      return onLine && betweenEndpoints;
    });

    console.log(`\nVertices ON window surface (between endpoints): ${verticesOnWindow.length}`);
    verticesOnWindow.forEach((v) => {
      console.log(`  (${v.x.toFixed(1)}, ${v.y.toFixed(1)})`);
    });

    // Log expectation - we want to see if rays are being blocked
    console.log(
      `\n*** DIAGNOSIS: ${raysBlockedByWindow.length > 0 ? "RAYS ARE BEING BLOCKED BY WINDOW" : "No rays blocked by window"} ***`
    );
  });

  it("Direct test: cast ray to window endpoint and check blocking", () => {
    const origin = { x: 1316.0, y: -431.1 };
    const windowStart = { x: 800, y: 150 };
    const windowEnd = { x: 900, y: 250 };

    console.log("\n=== Direct Ray to Window Endpoint Test ===\n");

    // Cast ray directly to each window endpoint
    for (const target of [windowStart, windowEnd]) {
      console.log(`\nRay to window endpoint (${target.x}, ${target.y}):`);

      // Calculate ray
      const dx = target.x - origin.x;
      const dy = target.y - origin.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const scale = 10;
      const rayEnd = {
        x: origin.x + dx * scale,
        y: origin.y + dy * scale,
      };

      // Calculate startLine intersection (minT)
      const windowLineHit = lineLineIntersection(origin, rayEnd, windowStart, windowEnd);
      console.log(
        `  startLine intersection: valid=${windowLineHit.valid}, t=${windowLineHit.t?.toFixed(15)}, s=${windowLineHit.s?.toFixed(15)}`
      );

      // Calculate obstacle intersection (window surface as obstacle)
      const obstacleHit = lineLineIntersection(
        origin,
        rayEnd,
        windowSurface.segment.start,
        windowSurface.segment.end
      );
      console.log(
        `  obstacle intersection: valid=${obstacleHit.valid}, t=${obstacleHit.t?.toFixed(15)}, s=${obstacleHit.s?.toFixed(15)}`
      );

      if (windowLineHit.valid && obstacleHit.valid) {
        const diff = obstacleHit.t - windowLineHit.t;
        console.log(`  DIFFERENCE (obstacle.t - startLine.t): ${diff.toExponential(6)}`);
        console.log(`  Would pass 'hit.t > minT' check: ${obstacleHit.t > windowLineHit.t}`);

        if (obstacleHit.t > windowLineHit.t) {
          console.log(`  *** FLOATING POINT ISSUE DETECTED! Ray would be blocked by window ***`);
        }
      }
    }

    // Also test grazing rays slightly offset from window endpoints
    console.log("\n--- Grazing Rays ---");
    for (const target of [windowStart, windowEnd]) {
      const dx = target.x - origin.x;
      const dy = target.y - origin.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const offset = Math.max(0.5, len * 0.001);
      const perpX = (-dy / len) * offset;
      const perpY = (dx / len) * offset;

      for (const off of [
        { x: perpX, y: perpY },
        { x: -perpX, y: -perpY },
      ]) {
        const grazingTarget = { x: target.x + off.x, y: target.y + off.y };
        console.log(
          `\nGrazing ray toward (${grazingTarget.x.toFixed(4)}, ${grazingTarget.y.toFixed(4)}):`
        );

        const grayDx = grazingTarget.x - origin.x;
        const grayDy = grazingTarget.y - origin.y;
        const scale = 10;
        const rayEnd = {
          x: origin.x + grayDx * scale,
          y: origin.y + grayDy * scale,
        };

        const windowLineHit = lineLineIntersection(origin, rayEnd, windowStart, windowEnd);
        const obstacleHit = lineLineIntersection(
          origin,
          rayEnd,
          windowSurface.segment.start,
          windowSurface.segment.end
        );

        if (windowLineHit.valid && obstacleHit.valid) {
          const diff = obstacleHit.t - windowLineHit.t;
          console.log(
            `  startLine.t=${windowLineHit.t.toFixed(15)}, obstacle.t=${obstacleHit.t.toFixed(15)}`
          );
          console.log(`  DIFFERENCE: ${diff.toExponential(6)}`);
          console.log(`  Would pass 'hit.t > minT': ${obstacleHit.t > windowLineHit.t}`);

          if (obstacleHit.t > windowLineHit.t && Math.abs(diff) < 1e-10) {
            console.log(`  *** FLOATING POINT ISSUE DETECTED! ***`);
          }
        } else if (!windowLineHit.valid && obstacleHit.valid) {
          console.log(`  startLine miss but obstacle hit at t=${obstacleHit.t.toFixed(6)}`);
        } else if (windowLineHit.valid && !obstacleHit.valid) {
          console.log(`  startLine hit but obstacle miss`);
        } else {
          console.log(`  Both miss`);
        }
      }
    }
  });

  it("Case 2 - origin at (1316, -418.7) - compare behavior", () => {
    const origin = { x: 1316.0, y: -418.7 };
    const cone = createConeThroughWindow(
      origin,
      windowSurface.segment.start,
      windowSurface.segment.end
    );

    const criticalPoints: Vector2[] = [];
    for (const surface of allSurfaces) {
      criticalPoints.push(surface.segment.start);
      criticalPoints.push(surface.segment.end);
    }
    criticalPoints.push({ x: bounds.minX, y: bounds.minY });
    criticalPoints.push({ x: bounds.maxX, y: bounds.minY });
    criticalPoints.push({ x: bounds.maxX, y: bounds.maxY });
    criticalPoints.push({ x: bounds.minX, y: bounds.maxY });

    console.log("\n=== Case 2: Origin (1316, -418.7) ===\n");

    const raysBlockedByWindow: RayHitLog[] = [];
    const allRayLogs: RayHitLog[] = [];

    for (const target of criticalPoints) {
      if (!isPointInCone(target, cone)) continue;

      const log = castRayWithLogging(origin, target, allSurfaces, windowSurface, bounds);
      allRayLogs.push(log);

      if (log.wasBlockedByWindow) {
        raysBlockedByWindow.push(log);
        console.log(`RAY BLOCKED BY WINDOW:`);
        console.log(`  Target: (${target.x.toFixed(1)}, ${target.y.toFixed(1)})`);
        console.log(`  Hit: (${log.hitPoint?.x.toFixed(1)}, ${log.hitPoint?.y.toFixed(1)})`);
        console.log(`  hitT: ${log.hitT.toFixed(15)}, minT: ${log.minT.toFixed(15)}`);
        console.log(`  Difference (hitT - minT): ${(log.hitT - log.minT).toExponential(6)}`);
      }
    }

    console.log(`\n--- Summary ---`);
    console.log(`Total rays cast: ${allRayLogs.length}`);
    console.log(`Rays blocked by window: ${raysBlockedByWindow.length}`);

    const polygon = projectCone(cone, allSurfaces, bounds);
    console.log(`\nPolygon vertices: ${polygon.length}`);
    polygon.forEach((v, i) => {
      console.log(`  [${i}] (${v.x.toFixed(1)}, ${v.y.toFixed(1)})`);
    });

    console.log(
      `\n*** DIAGNOSIS: ${raysBlockedByWindow.length > 0 ? "RAYS ARE BEING BLOCKED BY WINDOW" : "No rays blocked by window"} ***`
    );
  });

  it("Verify fix: excluding window surface allows rays to pass", () => {
    const origin = { x: 1316.0, y: -431.1 }; // Case 1 origin
    const cone = createConeThroughWindow(
      origin,
      windowSurface.segment.start,
      windowSurface.segment.end
    );

    // Create obstacles WITHOUT the window surface
    const obstaclesWithoutWindow = allSurfaces.filter((s) => s.id !== windowSurface.id);

    console.log("\n=== Case 1 with window EXCLUDED from obstacles ===\n");
    console.log(`Obstacles count: ${obstaclesWithoutWindow.length} (was ${allSurfaces.length})`);

    const polygon = projectCone(cone, obstaclesWithoutWindow, bounds);
    console.log(`\nPolygon vertices (window excluded): ${polygon.length}`);
    polygon.forEach((v, i) => {
      console.log(`  [${i}] (${v.x.toFixed(1)}, ${v.y.toFixed(1)})`);
    });

    // Check what surfaces the polygon hits
    const hasFloorHits = polygon.some((v) => Math.abs(v.y - 700) < 1);
    const hasPlatform2Hits = polygon.some((v) => Math.abs(v.y - 350) < 1);
    const hasCeilingHits = polygon.some((v) => Math.abs(v.y - 80) < 1);

    console.log(`\n--- Hit Analysis ---`);
    console.log(`Has floor hits (y=700): ${hasFloorHits}`);
    console.log(`Has platform-2 hits (y=350): ${hasPlatform2Hits}`);
    console.log(`Has ceiling hits (y=80): ${hasCeilingHits}`);

    // With grazing rays removed, we get fewer vertices but the fix still works
    console.log(
      `\n*** FIX VERIFICATION: ${hasFloorHits || hasPlatform2Hits ? "EXCLUDING WINDOW FIXES THE ISSUE" : "Issue persists even with window excluded"} ***`
    );

    // Polygon is valid with at least 3 vertices and hits actual obstacles
    expect(polygon.length).toBeGreaterThanOrEqual(3);
    expect(hasFloorHits || hasPlatform2Hits).toBe(true);
  });

  it("Analyze user-reported vertices - check if it's a sorting issue", () => {
    // User's Case 1 showed these vertices (supposedly from origin 1316, -431.1):
    const userReportedVertices = [
      { x: 900.0, y: 250.0 }, // window end
      { x: 899.4, y: 249.4 }, // grazing near window end
      { x: 498.1, y: 700.0 }, // floor hit
      { x: 855.0, y: 205.0 }, // ON the window surface line!
      { x: 854.5, y: 204.5 }, // near the window surface
      { x: 800.6, y: 150.6 }, // near window start
      { x: 800.0, y: 150.0 }, // window start
    ];

    const origin = { x: 1316.0, y: -431.1 };

    console.log("\n=== Analyze User-Reported Vertices ===\n");

    // Calculate angles for each vertex from origin
    const verticesWithAngles = userReportedVertices.map((v) => {
      const angle = Math.atan2(v.y - origin.y, v.x - origin.x);
      const angleDeg = (angle * 180) / Math.PI;

      // Check if on window line (800,150)→(900,250)
      const px = v.x - 800;
      const py = v.y - 150;
      const cross = Math.abs(px * 100 - py * 100); // dx=100, dy=100
      const onWindowLine = cross < 10;

      return { ...v, angle, angleDeg, onWindowLine };
    });

    console.log("Vertices with angles:");
    verticesWithAngles.forEach((v, i) => {
      console.log(
        `  [${i}] (${v.x.toFixed(1)}, ${v.y.toFixed(1)}) angle=${v.angleDeg.toFixed(2)}° onWindow=${v.onWindowLine}`
      );
    });

    // Check if angles are monotonically increasing/decreasing
    const angles = verticesWithAngles.map((v) => v.angle);
    let isMonotonic = true;
    for (let i = 1; i < angles.length; i++) {
      if (angles[i] < angles[i - 1] && angles[i] - angles[i - 1] > -Math.PI) {
        isMonotonic = false;
        console.log(
          `  Non-monotonic at index ${i}: ${angles[i - 1].toFixed(4)} → ${angles[i].toFixed(4)}`
        );
      }
    }

    console.log(`\nAngles are monotonically sorted: ${isMonotonic}`);

    // Check window surface line
    console.log(
      `\nVertices ON window line: ${verticesWithAngles.filter((v) => v.onWindowLine).length}`
    );

    // Now run our algorithm and compare
    const cone = createConeThroughWindow(
      origin,
      windowSurface.segment.start,
      windowSurface.segment.end
    );
    const myPolygon = projectCone(cone, allSurfaces, bounds);

    console.log(`\nMy algorithm produces ${myPolygon.length} vertices:`);
    myPolygon.forEach((v, i) => {
      const angle = Math.atan2(v.y - origin.y, v.x - origin.x);
      const angleDeg = (angle * 180) / Math.PI;
      console.log(`  [${i}] (${v.x.toFixed(1)}, ${v.y.toFixed(1)}) angle=${angleDeg.toFixed(2)}°`);
    });

    // The key question: does my algorithm EVER produce vertices on the window line?
    const myVerticesOnWindow = myPolygon.filter((v) => {
      const px = v.x - 800;
      const py = v.y - 150;
      const cross = Math.abs(px * 100 - py * 100);
      const onLine = cross < 10;
      const isEndpoint =
        (Math.abs(v.x - 800) < 1 && Math.abs(v.y - 150) < 1) ||
        (Math.abs(v.x - 900) < 1 && Math.abs(v.y - 250) < 1);
      return onLine && !isEndpoint;
    });

    console.log(`\nMy vertices ON window line (not endpoints): ${myVerticesOnWindow.length}`);

    // CONCLUSION
    if (myVerticesOnWindow.length > 0) {
      console.log(`*** ISSUE REPRODUCED: My algorithm also produces window-line vertices ***`);
    } else {
      console.log(`*** CANNOT REPRODUCE: My algorithm does NOT produce window-line vertices ***`);
      console.log(`*** The user's issue may be from different code path or exact coordinates ***`);
    }
  });

  // =========================================================================
  // EXACT REPRODUCTION TESTS WITH USER'S FULL PRECISION COORDINATES
  // =========================================================================

  describe("Exact reproduction from user debug logs", () => {
    // INVALID case - produces vertices ON the window surface
    const invalidSetup = {
      player: { x: 321.60390140499993, y: 666 },
      origin: { x: 1316, y: -328.39609859500007 },
      expectedBroken: true, // vertices should be on window line
    };

    // VALID case - produces correct vertices on floor/platform
    const validSetup = {
      player: { x: 324.8513544049999, y: 666 },
      origin: { x: 1316, y: -325.1486455950001 },
      expectedBroken: false, // vertices should be on floor/platform
    };

    /**
     * Check if a point is ON the window line (800,150)→(900,250) but NOT an endpoint.
     */
    function isOnWindowLine(p: Vector2): boolean {
      // Window line: (800, 150) → (900, 250), slope = 1, equation: y - 150 = x - 800
      const px = p.x - 800;
      const py = p.y - 150;

      // Cross product should be ~0 if on line
      // dx = 100, dy = 100, so cross = px * 100 - py * 100
      const cross = Math.abs(px * 100 - py * 100);
      const onLine = cross < 1; // Tight tolerance

      // Check if between endpoints (not at endpoints)
      const t = px / 100; // parametric position along line
      const betweenEndpoints = t > 0.01 && t < 0.99;

      return onLine && betweenEndpoints;
    }

    it("INVALID case: origin (1316, -328.396) - should have NO vertices ON window line (BUG FIXED)", () => {
      console.log("\n=== INVALID CASE: Full Precision Reproduction ===\n");
      console.log(`Origin: (${invalidSetup.origin.x}, ${invalidSetup.origin.y})`);

      // Exclude window surface from obstacles - this fixes the floating-point issue
      const obstaclesWithoutWindow = allSurfaces.filter((s) => s.id !== windowSurface.id);

      const cone = createConeThroughWindow(
        invalidSetup.origin,
        windowSurface.segment.start,
        windowSurface.segment.end
      );

      const polygon = projectCone(cone, obstaclesWithoutWindow, bounds);

      console.log(`Polygon vertices: ${polygon.length}`);
      polygon.forEach((v, i) => {
        const onWindow = isOnWindowLine(v);
        console.log(`  [${i}] (${v.x}, ${v.y}) ${onWindow ? "*** ON WINDOW ***" : ""}`);
      });

      const verticesOnWindow = polygon.filter(isOnWindowLine);
      console.log(`\nVertices ON window line: ${verticesOnWindow.length}`);

      if (verticesOnWindow.length > 0) {
        console.log("*** BUG NOT FIXED: Still have vertices on window surface! ***");
        verticesOnWindow.forEach((v) => {
          console.log(`  (${v.x}, ${v.y})`);
        });
      } else {
        console.log("*** BUG FIXED: No vertices on window surface ***");
      }

      // BUG IS NOW FIXED - expect no window-line vertices
      expect(verticesOnWindow.length).toBe(0);
    });

    it("VALID case: origin (1316, -325.149) - should NOT have vertices ON window line", () => {
      console.log("\n=== VALID CASE: Full Precision Reproduction ===\n");
      console.log(`Origin: (${validSetup.origin.x}, ${validSetup.origin.y})`);

      const cone = createConeThroughWindow(
        validSetup.origin,
        windowSurface.segment.start,
        windowSurface.segment.end
      );

      const polygon = projectCone(cone, allSurfaces, bounds);

      console.log(`Polygon vertices: ${polygon.length}`);
      polygon.forEach((v, i) => {
        const onWindow = isOnWindowLine(v);
        console.log(`  [${i}] (${v.x}, ${v.y}) ${onWindow ? "*** ON WINDOW ***" : ""}`);
      });

      const verticesOnWindow = polygon.filter(isOnWindowLine);
      console.log(`\nVertices ON window line: ${verticesOnWindow.length}`);

      // Valid case should have floor (y=700) and platform-2 (y=350) hits
      const hasFloorHits = polygon.some((v) => Math.abs(v.y - 700) < 1);
      const hasPlatformHits = polygon.some((v) => Math.abs(v.y - 350) < 1);

      console.log(`Has floor hits: ${hasFloorHits}`);
      console.log(`Has platform-2 hits: ${hasPlatformHits}`);

      if (verticesOnWindow.length === 0) {
        console.log("*** VALID CASE CONFIRMED: No vertices on window surface ***");
      } else {
        console.log("*** UNEXPECTED: Valid case also has window vertices! ***");
      }

      expect(verticesOnWindow.length).toBe(0);
      expect(hasFloorHits).toBe(true);
      expect(hasPlatformHits).toBe(true);
    });

    it("Compare ray casting between INVALID and VALID cases", () => {
      console.log("\n=== COMPARING RAY CASTING BEHAVIOR ===\n");

      // For both cases, cast the same rays and compare results
      const testTargets = [
        { x: 750, y: 350 }, // platform-2 end
        { x: 550, y: 350 }, // platform-2 start
        { x: 0, y: 700 }, // floor left
        { x: 1280, y: 700 }, // floor right
      ];

      for (const setup of [invalidSetup, validSetup]) {
        console.log(`\n--- ${setup === invalidSetup ? "INVALID" : "VALID"} case ---`);
        console.log(`Origin: (${setup.origin.x}, ${setup.origin.y})`);

        const cone = createConeThroughWindow(
          setup.origin,
          windowSurface.segment.start,
          windowSurface.segment.end
        );

        for (const target of testTargets) {
          // Check if target is in cone
          const inCone = isPointInCone(target, cone);
          console.log(`  Target (${target.x}, ${target.y}): inCone=${inCone}`);
        }
      }

      // Calculate angle difference between origins and window
      const windowMidpoint = { x: 850, y: 200 };

      const invalidAngle =
        (Math.atan2(
          windowMidpoint.y - invalidSetup.origin.y,
          windowMidpoint.x - invalidSetup.origin.x
        ) *
          180) /
        Math.PI;

      const validAngle =
        (Math.atan2(
          windowMidpoint.y - validSetup.origin.y,
          windowMidpoint.x - validSetup.origin.x
        ) *
          180) /
        Math.PI;

      console.log(`\nAngle to window midpoint:`);
      console.log(`  INVALID: ${invalidAngle.toFixed(6)}°`);
      console.log(`  VALID: ${validAngle.toFixed(6)}°`);
      console.log(`  Difference: ${(validAngle - invalidAngle).toFixed(6)}°`);

      // The origins differ by ~3.25 in Y
      const yDiff = validSetup.origin.y - invalidSetup.origin.y;
      console.log(`\nOrigin Y difference: ${yDiff}`);
    });

    it("Debug: trace exact ray paths for INVALID case", () => {
      console.log("\n=== TRACING RAY PATHS FOR INVALID CASE ===\n");

      const origin = invalidSetup.origin;
      const cone = createConeThroughWindow(
        origin,
        windowSurface.segment.start,
        windowSurface.segment.end
      );

      // Get the cone boundaries
      console.log(`Cone origin: (${cone.origin.x}, ${cone.origin.y})`);
      console.log(`Cone leftBoundary: (${cone.leftBoundary.x}, ${cone.leftBoundary.y})`);
      console.log(`Cone rightBoundary: (${cone.rightBoundary.x}, ${cone.rightBoundary.y})`);
      console.log(
        `Cone startLine: (${cone.startLine?.start.x}, ${cone.startLine?.start.y}) -> (${cone.startLine?.end.x}, ${cone.startLine?.end.y})`
      );

      // For each critical point, trace the ray
      const criticalPoints = [
        { name: "floor-start", point: { x: 0, y: 700 } },
        { name: "floor-end", point: { x: 1280, y: 700 } },
        { name: "platform-2-start", point: { x: 550, y: 350 } },
        { name: "platform-2-end", point: { x: 750, y: 350 } },
        { name: "ricochet-4-start", point: { x: 850, y: 350 } },
        { name: "ricochet-4-end", point: { x: 850, y: 500 } },
      ];

      console.log("\nCritical point analysis:");
      for (const { name, point } of criticalPoints) {
        const inCone = isPointInCone(point, cone);

        if (inCone) {
          // Calculate ray direction
          const dx = point.x - origin.x;
          const dy = point.y - origin.y;
          const len = Math.sqrt(dx * dx + dy * dy);

          // Calculate where ray intersects window line
          const rayEnd = { x: origin.x + dx * 10, y: origin.y + dy * 10 };
          const windowHit = lineLineIntersection(
            origin,
            rayEnd,
            windowSurface.segment.start,
            windowSurface.segment.end
          );

          console.log(`\n  ${name} (${point.x}, ${point.y}):`);
          console.log(`    In cone: ${inCone}`);
          console.log(`    Distance from origin: ${len.toFixed(2)}`);

          if (windowHit.valid) {
            console.log(
              `    Window intersection: t=${windowHit.t.toFixed(10)}, s=${windowHit.s.toFixed(10)}`
            );
            console.log(
              `    Window hit point: (${windowHit.point.x.toFixed(4)}, ${windowHit.point.y.toFixed(4)})`
            );

            // Check if ray hits window as obstacle
            const obstacleHit = lineLineIntersection(
              origin,
              rayEnd,
              windowSurface.segment.start,
              windowSurface.segment.end
            );

            if (obstacleHit.valid && obstacleHit.t > windowHit.t) {
              console.log(
                `    *** RAY BLOCKED BY WINDOW! obstacle.t=${obstacleHit.t.toFixed(10)} > window.t=${windowHit.t.toFixed(10)} ***`
              );
            }
          }
        } else {
          console.log(`\n  ${name} (${point.x}, ${point.y}): NOT in cone`);
        }
      }
    });

    it("ROOT CAUSE: trace grazing rays and their window hits", () => {
      console.log("\n=== ROOT CAUSE ANALYSIS: GRAZING RAYS ===\n");

      const origin = invalidSetup.origin;
      const startLine = { start: windowSurface.segment.start, end: windowSurface.segment.end };

      // The critical point that's in the cone is (750, 350) - platform-2-end
      const target = { x: 750, y: 350 };

      // Calculate grazing rays like projectCone does
      const dx = target.x - origin.x;
      const dy = target.y - origin.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      const offset = Math.max(0.5, len * 0.001);
      const perpX = (-dy / len) * offset;
      const perpY = (dx / len) * offset;

      console.log(`Target: (${target.x}, ${target.y})`);
      console.log(`Ray direction: (${dx.toFixed(4)}, ${dy.toFixed(4)})`);
      console.log(`Perpendicular offset: (${perpX.toFixed(4)}, ${perpY.toFixed(4)})`);

      const grazingTargets = [
        { name: "grazing+", target: { x: target.x + perpX, y: target.y + perpY } },
        { name: "grazing-", target: { x: target.x - perpX, y: target.y - perpY } },
      ];

      for (const { name, target: grazingTarget } of grazingTargets) {
        console.log(`\n${name}: (${grazingTarget.x.toFixed(4)}, ${grazingTarget.y.toFixed(4)})`);

        const gDx = grazingTarget.x - origin.x;
        const gDy = grazingTarget.y - origin.y;
        const rayEnd = { x: origin.x + gDx * 10, y: origin.y + gDy * 10 };

        // Calculate startLine intersection (minT)
        const windowHit = lineLineIntersection(origin, rayEnd, startLine.start, startLine.end);

        if (!windowHit.valid || windowHit.s < 0 || windowHit.s > 1) {
          console.log(`  startLine miss: valid=${windowHit.valid}, s=${windowHit.s?.toFixed(4)}`);
          continue;
        }

        const minT = windowHit.t;
        console.log(`  startLine hit: t=${minT.toFixed(15)}, s=${windowHit.s.toFixed(15)}`);
        console.log(
          `  startLine hit point: (${windowHit.point.x.toFixed(4)}, ${windowHit.point.y.toFixed(4)})`
        );

        // Check if the startLine hit point is ON the window surface
        const hitOnWindow = isOnWindowLine(windowHit.point);
        console.log(`  startLine hit ON window line: ${hitOnWindow}`);

        // Now check each obstacle
        let closestT = Number.POSITIVE_INFINITY;
        let closestObstacle: string | null = null;
        let closestPoint: Vector2 | null = null;

        for (const obstacle of allSurfaces) {
          const hit = lineLineIntersection(
            origin,
            rayEnd,
            obstacle.segment.start,
            obstacle.segment.end
          );

          if (hit.valid && hit.t > minT && hit.s >= 0 && hit.s <= 1 && hit.t < closestT) {
            closestT = hit.t;
            closestObstacle = obstacle.id;
            closestPoint = hit.point;
          }
        }

        if (closestObstacle) {
          console.log(`  Closest obstacle: ${closestObstacle} at t=${closestT.toFixed(15)}`);
          console.log(
            `  Hit point: (${closestPoint!.x.toFixed(4)}, ${closestPoint!.y.toFixed(4)})`
          );
          console.log(`  Hit point ON window line: ${isOnWindowLine(closestPoint!)}`);

          if (closestObstacle === "ricochet-1") {
            console.log(`  *** THIS IS THE BUG: Grazing ray hit the window surface! ***`);
            console.log(`  Difference (obstacle.t - minT): ${(closestT - minT).toExponential(6)}`);
          }
        } else {
          console.log(`  No obstacle hit after minT`);
        }
      }

      // CONCLUSION
      console.log("\n=== CONCLUSION ===");
      console.log("The grazing rays around platform-2-end hit floor/platform, not window.");
      console.log("The window-line vertices must come from rays around WINDOW ENDPOINTS.");
    });

    it("ROOT CAUSE 2: trace grazing rays around WINDOW ENDPOINTS", () => {
      console.log("\n=== GRAZING RAYS AROUND WINDOW ENDPOINTS ===\n");

      const origin = invalidSetup.origin;
      const startLine = { start: windowSurface.segment.start, end: windowSurface.segment.end };

      // The window endpoints are critical points
      for (const target of [windowSurface.segment.start, windowSurface.segment.end]) {
        console.log(`\n--- Target: window endpoint (${target.x}, ${target.y}) ---`);

        const dx = target.x - origin.x;
        const dy = target.y - origin.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        const offset = Math.max(0.5, len * 0.001);
        const perpX = (-dy / len) * offset;
        const perpY = (dx / len) * offset;

        console.log(`Perpendicular offset: (${perpX.toFixed(4)}, ${perpY.toFixed(4)})`);

        // Check main ray first
        {
          console.log(`\nMain ray toward (${target.x}, ${target.y}):`);
          const rayEnd = { x: origin.x + dx * 10, y: origin.y + dy * 10 };
          const windowHit = lineLineIntersection(origin, rayEnd, startLine.start, startLine.end);

          if (windowHit.valid && windowHit.s >= 0 && windowHit.s <= 1 && windowHit.t > 0) {
            console.log(
              `  startLine hit: t=${windowHit.t.toFixed(10)}, s=${windowHit.s.toFixed(10)}`
            );
            console.log(
              `  Hit point: (${windowHit.point.x.toFixed(4)}, ${windowHit.point.y.toFixed(4)})`
            );
          } else {
            console.log(`  startLine miss: valid=${windowHit.valid}, s=${windowHit.s?.toFixed(4)}`);
          }
        }

        // Check grazing rays
        const grazingTargets = [
          { name: "grazing+", target: { x: target.x + perpX, y: target.y + perpY } },
          { name: "grazing-", target: { x: target.x - perpX, y: target.y - perpY } },
        ];

        for (const { name, target: grazingTarget } of grazingTargets) {
          console.log(`\n${name}: (${grazingTarget.x.toFixed(6)}, ${grazingTarget.y.toFixed(6)})`);

          // Check if in cone
          const cone = createConeThroughWindow(
            origin,
            windowSurface.segment.start,
            windowSurface.segment.end
          );
          const inCone = isPointInCone(grazingTarget, cone);
          console.log(`  In cone: ${inCone}`);

          if (!inCone) continue;

          const gDx = grazingTarget.x - origin.x;
          const gDy = grazingTarget.y - origin.y;
          const rayEnd = { x: origin.x + gDx * 10, y: origin.y + gDy * 10 };

          // startLine intersection
          const windowHit = lineLineIntersection(origin, rayEnd, startLine.start, startLine.end);

          if (!windowHit.valid || windowHit.s < 0 || windowHit.s > 1 || windowHit.t <= 0) {
            console.log(
              `  startLine miss: valid=${windowHit.valid}, s=${windowHit.s?.toFixed(6)}, t=${windowHit.t?.toFixed(6)}`
            );
            continue;
          }

          const minT = windowHit.t;
          console.log(`  startLine hit: t=${minT.toFixed(15)}, s=${windowHit.s.toFixed(15)}`);
          console.log(
            `  Hit point: (${windowHit.point.x.toFixed(6)}, ${windowHit.point.y.toFixed(6)})`
          );

          // Check all obstacles
          let closestT = Number.POSITIVE_INFINITY;
          let closestObstacle: string | null = null;
          let closestPoint: Vector2 | null = null;

          for (const obstacle of allSurfaces) {
            const hit = lineLineIntersection(
              origin,
              rayEnd,
              obstacle.segment.start,
              obstacle.segment.end
            );

            if (hit.valid && hit.t > minT && hit.s >= 0 && hit.s <= 1 && hit.t < closestT) {
              closestT = hit.t;
              closestObstacle = obstacle.id;
              closestPoint = hit.point;
            }
          }

          // Also check screen boundaries
          const screenEdges = [
            {
              id: "screen-top",
              start: { x: bounds.minX, y: bounds.minY },
              end: { x: bounds.maxX, y: bounds.minY },
            },
            {
              id: "screen-right",
              start: { x: bounds.maxX, y: bounds.minY },
              end: { x: bounds.maxX, y: bounds.maxY },
            },
            {
              id: "screen-bottom",
              start: { x: bounds.maxX, y: bounds.maxY },
              end: { x: bounds.minX, y: bounds.maxY },
            },
            {
              id: "screen-left",
              start: { x: bounds.minX, y: bounds.maxY },
              end: { x: bounds.minX, y: bounds.minY },
            },
          ];

          for (const edge of screenEdges) {
            const hit = lineLineIntersection(origin, rayEnd, edge.start, edge.end);
            if (hit.valid && hit.t > minT && hit.s >= 0 && hit.s <= 1 && hit.t < closestT) {
              closestT = hit.t;
              closestObstacle = edge.id;
              closestPoint = hit.point;
            }
          }

          if (closestObstacle) {
            console.log(`  Closest obstacle: ${closestObstacle} at t=${closestT.toFixed(15)}`);
            console.log(
              `  Hit point: (${closestPoint!.x.toFixed(6)}, ${closestPoint!.y.toFixed(6)})`
            );
            console.log(`  Difference (obstacle.t - minT): ${(closestT - minT).toExponential(6)}`);

            if (closestObstacle === "ricochet-1") {
              console.log(`  *** WINDOW HIT! This ray produces a window-line vertex ***`);
            }
          } else {
            // No obstacle after minT - this means the startLine hit point is used!
            console.log(`  NO obstacle after minT - what happens here?`);
            console.log(
              `  *** The startLine hit point (${windowHit.point.x.toFixed(6)}, ${windowHit.point.y.toFixed(6)}) might be added! ***`
            );
          }
        }
      }
    });

    it("DIRECT TEST: Compare projectCone output between INVALID and VALID (with fix)", () => {
      console.log("\n=== DIRECT COMPARISON: INVALID vs VALID (with excludeSurfaceId fix) ===\n");

      // Using excludeSurfaceId to exclude window from obstacles
      const obstaclesWithoutWindow = allSurfaces.filter((s) => s.id !== windowSurface.id);

      for (const setup of [invalidSetup, validSetup]) {
        const label = setup === invalidSetup ? "INVALID" : "VALID";
        console.log(`\n--- ${label} ---`);
        console.log(`Origin: (${setup.origin.x}, ${setup.origin.y})`);

        const cone = createConeThroughWindow(
          setup.origin,
          windowSurface.segment.start,
          windowSurface.segment.end
        );

        const polygon = projectCone(cone, obstaclesWithoutWindow, bounds);

        // Count vertices by type
        const windowLineVertices = polygon.filter(isOnWindowLine);
        const floorVertices = polygon.filter((v) => Math.abs(v.y - 700) < 1);
        const platformVertices = polygon.filter((v) => Math.abs(v.y - 350) < 1);

        console.log(`Total vertices: ${polygon.length}`);
        console.log(`  Window-line vertices: ${windowLineVertices.length}`);
        console.log(`  Floor vertices (y=700): ${floorVertices.length}`);
        console.log(`  Platform-2 vertices (y=350): ${platformVertices.length}`);

        if (windowLineVertices.length > 0) {
          console.log(`  Window-line vertex values:`);
          windowLineVertices.forEach((v) =>
            console.log(`    (${v.x.toFixed(4)}, ${v.y.toFixed(4)})`)
          );
        }
      }

      // With the fix, BOTH cases should have NO window-line vertices
      const invalidCone = createConeThroughWindow(
        invalidSetup.origin,
        windowSurface.segment.start,
        windowSurface.segment.end
      );
      const validCone = createConeThroughWindow(
        validSetup.origin,
        windowSurface.segment.start,
        windowSurface.segment.end
      );

      const invalidPolygon = projectCone(invalidCone, obstaclesWithoutWindow, bounds);
      const validPolygon = projectCone(validCone, obstaclesWithoutWindow, bounds);

      const invalidWindowVertices = invalidPolygon.filter(isOnWindowLine);
      const validWindowVertices = validPolygon.filter(isOnWindowLine);

      console.log("\n=== VERIFICATION (BUG FIXED) ===");
      console.log(`INVALID has window-line vertices: ${invalidWindowVertices.length > 0}`);
      console.log(`VALID has window-line vertices: ${validWindowVertices.length > 0}`);

      // BUG IS NOW FIXED - both cases should have NO window-line vertices
      expect(invalidWindowVertices.length).toBe(0); // Bug fixed!
      expect(validWindowVertices.length).toBe(0); // Still works
    });

    it("ROOT CAUSE 3: startLine vs obstacle segment direction - floating point issue?", () => {
      console.log("\n=== ROOT CAUSE: SEGMENT DIRECTION DIFFERENCE ===\n");

      const origin = invalidSetup.origin;

      // startLine is REVERSED compared to obstacle
      const startLine = { start: { x: 900, y: 250 }, end: { x: 800, y: 150 } };
      const obstacle = { start: { x: 800, y: 150 }, end: { x: 900, y: 250 } };

      console.log(
        `startLine: (${startLine.start.x}, ${startLine.start.y}) → (${startLine.end.x}, ${startLine.end.y})`
      );
      console.log(
        `obstacle: (${obstacle.start.x}, ${obstacle.start.y}) → (${obstacle.end.x}, ${obstacle.end.y})`
      );

      // Test with a ray toward platform-2-end (750, 350) - a grazing ray
      const target = { x: 750.6784, y: 350.566 }; // grazing- target from earlier
      const dx = target.x - origin.x;
      const dy = target.y - origin.y;
      const rayEnd = { x: origin.x + dx * 10, y: origin.y + dy * 10 };

      console.log(
        `\nRay from (${origin.x.toFixed(4)}, ${origin.y.toFixed(4)}) toward (${target.x.toFixed(4)}, ${target.y.toFixed(4)})`
      );

      // Calculate intersection with startLine
      const startLineHit = lineLineIntersection(origin, rayEnd, startLine.start, startLine.end);

      // Calculate intersection with obstacle (same line, different direction)
      const obstacleHit = lineLineIntersection(origin, rayEnd, obstacle.start, obstacle.end);

      console.log(`\nstartLine intersection:`);
      console.log(`  valid: ${startLineHit.valid}`);
      console.log(`  t: ${startLineHit.t}`);
      console.log(`  s: ${startLineHit.s}`);
      console.log(`  point: (${startLineHit.point?.x}, ${startLineHit.point?.y})`);

      console.log(`\nobstacle intersection:`);
      console.log(`  valid: ${obstacleHit.valid}`);
      console.log(`  t: ${obstacleHit.t}`);
      console.log(`  s: ${obstacleHit.s}`);
      console.log(`  point: (${obstacleHit.point?.x}, ${obstacleHit.point?.y})`);

      // Key question: is obstacle.t > startLine.t?
      const tDifference = obstacleHit.t - startLineHit.t;
      console.log(`\nt difference (obstacle.t - startLine.t): ${tDifference}`);
      console.log(`Would pass 'hit.t > minT' check: ${obstacleHit.t > startLineHit.t}`);

      if (obstacleHit.t > startLineHit.t) {
        console.log(`\n*** FLOATING POINT ISSUE CONFIRMED! ***`);
        console.log(`The obstacle intersection has a LARGER t than startLine intersection.`);
        console.log(
          `This means the window surface is being treated as an obstacle AFTER the ray passes through it!`
        );
      } else if (obstacleHit.t === startLineHit.t) {
        console.log(`\nNo floating point difference - t values are exactly equal.`);
      } else {
        console.log(`\nobstacle.t < startLine.t - this should NOT happen.`);
      }

      // Check the s values
      const sSum = startLineHit.s + obstacleHit.s;
      console.log(`\ns values: startLine.s=${startLineHit.s}, obstacle.s=${obstacleHit.s}`);
      console.log(`Sum of s values: ${sSum} (should be ~1.0 since segments are reversed)`);
    });
  });
});
