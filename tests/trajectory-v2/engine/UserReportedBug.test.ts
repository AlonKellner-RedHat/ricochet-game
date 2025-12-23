/**
 * User-reported bug test
 *
 * This test reproduces an issue with the reflection chain bypass logic.
 */

import { describe, expect, it } from "vitest";
import { evaluateBypass } from "@/trajectory-v2/engine/BypassEvaluator";
import { calculatePlannedPath } from "@/trajectory-v2/engine/PlannedPathCalculator";
import { calculateActualPath, getInitialDirection } from "@/trajectory-v2/engine/ActualPathCalculator";
import { findDivergence } from "@/trajectory-v2/engine/DivergenceDetector";
import { isOnReflectiveSide } from "@/trajectory-v2/engine/ValidityChecker";
import { buildForwardImages, buildBackwardImages, getCursorImageForSurface } from "@/trajectory-v2/engine/ImageCache";
import { lineLineIntersection } from "@/trajectory-v2/geometry/GeometryOps";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

/**
 * Helper to create a test surface.
 */
function createTestSurface(config: {
  id: string;
  start: Vector2;
  end: Vector2;
  canReflect: boolean;
}): Surface {
  const { id, start, end, canReflect } = config;

  const computeNormal = () => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return { x: 0, y: 1 };
    return { x: -dy / len, y: dx / len };
  };

  return {
    id,
    segment: { start, end },
    surfaceType: canReflect ? "ricochet" : "wall",
    onArrowHit: () => ({ type: canReflect ? "reflect" : "stop" }),
    isPlannable: () => canReflect,
    getVisualProperties: () => ({ color: 0xffffff, lineWidth: 2, alpha: 1 }),
    getNormal: computeNormal,
    canReflectFrom: (arrowDir) => {
      if (!canReflect) return false;
      const normal = computeNormal();
      const dot = arrowDir.x * normal.x + arrowDir.y * normal.y;
      return dot < 0;
    },
  };
}

describe("User Reported Bug - Reflection Chain Bypass", () => {
  // Setup 1 from debug log - reflection chain bypass issue
  const player: Vector2 = { x: 748.1195593000004, y: 666 };
  const cursor: Vector2 = { x: 737.7496197830452, y: 206.50095602294454 };

  const plannedSurfaces: Surface[] = [
    createTestSurface({
      id: "ricochet-4",
      start: { x: 850, y: 350 },
      end: { x: 850, y: 500 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-1",
      start: { x: 800, y: 150 },
      end: { x: 900, y: 250 },
      canReflect: true,
    }),
  ];

  const allSurfaces: Surface[] = [
    createTestSurface({
      id: "floor",
      start: { x: 0, y: 700 },
      end: { x: 1280, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "ceiling",
      start: { x: 0, y: 80 },
      end: { x: 1280, y: 80 },
      canReflect: false,
    }),
    createTestSurface({
      id: "left-wall",
      start: { x: 20, y: 80 },
      end: { x: 20, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "right-wall",
      start: { x: 1260, y: 80 },
      end: { x: 1260, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "platform-1",
      start: { x: 300, y: 450 },
      end: { x: 500, y: 450 },
      canReflect: false,
    }),
    createTestSurface({
      id: "platform-2",
      start: { x: 550, y: 350 },
      end: { x: 750, y: 350 },
      canReflect: false,
    }),
    createTestSurface({
      id: "ricochet-1",
      start: { x: 800, y: 150 },
      end: { x: 900, y: 250 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-2",
      start: { x: 400, y: 250 },
      end: { x: 550, y: 250 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-3",
      start: { x: 100, y: 200 },
      end: { x: 200, y: 300 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-4",
      start: { x: 850, y: 350 },
      end: { x: 850, y: 500 },
      canReflect: true,
    }),
  ];

  it("should analyze the geometry of the planned surfaces", () => {
    const surface1 = plannedSurfaces[0]!; // ricochet-4
    const surface2 = plannedSurfaces[1]!; // ricochet-1

    console.log("=== GEOMETRY ANALYSIS ===");
    console.log("Player:", player);
    console.log("Cursor:", cursor);
    console.log("");

    // Surface 1 (ricochet-4)
    const normal1 = surface1.getNormal();
    console.log("Surface 1 (ricochet-4):");
    console.log("  Segment:", surface1.segment);
    console.log("  Normal:", normal1);
    console.log("  Player on reflective side:", isOnReflectiveSide(player, surface1));
    console.log("  Cursor on reflective side:", isOnReflectiveSide(cursor, surface1));
    console.log("");

    // Surface 2 (ricochet-1)
    const normal2 = surface2.getNormal();
    console.log("Surface 2 (ricochet-1):");
    console.log("  Segment:", surface2.segment);
    console.log("  Normal:", normal2);
    console.log("  Player on reflective side:", isOnReflectiveSide(player, surface2));
    console.log("  Cursor on reflective side:", isOnReflectiveSide(cursor, surface2));
    console.log("");
  });

  it("should evaluate bypass correctly", () => {
    console.log("=== BYPASS EVALUATION ===");

    const bypassResult = evaluateBypass(player, cursor, plannedSurfaces, allSurfaces);

    console.log("Active surfaces:", bypassResult.activeSurfaces.map((s) => s.id));
    console.log(
      "Bypassed surfaces:",
      bypassResult.bypassedSurfaces.map((b) => `${b.surface.id} (${b.reason})`)
    );

    // Log why each surface was or wasn't bypassed
    for (const surface of plannedSurfaces) {
      const isActive = bypassResult.activeSurfaces.some((s) => s.id === surface.id);
      const bypassed = bypassResult.bypassedSurfaces.find((b) => b.surface.id === surface.id);

      console.log(`\n${surface.id}:`);
      console.log(`  Active: ${isActive}`);
      if (bypassed) {
        console.log(`  Bypassed reason: ${bypassed.reason}`);
      }
    }
  });

  it("should calculate the reflection point on surface1 and check against surface2", () => {
    console.log("=== REFLECTION POINT ANALYSIS ===");

    const surface1 = plannedSurfaces[0]!;
    const surface2 = plannedSurfaces[1]!;

    // Build images to find the reflection point
    const playerImages = buildForwardImages(player, [surface1]);
    const cursorImages = buildBackwardImages(cursor, [surface1]);
    const cursorImage = getCursorImageForSurface(playerImages, cursorImages, 0);

    console.log("Player image at depth 0:", playerImages.original);
    console.log("Cursor image for surface 0:", cursorImage);

    // Calculate intersection with surface1's line
    const intersection = lineLineIntersection(
      player,
      cursorImage,
      surface1.segment.start,
      surface1.segment.end
    );

    if (intersection.valid) {
      console.log("\nReflection point on surface1:", intersection.point);
      console.log("Reflection point on reflective side of surface2:", isOnReflectiveSide(intersection.point, surface2));

      // This is the key check for 6.3 (Reflection Chain Rule)
      const onCorrectSide = isOnReflectiveSide(intersection.point, surface2);
      console.log(`\nFirst Principle 6.3 check: Is reflection point on correct side of surface2? ${onCorrectSide}`);
      if (!onCorrectSide) {
        console.log("  → Surface2 should be BYPASSED (reflection chain rule)");
      }
    } else {
      console.log("No valid intersection found");
    }
  });

  it("should check if reflection point is on-segment (with both surfaces)", () => {
    console.log("=== ON-SEGMENT CHECK (FULL CHAIN) ===");

    const surface1 = plannedSurfaces[0]!; // ricochet-4
    const bothSurfaces = plannedSurfaces;

    // Build images with BOTH surfaces (as the bypass evaluator does)
    const playerImages = buildForwardImages(player, bothSurfaces);
    const cursorImages = buildBackwardImages(cursor, bothSurfaces);
    
    // For surface 0, we need the cursor image for surface 0
    const cursorImage0 = getCursorImageForSurface(playerImages, cursorImages, 0);
    console.log("Player:", player);
    console.log("Cursor:", cursor);
    console.log("Cursor image for surface 0:", cursorImage0);

    const intersection = lineLineIntersection(
      player,
      cursorImage0,
      surface1.segment.start,
      surface1.segment.end
    );

    if (intersection.valid) {
      const point = intersection.point;
      const segment = surface1.segment;

      // Check if point is on segment
      const minY = Math.min(segment.start.y, segment.end.y);
      const maxY = Math.max(segment.start.y, segment.end.y);

      console.log("\nReflection point on surface1:", point);
      console.log("Segment Y range:", minY, "-", maxY);
      console.log("Point Y:", point.y);
      console.log("Is on segment:", point.y >= minY && point.y <= maxY);
      console.log("Distance from segment:", point.y < minY ? minY - point.y : point.y > maxY ? point.y - maxY : 0);

      // Now check if this point is on correct side of surface2
      const surface2 = plannedSurfaces[1]!;
      console.log("\nReflection point on correct side of surface2:", isOnReflectiveSide(point, surface2));
    }
  });

  it("should calculate planned and actual paths", () => {
    console.log("=== PATH CALCULATION ===");

    const bypassResult = evaluateBypass(player, cursor, plannedSurfaces, allSurfaces);
    const activeSurfaces = bypassResult.activeSurfaces;

    console.log("Active surfaces for path calculation:", activeSurfaces.map((s) => s.id));

    // Calculate planned path
    const plannedPath = calculatePlannedPath(player, cursor, activeSurfaces);
    console.log("\nPlanned path waypoints:");
    plannedPath.waypoints.forEach((wp, i) => {
      console.log(`  ${i}: (${wp.x.toFixed(2)}, ${wp.y.toFixed(2)})`);
    });
    console.log("Planned path hits:");
    plannedPath.hits.forEach((hit, i) => {
      console.log(`  ${i}: ${hit.surface.id} at (${hit.point.x.toFixed(2)}, ${hit.point.y.toFixed(2)}) onSegment=${hit.onSegment}`);
    });

    // Calculate initial direction
    let initialDirection: Vector2;
    if (activeSurfaces.length === 0) {
      initialDirection = getInitialDirection(player, cursor);
    } else {
      const playerImages = buildForwardImages(player, activeSurfaces);
      const cursorImages = buildBackwardImages(cursor, activeSurfaces);
      const cursorImage = getCursorImageForSurface(playerImages, cursorImages, 0);
      initialDirection = getInitialDirection(player, cursorImage);
    }
    console.log("\nInitial direction:", initialDirection);

    // Calculate actual path
    const actualPath = calculateActualPath(player, cursor, initialDirection, allSurfaces);
    console.log("\nActual path waypoints:");
    actualPath.waypoints.forEach((wp, i) => {
      console.log(`  ${i}: (${wp.x.toFixed(2)}, ${wp.y.toFixed(2)})`);
    });
    console.log("Actual path hits:");
    actualPath.hits.forEach((hit, i) => {
      console.log(`  ${i}: ${hit.surface.id} at (${hit.point.x.toFixed(2)}, ${hit.point.y.toFixed(2)}) onSegment=${hit.onSegment} reflected=${hit.reflected}`);
    });
    console.log("Reached cursor:", actualPath.reachedCursor);
    if (actualPath.blockedBy) {
      console.log("Blocked by:", actualPath.blockedBy.id);
    }

    // Calculate divergence
    const divergence = findDivergence(
      { waypoints: actualPath.waypoints },
      { waypoints: plannedPath.waypoints }
    );
    console.log("\nDivergence:");
    console.log("  Is aligned:", divergence.isAligned);
    console.log("  Segment index:", divergence.segmentIndex);
    if (divergence.point) {
      console.log("  Point:", divergence.point);
    }
  });
});

/**
 * Second reported bug: Solid path does not reach cursor
 */
describe("User Reported Bug 2 - Solid Path Not Reaching Cursor", () => {
  // Setup 2 from debug log
  const player2: Vector2 = { x: 633.783165200001, y: 666 };
  const cursor2: Vector2 = { x: 799.700195780222, y: 125.27724665391969 };

  const plannedSurfaces2: Surface[] = [
    createTestSurface({
      id: "ricochet-4",
      start: { x: 850, y: 350 },
      end: { x: 850, y: 500 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-1",
      start: { x: 800, y: 150 },
      end: { x: 900, y: 250 },
      canReflect: true,
    }),
  ];

  const allSurfaces2: Surface[] = [
    createTestSurface({
      id: "floor",
      start: { x: 0, y: 700 },
      end: { x: 1280, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "ceiling",
      start: { x: 0, y: 80 },
      end: { x: 1280, y: 80 },
      canReflect: false,
    }),
    createTestSurface({
      id: "left-wall",
      start: { x: 20, y: 80 },
      end: { x: 20, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "right-wall",
      start: { x: 1260, y: 80 },
      end: { x: 1260, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "platform-1",
      start: { x: 300, y: 450 },
      end: { x: 500, y: 450 },
      canReflect: false,
    }),
    createTestSurface({
      id: "platform-2",
      start: { x: 550, y: 350 },
      end: { x: 750, y: 350 },
      canReflect: false,
    }),
    createTestSurface({
      id: "ricochet-1",
      start: { x: 800, y: 150 },
      end: { x: 900, y: 250 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-2",
      start: { x: 400, y: 250 },
      end: { x: 550, y: 250 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-3",
      start: { x: 100, y: 200 },
      end: { x: 200, y: 300 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-4",
      start: { x: 850, y: 350 },
      end: { x: 850, y: 500 },
      canReflect: true,
    }),
  ];

  it("should analyze bypass and path calculation", () => {
    console.log("=== BUG 2: SOLID PATH NOT REACHING CURSOR ===");
    console.log("Player:", player2);
    console.log("Cursor:", cursor2);

    // Bypass evaluation
    const bypassResult = evaluateBypass(player2, cursor2, plannedSurfaces2, allSurfaces2);
    console.log("\nActive surfaces:", bypassResult.activeSurfaces.map((s) => s.id));
    console.log(
      "Bypassed surfaces:",
      bypassResult.bypassedSurfaces.map((b) => `${b.surface.id} (${b.reason})`)
    );

    const activeSurfaces = bypassResult.activeSurfaces;

    // Calculate planned path
    const plannedPath = calculatePlannedPath(player2, cursor2, activeSurfaces);
    console.log("\nPlanned path waypoints:");
    plannedPath.waypoints.forEach((wp, i) => {
      console.log(`  ${i}: (${wp.x.toFixed(2)}, ${wp.y.toFixed(2)})`);
    });
    console.log("Planned path hits:");
    plannedPath.hits.forEach((hit, i) => {
      console.log(`  ${i}: ${hit.surface.id} at (${hit.point.x.toFixed(2)}, ${hit.point.y.toFixed(2)}) onSegment=${hit.onSegment}`);
    });

    // Check if planned path reaches cursor
    const lastWaypoint = plannedPath.waypoints[plannedPath.waypoints.length - 1];
    const distToCursor = Math.sqrt(
      Math.pow(lastWaypoint!.x - cursor2.x, 2) + Math.pow(lastWaypoint!.y - cursor2.y, 2)
    );
    console.log("\nDistance from last waypoint to cursor:", distToCursor.toFixed(2));
    console.log("Planned path reaches cursor:", distToCursor < 1);

    // Calculate initial direction
    let initialDirection: Vector2;
    if (activeSurfaces.length === 0) {
      initialDirection = getInitialDirection(player2, cursor2);
    } else {
      const playerImages = buildForwardImages(player2, activeSurfaces);
      const cursorImages = buildBackwardImages(cursor2, activeSurfaces);
      const cursorImage = getCursorImageForSurface(playerImages, cursorImages, 0);
      initialDirection = getInitialDirection(player2, cursorImage);
    }
    console.log("\nInitial direction:", initialDirection);

    // Calculate actual path
    const actualPath = calculateActualPath(player2, cursor2, initialDirection, allSurfaces2);
    console.log("\nActual path waypoints:");
    actualPath.waypoints.forEach((wp, i) => {
      console.log(`  ${i}: (${wp.x.toFixed(2)}, ${wp.y.toFixed(2)})`);
    });
    console.log("Reached cursor:", actualPath.reachedCursor);
    if (actualPath.blockedBy) {
      console.log("Blocked by:", actualPath.blockedBy.id);
    }

    // Calculate divergence
    const divergence = findDivergence(
      { waypoints: actualPath.waypoints },
      { waypoints: plannedPath.waypoints }
    );
    console.log("\nDivergence:");
    console.log("  Is aligned:", divergence.isAligned);
    console.log("  Segment index:", divergence.segmentIndex);
  });

  it("should check the unified path structure", async () => {
    console.log("=== UNIFIED PATH STRUCTURE ===");

    // Import the unified path tracer
    const { tracePhysicalPath } = await import("@/trajectory-v2/engine/PathBuilder");

    const bypassResult = evaluateBypass(player2, cursor2, plannedSurfaces2, allSurfaces2);

    const unifiedPath = tracePhysicalPath(player2, cursor2, bypassResult, allSurfaces2);

    console.log("isFullyAligned:", unifiedPath.isFullyAligned);
    console.log("cursorReachable:", unifiedPath.cursorReachable);
    console.log("cursorSegmentIndex:", unifiedPath.cursorSegmentIndex);
    console.log("firstDivergedIndex:", unifiedPath.firstDivergedIndex);
    console.log("physicsDivergenceIndex:", unifiedPath.physicsDivergenceIndex);
    console.log("plannedSurfaceCount:", unifiedPath.plannedSurfaceCount);

    console.log("\nSegments:");
    unifiedPath.segments.forEach((seg, i) => {
      console.log(`  ${i}: (${seg.start.x.toFixed(2)}, ${seg.start.y.toFixed(2)}) → (${seg.end.x.toFixed(2)}, ${seg.end.y.toFixed(2)})`);
      console.log(`     planAlignment: ${seg.planAlignment}, endSurface: ${seg.endSurface?.id || "none"}`);
      console.log(`     termination: ${JSON.stringify(seg.termination)}`);
    });

    if (unifiedPath.actualPhysicsSegments) {
      console.log("\nActual physics segments:");
      unifiedPath.actualPhysicsSegments.forEach((seg, i) => {
        console.log(`  ${i}: (${seg.start.x.toFixed(2)}, ${seg.start.y.toFixed(2)}) → (${seg.end.x.toFixed(2)}, ${seg.end.y.toFixed(2)})`);
      });
    }
  });

  it("should render solid red path to cursor", async () => {
    console.log("=== RENDER OUTPUT ===");

    const { tracePhysicalPath } = await import("@/trajectory-v2/engine/PathBuilder");
    const { deriveRender } = await import("@/trajectory-v2/engine/RenderDeriver");

    const bypassResult = evaluateBypass(player2, cursor2, plannedSurfaces2, allSurfaces2);
    const unifiedPath = tracePhysicalPath(player2, cursor2, bypassResult, allSurfaces2);

    const renderOutput = deriveRender(
      unifiedPath,
      cursor2,
      allSurfaces2,
      bypassResult.activeSurfaces
    );

    console.log("isAligned:", renderOutput.isAligned);
    console.log("\nRender segments:");
    renderOutput.segments.forEach((seg, i) => {
      console.log(`  ${i}: (${seg.start.x.toFixed(2)}, ${seg.start.y.toFixed(2)}) → (${seg.end.x.toFixed(2)}, ${seg.end.y.toFixed(2)}) [${seg.style} ${seg.color}]`);
    });

    // Check that there's a solid red segment that reaches the cursor
    const solidRedSegments = renderOutput.segments.filter(
      (seg) => seg.style === "solid" && seg.color === "red"
    );
    console.log("\nSolid red segments:", solidRedSegments.length);

    // Check if any solid red segment ends at or near cursor
    const cursorReached = solidRedSegments.some((seg) => {
      const distToEnd = Math.sqrt(
        Math.pow(seg.end.x - cursor2.x, 2) + Math.pow(seg.end.y - cursor2.y, 2)
      );
      return distToEnd < 1;
    });
    console.log("Solid red path reaches cursor:", cursorReached);

    expect(cursorReached, "Solid red path should reach cursor").toBe(true);
  });

  it("FIRST PRINCIPLE: Solid paths before cursor, dashed paths after cursor", async () => {
    console.log("=== FIRST PRINCIPLE: SOLID BEFORE CURSOR, DASHED AFTER ===");

    const { tracePhysicalPath } = await import("@/trajectory-v2/engine/PathBuilder");
    const { deriveRender } = await import("@/trajectory-v2/engine/RenderDeriver");

    const bypassResult = evaluateBypass(player2, cursor2, plannedSurfaces2, allSurfaces2);
    const unifiedPath = tracePhysicalPath(player2, cursor2, bypassResult, allSurfaces2);

    const renderOutput = deriveRender(
      unifiedPath,
      cursor2,
      allSurfaces2,
      bypassResult.activeSurfaces
    );

    console.log("Cursor position:", cursor2);
    console.log("\nChecking each segment:");

    // For each segment, check if it's before or after cursor
    for (const seg of renderOutput.segments) {
      // Check if segment START is at or after cursor
      const startAtCursor = Math.sqrt(
        Math.pow(seg.start.x - cursor2.x, 2) + Math.pow(seg.start.y - cursor2.y, 2)
      ) < 1;

      const segDescription = `(${seg.start.x.toFixed(2)}, ${seg.start.y.toFixed(2)}) → (${seg.end.x.toFixed(2)}, ${seg.end.y.toFixed(2)})`;

      if (startAtCursor) {
        console.log(`  ${segDescription} [${seg.style} ${seg.color}] - STARTS AT CURSOR`);
        
        // FIRST PRINCIPLE: Segments starting at cursor must be DASHED (they're after cursor)
        expect(
          seg.style,
          `Segment starting at cursor should be dashed, not solid: ${segDescription}`
        ).toBe("dashed");
      } else {
        console.log(`  ${segDescription} [${seg.style} ${seg.color}]`);
      }
    }

    // Additional check: No solid segment should start at or after cursor
    const solidSegmentsStartingAtCursor = renderOutput.segments.filter((seg) => {
      const startAtCursor = Math.sqrt(
        Math.pow(seg.start.x - cursor2.x, 2) + Math.pow(seg.start.y - cursor2.y, 2)
      ) < 1;
      return startAtCursor && seg.style === "solid";
    });

    console.log("\nSolid segments starting at cursor:", solidSegmentsStartingAtCursor.length);
    expect(
      solidSegmentsStartingAtCursor.length,
      "No solid segments should start at cursor (they should be dashed)"
    ).toBe(0);
  });
});

/**
 * Third reported bug: Strange trajectory behavior
 */
describe("User Reported Bug 3 - Strange Trajectory", () => {
  const player3: Vector2 = { x: 649.341951066669, y: 666 };
  const cursor3: Vector2 = { x: 836.870541378528, y: 110.1338432122371 };

  const plannedSurfaces3: Surface[] = [
    createTestSurface({
      id: "ricochet-4",
      start: { x: 850, y: 350 },
      end: { x: 850, y: 500 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-1",
      start: { x: 800, y: 150 },
      end: { x: 900, y: 250 },
      canReflect: true,
    }),
  ];

  const allSurfaces3: Surface[] = [
    createTestSurface({
      id: "floor",
      start: { x: 0, y: 700 },
      end: { x: 1280, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "ceiling",
      start: { x: 0, y: 80 },
      end: { x: 1280, y: 80 },
      canReflect: false,
    }),
    createTestSurface({
      id: "left-wall",
      start: { x: 20, y: 80 },
      end: { x: 20, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "right-wall",
      start: { x: 1260, y: 80 },
      end: { x: 1260, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "platform-1",
      start: { x: 300, y: 450 },
      end: { x: 500, y: 450 },
      canReflect: false,
    }),
    createTestSurface({
      id: "platform-2",
      start: { x: 550, y: 350 },
      end: { x: 750, y: 350 },
      canReflect: false,
    }),
    createTestSurface({
      id: "ricochet-1",
      start: { x: 800, y: 150 },
      end: { x: 900, y: 250 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-2",
      start: { x: 400, y: 250 },
      end: { x: 550, y: 250 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-3",
      start: { x: 100, y: 200 },
      end: { x: 200, y: 300 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-4",
      start: { x: 850, y: 350 },
      end: { x: 850, y: 500 },
      canReflect: true,
    }),
  ];

  it("should analyze the situation", async () => {
    console.log("=== BUG 3: STRANGE TRAJECTORY ===");
    console.log("Player:", player3);
    console.log("Cursor:", cursor3);

    // Bypass evaluation
    const bypassResult = evaluateBypass(player3, cursor3, plannedSurfaces3, allSurfaces3);
    console.log("\nActive surfaces:", bypassResult.activeSurfaces.map((s) => s.id));
    console.log(
      "Bypassed surfaces:",
      bypassResult.bypassedSurfaces.map((b) => `${b.surface.id} (${b.reason})`)
    );

    // Planned path
    const plannedPath = calculatePlannedPath(player3, cursor3, bypassResult.activeSurfaces);
    console.log("\nPlanned path waypoints:");
    plannedPath.waypoints.forEach((wp, i) => {
      console.log(`  ${i}: (${wp.x.toFixed(2)}, ${wp.y.toFixed(2)})`);
    });
    console.log("Planned path hits:");
    plannedPath.hits.forEach((hit, i) => {
      console.log(`  ${i}: ${hit.surface.id} at (${hit.point.x.toFixed(2)}, ${hit.point.y.toFixed(2)}) onSegment=${hit.onSegment}`);
    });

    // Check if planned path reaches cursor
    const lastWaypoint = plannedPath.waypoints[plannedPath.waypoints.length - 1];
    if (lastWaypoint) {
      const distToCursor = Math.sqrt(
        Math.pow(lastWaypoint.x - cursor3.x, 2) + Math.pow(lastWaypoint.y - cursor3.y, 2)
      );
      console.log("\nDistance from last waypoint to cursor:", distToCursor.toFixed(2));
    }

    // Initial direction
    let initialDirection: Vector2;
    const activeSurfaces = bypassResult.activeSurfaces;
    if (activeSurfaces.length === 0) {
      initialDirection = getInitialDirection(player3, cursor3);
    } else {
      const playerImages = buildForwardImages(player3, activeSurfaces);
      const cursorImages = buildBackwardImages(cursor3, activeSurfaces);
      const cursorImage = getCursorImageForSurface(playerImages, cursorImages, 0);
      initialDirection = getInitialDirection(player3, cursorImage);
    }
    console.log("\nInitial direction:", initialDirection);

    // Actual path
    const actualPath = calculateActualPath(player3, cursor3, initialDirection, allSurfaces3);
    console.log("\nActual path waypoints:");
    actualPath.waypoints.forEach((wp, i) => {
      console.log(`  ${i}: (${wp.x.toFixed(2)}, ${wp.y.toFixed(2)})`);
    });
    console.log("Reached cursor:", actualPath.reachedCursor);
    if (actualPath.blockedBy) {
      console.log("Blocked by:", actualPath.blockedBy.id);
    }

    // Divergence
    const divergence = findDivergence(
      { waypoints: actualPath.waypoints },
      { waypoints: plannedPath.waypoints }
    );
    console.log("\nDivergence:");
    console.log("  Is aligned:", divergence.isAligned);
    console.log("  Segment index:", divergence.segmentIndex);
  });

  it("should check unified path and render output", async () => {
    console.log("=== UNIFIED PATH AND RENDER ===");

    const { tracePhysicalPath } = await import("@/trajectory-v2/engine/PathBuilder");
    const { deriveRender } = await import("@/trajectory-v2/engine/RenderDeriver");

    const bypassResult = evaluateBypass(player3, cursor3, plannedSurfaces3, allSurfaces3);
    const unifiedPath = tracePhysicalPath(player3, cursor3, bypassResult, allSurfaces3);

    console.log("isFullyAligned:", unifiedPath.isFullyAligned);
    console.log("cursorReachable:", unifiedPath.cursorReachable);
    console.log("cursorSegmentIndex:", unifiedPath.cursorSegmentIndex);
    console.log("firstDivergedIndex:", unifiedPath.firstDivergedIndex);
    console.log("physicsDivergenceIndex:", unifiedPath.physicsDivergenceIndex);

    console.log("\nSegments:");
    unifiedPath.segments.forEach((seg, i) => {
      console.log(`  ${i}: (${seg.start.x.toFixed(2)}, ${seg.start.y.toFixed(2)}) → (${seg.end.x.toFixed(2)}, ${seg.end.y.toFixed(2)})`);
      console.log(`     planAlignment: ${seg.planAlignment}, endSurface: ${seg.endSurface?.id || "none"}`);
    });

    const renderOutput = deriveRender(
      unifiedPath,
      cursor3,
      allSurfaces3,
      bypassResult.activeSurfaces
    );

    console.log("\nRender segments:");
    renderOutput.segments.forEach((seg, i) => {
      console.log(`  ${i}: (${seg.start.x.toFixed(2)}, ${seg.start.y.toFixed(2)}) → (${seg.end.x.toFixed(2)}, ${seg.end.y.toFixed(2)}) [${seg.style} ${seg.color}]`);
    });

    // Check for first principle violations
    console.log("\n=== FIRST PRINCIPLE CHECKS ===");

    // 1.5: Solid path must reach cursor
    const solidRedSegments = renderOutput.segments.filter(
      (seg) => seg.style === "solid" && seg.color === "red"
    );
    const solidGreenSegments = renderOutput.segments.filter(
      (seg) => seg.style === "solid" && seg.color === "green"
    );
    const allSolidSegments = [...solidGreenSegments, ...solidRedSegments];
    
    const cursorReached = allSolidSegments.some((seg) => {
      const distToEnd = Math.sqrt(
        Math.pow(seg.end.x - cursor3.x, 2) + Math.pow(seg.end.y - cursor3.y, 2)
      );
      return distToEnd < 1;
    });
    console.log("1.5 Solid path reaches cursor:", cursorReached);

    // 1.6: Segments after cursor should be dashed
    const solidSegmentsStartingAtCursor = renderOutput.segments.filter((seg) => {
      const startAtCursor = Math.sqrt(
        Math.pow(seg.start.x - cursor3.x, 2) + Math.pow(seg.start.y - cursor3.y, 2)
      ) < 1;
      return startAtCursor && seg.style === "solid";
    });
    console.log("1.6 Solid segments starting at cursor (should be 0):", solidSegmentsStartingAtCursor.length);

    // Check if player is connected to first segment
    const firstSegment = renderOutput.segments[0];
    if (firstSegment) {
      const playerConnected = Math.sqrt(
        Math.pow(firstSegment.start.x - player3.x, 2) + Math.pow(firstSegment.start.y - player3.y, 2)
      ) < 1;
      console.log("Path starts at player:", playerConnected);
    }

    // Check where red path starts
    const firstRedSegment = renderOutput.segments.find(
      (seg) => seg.color === "red" && seg.style === "solid"
    );
    if (firstRedSegment) {
      console.log("\nFirst solid red segment starts at:", firstRedSegment.start);
      
      // Divergence point should be end of segment 0 (834.52, 184.52)
      const divergencePoint = { x: 834.52, y: 184.52 };
      const distFromDivergence = Math.sqrt(
        Math.pow(firstRedSegment.start.x - divergencePoint.x, 2) +
        Math.pow(firstRedSegment.start.y - divergencePoint.y, 2)
      );
      console.log("Distance from divergence point:", distFromDivergence.toFixed(2));
      console.log("EXPECTED: ~0 (red should start at divergence point)");
    }
  });

});

/**
 * Fourth reported bug: Similar to bug 3, single planned surface
 */
describe("User Reported Bug 4 - Single Surface Divergence", () => {
  const player4: Vector2 = { x: 638.2171109195828, y: 666 };
  const cursor4: Vector2 = { x: 824.4804261790927, y: 121.1472275334608 };

  const plannedSurfaces4: Surface[] = [
    createTestSurface({
      id: "ricochet-4",
      start: { x: 850, y: 350 },
      end: { x: 850, y: 500 },
      canReflect: true,
    }),
  ];

  const allSurfaces4: Surface[] = [
    createTestSurface({
      id: "floor",
      start: { x: 0, y: 700 },
      end: { x: 1280, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "ceiling",
      start: { x: 0, y: 80 },
      end: { x: 1280, y: 80 },
      canReflect: false,
    }),
    createTestSurface({
      id: "left-wall",
      start: { x: 20, y: 80 },
      end: { x: 20, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "ricochet-1",
      start: { x: 800, y: 150 },
      end: { x: 900, y: 250 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-4",
      start: { x: 850, y: 350 },
      end: { x: 850, y: 500 },
      canReflect: true,
    }),
  ];

  it("should analyze the situation", async () => {
    console.log("=== BUG 4: SINGLE SURFACE DIVERGENCE ===");
    console.log("Player:", player4);
    console.log("Cursor:", cursor4);

    const bypassResult = evaluateBypass(player4, cursor4, plannedSurfaces4, allSurfaces4);
    console.log("\nActive surfaces:", bypassResult.activeSurfaces.map((s) => s.id));
    console.log("Bypassed surfaces:", bypassResult.bypassedSurfaces.map((b) => `${b.surface.id} (${b.reason})`));

    const { tracePhysicalPath } = await import("@/trajectory-v2/engine/PathBuilder");
    const { deriveRender } = await import("@/trajectory-v2/engine/RenderDeriver");

    const unifiedPath = tracePhysicalPath(player4, cursor4, bypassResult, allSurfaces4);

    console.log("\nisFullyAligned:", unifiedPath.isFullyAligned);
    console.log("cursorReachable:", unifiedPath.cursorReachable);
    console.log("cursorSegmentIndex:", unifiedPath.cursorSegmentIndex);
    console.log("firstDivergedIndex:", unifiedPath.firstDivergedIndex);
    console.log("physicsDivergenceIndex:", unifiedPath.physicsDivergenceIndex);

    console.log("\nSegments:");
    unifiedPath.segments.forEach((seg, i) => {
      console.log(`  ${i}: (${seg.start.x.toFixed(2)}, ${seg.start.y.toFixed(2)}) → (${seg.end.x.toFixed(2)}, ${seg.end.y.toFixed(2)})`);
      console.log(`     planAlignment: ${seg.planAlignment}, endSurface: ${seg.endSurface?.id || "none"}, termination: ${seg.termination?.type || "none"}`);
    });

    const renderOutput = deriveRender(
      unifiedPath,
      cursor4,
      allSurfaces4,
      bypassResult.activeSurfaces
    );

    console.log("\nRender segments:");
    renderOutput.segments.forEach((seg, i) => {
      console.log(`  ${i}: (${seg.start.x.toFixed(2)}, ${seg.start.y.toFixed(2)}) → (${seg.end.x.toFixed(2)}, ${seg.end.y.toFixed(2)}) [${seg.style} ${seg.color}]`);
    });

    // Check where red path starts
    const firstRedSegment = renderOutput.segments.find(
      (seg) => seg.color === "red" && seg.style === "solid"
    );
    if (firstRedSegment) {
      console.log("\nFirst solid red segment starts at:", firstRedSegment.start);
      
      // For this case, what should the divergence point be?
      const firstSegEnd = unifiedPath.segments[0]?.end;
      if (firstSegEnd) {
        const distFromFirstSegEnd = Math.sqrt(
          Math.pow(firstRedSegment.start.x - firstSegEnd.x, 2) +
          Math.pow(firstRedSegment.start.y - firstSegEnd.y, 2)
        );
        console.log("End of first segment:", firstSegEnd);
        console.log("Distance from first segment end:", distFromFirstSegEnd.toFixed(2));
      }
    }
  });
});

describe("Bug 3 continued", () => {
  const player3: Vector2 = { x: 649.341951066669, y: 666 };
  const cursor3: Vector2 = { x: 836.870541378528, y: 110.1338432122371 };

  const plannedSurfaces3: Surface[] = [
    createTestSurface({
      id: "ricochet-4",
      start: { x: 850, y: 350 },
      end: { x: 850, y: 500 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-1",
      start: { x: 800, y: 150 },
      end: { x: 900, y: 250 },
      canReflect: true,
    }),
  ];

  const allSurfaces3: Surface[] = [
    createTestSurface({
      id: "floor",
      start: { x: 0, y: 700 },
      end: { x: 1280, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "ceiling",
      start: { x: 0, y: 80 },
      end: { x: 1280, y: 80 },
      canReflect: false,
    }),
    createTestSurface({
      id: "left-wall",
      start: { x: 20, y: 80 },
      end: { x: 20, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "ricochet-1",
      start: { x: 800, y: 150 },
      end: { x: 900, y: 250 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-4",
      start: { x: 850, y: 350 },
      end: { x: 850, y: 500 },
      canReflect: true,
    }),
  ];

  it("should trace calculatePlannedPathFromPoint output", async () => {
    console.log("=== TRACING calculatePlannedPathFromPoint ===");

    const { calculatePlannedPathFromPoint } = await import("@/trajectory-v2/engine/RenderDeriver");
    const { tracePhysicalPath } = await import("@/trajectory-v2/engine/PathBuilder");

    const bypassResult = evaluateBypass(player3, cursor3, plannedSurfaces3, allSurfaces3);
    const unifiedPath = tracePhysicalPath(player3, cursor3, bypassResult, allSurfaces3);

    // Check what divergencePoint the RenderDeriver would calculate
    console.log("=== CHECKING DIVERGENCE POINT CALCULATION ===");
    console.log("firstDivergedIndex:", unifiedPath.firstDivergedIndex);
    console.log("cursorReachable:", unifiedPath.cursorReachable);
    console.log("cursorSegmentIndex:", unifiedPath.cursorSegmentIndex);
    
    const divergeBeforeCursor = 
      (unifiedPath.firstDivergedIndex !== -1 && !unifiedPath.cursorReachable);
    console.log("divergeBeforeCursor:", divergeBeforeCursor);

    // Calculate divergencePoint as RenderDeriver would
    let calculatedDivergencePoint: { x: number; y: number } | null = null;
    if (divergeBeforeCursor && unifiedPath.firstDivergedIndex === 0 && unifiedPath.segments.length > 0) {
      const firstSeg = unifiedPath.segments[0]!;
      console.log("First segment termination:", firstSeg.termination);
      console.log("First segment endSurface:", firstSeg.endSurface?.id);
      
      if (firstSeg.termination?.type === "wall_hit") {
        calculatedDivergencePoint = firstSeg.end;
        console.log("Using firstSeg.end (wall hit):", calculatedDivergencePoint);
      } else if (firstSeg.endSurface) {
        calculatedDivergencePoint = firstSeg.end;
        console.log("Using firstSeg.end (surface hit):", calculatedDivergencePoint);
      } else {
        calculatedDivergencePoint = firstSeg.start;
        console.log("Using firstSeg.start (no surface):", calculatedDivergencePoint);
      }
    }

    // Now call calculatePlannedPathFromPoint with this divergencePoint
    if (calculatedDivergencePoint) {
      const plannedPath = calculatePlannedPathFromPoint(
        calculatedDivergencePoint,
        cursor3,
        bypassResult.activeSurfaces,
        allSurfaces3
      );

      console.log("\nPlanned path from calculated divergence point:");
      plannedPath.forEach((seg, i) => {
        console.log(`  ${i}: (${seg.start.x.toFixed(2)}, ${seg.start.y.toFixed(2)}) → (${seg.end.x.toFixed(2)}, ${seg.end.y.toFixed(2)})`);
      });
    }
  });
});

