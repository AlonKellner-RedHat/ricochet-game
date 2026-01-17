/**
 * Reproduction of user-reported bug: "single solid red path" when there should be green.
 * 
 * The user expects:
 * - Solid GREEN from player to obstruction
 * - Solid RED from player to cursor (planned path ignoring obstructions)
 * - Dashed RED continuation from cursor
 * 
 * User sees: Only solid RED from player through obstruction to cursor.
 * 
 * INVARIANT: The first section of the trajectory must ALWAYS be solid green, never solid red.
 */

import { describe, it, expect } from "vitest";
import { createMockSurface } from "@test/helpers/surfaceHelpers";
import { calculateActualPathUnified } from "@/trajectory-v2/engine/ActualPathCalculator";
import { calculatePlannedPath } from "@/trajectory-v2/engine/PlannedPathCalculator";
import { findDivergence } from "@/trajectory-v2/engine/DivergenceDetector";
import { renderDualPath, type RenderablePath, type RenderSegment } from "@/trajectory-v2/engine/DualPathRenderer";
import type { Surface } from "@/surfaces/Surface";

describe("User Reported: Single Solid Red Path Bug", () => {
  // Exact data from user's JSON
  const player = { x: 170, y: 586 };
  const cursor = { x: 338.7317073170732, y: 452.8780487804878 };

  // User's exact surfaces
  const surfaces: Surface[] = [
    createMockSurface("room-0", { x: 20, y: 80 }, { x: 1260, y: 80 }, { canReflect: true }),
    createMockSurface("room-1", { x: 1260, y: 80 }, { x: 1260, y: 700 }, { canReflect: false }),
    createMockSurface("room-2", { x: 1260, y: 700 }, { x: 20, y: 700 }, { canReflect: false }),
    createMockSurface("room-3", { x: 20, y: 700 }, { x: 20, y: 80 }, { canReflect: true }),
    createMockSurface("platform-0", { x: 50, y: 620 }, { x: 200, y: 620 }, { canReflect: false }),
    createMockSurface("mirror-left-0", { x: 250, y: 550 }, { x: 250, y: 150 }, { canReflect: true }),
    createMockSurface("mirror-right-0", { x: 550, y: 150 }, { x: 550, y: 550 }, { canReflect: true }),
  ];

  it("should analyze what path is being calculated", () => {
    const actualPath = calculateActualPathUnified(player, cursor, surfaces);
    const plannedPath = calculatePlannedPath(player, cursor, []); // Empty plan

    console.log("=== Actual Path ===");
    console.log("Waypoints count:", actualPath.waypoints.length);
    console.log("Waypoints:", JSON.stringify(actualPath.waypoints, null, 2));
    console.log("Blocked by:", actualPath.blockedBy?.id);
    console.log("CursorIndex:", actualPath.cursorIndex);
    
    console.log("\n=== Planned Path ===");
    console.log("Waypoints:", JSON.stringify(plannedPath.waypoints, null, 2));
    console.log("CursorIndex:", plannedPath.cursorIndex);
    console.log("CursorT:", plannedPath.cursorT);
  });

  it("should produce render segments with at least one GREEN segment", () => {
    const actualPath = calculateActualPathUnified(player, cursor, surfaces);
    const plannedPath = calculatePlannedPath(player, cursor, []);

    const divergence = findDivergence(
      { waypoints: actualPath.waypoints },
      { waypoints: plannedPath.waypoints }
    );

    console.log("=== Divergence ===");
    console.log("segmentIndex:", divergence.segmentIndex);
    console.log("point:", divergence.point);
    console.log("isAligned:", divergence.isAligned);

    const actualRenderable: RenderablePath = {
      waypoints: actualPath.waypoints,
      cursorIndex: actualPath.cursorIndex,
      cursorT: actualPath.cursorT,
    };

    const plannedRenderable: RenderablePath = {
      waypoints: plannedPath.waypoints,
      cursorIndex: plannedPath.cursorIndex,
      cursorT: plannedPath.cursorT,
    };

    const segments = renderDualPath(
      actualRenderable,
      plannedRenderable,
      {
        segmentIndex: divergence.segmentIndex,
        point: divergence.point,
        isAligned: divergence.isAligned,
      },
      cursor
    );

    console.log("\n=== Render Segments ===");
    for (const seg of segments) {
      console.log(`${seg.style} ${seg.color}: (${seg.start.x.toFixed(1)}, ${seg.start.y.toFixed(1)}) -> (${seg.end.x.toFixed(1)}, ${seg.end.y.toFixed(1)})`);
    }

    // INVARIANT: First segment must be solid green
    expect(segments.length).toBeGreaterThan(0);
    expect(segments[0]!.color).toBe("green");
    expect(segments[0]!.style).toBe("solid");
    expect(segments[0]!.start).toEqual(player);

    // There should also be a red segment
    const redSegments = segments.filter(s => s.color === "red");
    expect(redSegments.length).toBeGreaterThan(0);
  });

  it("green segment length should be visible (not too short)", () => {
    const actualPath = calculateActualPathUnified(player, cursor, surfaces);
    
    // Calculate distance from player to blocked point
    if (actualPath.waypoints.length >= 2) {
      const p1 = actualPath.waypoints[0]!;
      const p2 = actualPath.waypoints[1]!;
      const distance = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
      
      console.log("Green segment length:", distance);
      console.log("From:", p1);
      console.log("To:", p2);
      
      // The green segment should be at least 10 pixels to be visible
      expect(distance).toBeGreaterThan(10);
    }
  });
});

/**
 * INVARIANT: The first section of the trajectory must ALWAYS be solid green, never solid red.
 * 
 * This invariant applies to ALL scenarios:
 * - Full alignment: all green
 * - Divergence with reflections: green before divergence
 * - Immediate divergence (empty plan with obstruction): first actual segment is green
 */
describe("INVARIANT: First segment must be solid green", () => {
  function verifyFirstSegmentIsGreen(
    actualWaypoints: readonly { x: number; y: number }[],
    plannedWaypoints: readonly { x: number; y: number }[],
    actualCursorIndex: number,
    actualCursorT: number,
    plannedCursorIndex: number,
    plannedCursorT: number,
    cursor: { x: number; y: number }
  ): RenderSegment[] {
    const divergence = findDivergence(
      { waypoints: actualWaypoints },
      { waypoints: plannedWaypoints }
    );

    const actualRenderable: RenderablePath = {
      waypoints: actualWaypoints,
      cursorIndex: actualCursorIndex,
      cursorT: actualCursorT,
    };

    const plannedRenderable: RenderablePath = {
      waypoints: plannedWaypoints,
      cursorIndex: plannedCursorIndex,
      cursorT: plannedCursorT,
    };

    const segments = renderDualPath(
      actualRenderable,
      plannedRenderable,
      {
        segmentIndex: divergence.segmentIndex,
        point: divergence.point,
        isAligned: divergence.isAligned,
      },
      cursor
    );

    // INVARIANT: First segment must be solid green
    expect(segments.length).toBeGreaterThan(0);
    expect(segments[0]!.color).toBe("green");
    expect(segments[0]!.style).toBe("solid");

    return segments;
  }

  it("holds when paths are fully aligned", () => {
    const player = { x: 100, y: 100 };
    const cursor = { x: 200, y: 200 };
    const waypoints = [player, cursor];

    const segments = verifyFirstSegmentIsGreen(
      waypoints, waypoints, 0, 1, 0, 1, cursor
    );

    // All segments should be green
    for (const seg of segments) {
      expect(seg.color).toBe("green");
    }
  });

  it("holds when divergence occurs after first segment", () => {
    const player = { x: 100, y: 100 };
    const mid = { x: 200, y: 200 };
    const actualEnd = { x: 300, y: 100 }; // Actual reflects differently
    const plannedEnd = { x: 300, y: 300 }; // Planned continues straight
    const cursor = { x: 300, y: 300 };

    const segments = verifyFirstSegmentIsGreen(
      [player, mid, actualEnd],
      [player, mid, plannedEnd],
      1, 0.5, 1, 0.5, cursor
    );

    // First segment should be green, later segments depend on divergence
    expect(segments[0]!.color).toBe("green");
  });

  it("holds when divergence occurs at first segment (empty plan with obstruction)", () => {
    // This is the exact scenario from the user report
    const player = { x: 170, y: 586 };
    const cursor = { x: 338.7317073170732, y: 452.8780487804878 };
    const obstructionHit = { x: 250, y: 522.8834923388263 };

    const segments = verifyFirstSegmentIsGreen(
      [player, obstructionHit],           // Actual: blocked at obstruction
      [player, cursor],                    // Planned: straight to cursor
      -1, 0,                               // Cursor not on actual path
      0, 1,                                // Cursor at end of planned path
      cursor
    );

    console.log("Segments:", JSON.stringify(segments, null, 2));

    // First segment must be green (the physical path to obstruction)
    expect(segments[0]!.start).toEqual(player);
    expect(segments[0]!.end).toEqual(obstructionHit);
    expect(segments[0]!.color).toBe("green");
    expect(segments[0]!.style).toBe("solid");

    // Should also have a red segment (planned path to cursor)
    const redSegments = segments.filter(s => s.color === "red");
    expect(redSegments.length).toBeGreaterThan(0);
  });
});
