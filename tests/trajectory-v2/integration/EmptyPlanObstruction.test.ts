/**
 * Test for the "single solid red path" bug when there's an obstruction with an empty plan.
 *
 * INVARIANT: The first section of the trajectory must ALWAYS be solid green, never solid red.
 * The first segment is always the actual physical path from the player, and should be green.
 *
 * Scenario:
 * - Player at (170, 586)
 * - Cursor at (338.73, 452.88)
 * - Empty planned surfaces
 * - Mirror-left surface at x=250 obstructs the path
 *
 * Expected:
 * - Solid GREEN from player to obstruction (what the ball actually does)
 * - Solid RED from player to cursor (the planned path, ignoring obstructions)
 * - Dashed RED continuing from cursor (physical continuation of planned path)
 *
 * BUG: Currently showing only solid RED from player through obstruction to cursor.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { createMockSurface } from "@test/helpers/surfaceHelpers";
import { calculateActualPathUnified } from "@/trajectory-v2/engine/ActualPathCalculator";
import { calculatePlannedPath } from "@/trajectory-v2/engine/PlannedPathCalculator";
import { findDivergence } from "@/trajectory-v2/engine/DivergenceDetector";
import { renderDualPath, type RenderablePath } from "@/trajectory-v2/engine/DualPathRenderer";
import type { Surface } from "@/surfaces/Surface";

describe("Empty Plan with Obstruction Bug", () => {
  const player = { x: 170, y: 586 };
  const cursor = { x: 338.7317073170732, y: 452.8780487804878 };

  let surfaces: Surface[];

  beforeEach(() => {
    // Mirror-left surface at x=250 - obstructs path from player to cursor
    const mirrorLeft = createMockSurface(
      "mirror-left-0",
      { x: 250, y: 550 },
      { x: 250, y: 150 },
      { canReflect: true }
    );

    // Room surfaces
    surfaces = [
      createMockSurface("room-0", { x: 20, y: 80 }, { x: 1260, y: 80 }, { canReflect: true }),
      createMockSurface("room-1", { x: 1260, y: 80 }, { x: 1260, y: 700 }, { canReflect: false }),
      createMockSurface("room-2", { x: 1260, y: 700 }, { x: 20, y: 700 }, { canReflect: false }),
      createMockSurface("room-3", { x: 20, y: 700 }, { x: 20, y: 80 }, { canReflect: true }),
      mirrorLeft,
    ];
  });

  describe("Path Calculation", () => {
    it("should calculate actual path that hits the mirror", () => {
      const actualPath = calculateActualPathUnified(player, cursor, surfaces);

      // Actual path should have more than 2 waypoints due to reflection
      console.log("Actual path waypoints:", JSON.stringify(actualPath.waypoints, null, 2));
      console.log("Actual path cursorIndex:", actualPath.cursorIndex);
      console.log("Reached cursor:", actualPath.reachedCursor);

      // The actual path should hit the mirror at x=250
      expect(actualPath.waypoints.length).toBeGreaterThanOrEqual(2);

      if (actualPath.waypoints.length >= 2) {
        const secondPoint = actualPath.waypoints[1]!;
        // Second point should be around x=250 (the mirror)
        expect(secondPoint.x).toBeCloseTo(250, 0);
      }
    });

    it("should calculate planned path as direct line when surfaces are empty", () => {
      const plannedPath = calculatePlannedPath(player, cursor, []);

      console.log("Planned path waypoints:", JSON.stringify(plannedPath.waypoints, null, 2));

      // Planned path with empty surfaces should be direct: [player, cursor]
      expect(plannedPath.waypoints.length).toBe(2);
      expect(plannedPath.waypoints[0]).toEqual(player);
      expect(plannedPath.waypoints[1]).toEqual(cursor);
    });

    it("should detect divergence between actual and planned paths", () => {
      const actualPath = calculateActualPathUnified(player, cursor, surfaces);
      const plannedPath = calculatePlannedPath(player, cursor, []);

      const divergence = findDivergence(
        { waypoints: actualPath.waypoints },
        { waypoints: plannedPath.waypoints }
      );

      console.log("Divergence:", JSON.stringify(divergence, null, 2));

      // Paths diverge: actual hits mirror, planned goes directly to cursor
      expect(divergence.isAligned).toBe(false);
      // Divergence point should be the player (first shared waypoint)
      expect(divergence.point).toEqual(player);
    });
  });

  describe("Render Segments", () => {
    it("INVARIANT: first render segment must be solid green, never solid red", () => {
      const actualPath = calculateActualPathUnified(player, cursor, surfaces);
      const plannedPath = calculatePlannedPath(player, cursor, []);

      const divergence = findDivergence(
        { waypoints: actualPath.waypoints },
        { waypoints: plannedPath.waypoints }
      );

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

      console.log("Render segments:", JSON.stringify(segments, null, 2));

      // INVARIANT: The first segment must be solid green (the physical path)
      expect(segments.length).toBeGreaterThan(0);

      const firstSegment = segments[0]!;
      expect(firstSegment.color).toBe("green");
      expect(firstSegment.style).toBe("solid");
      expect(firstSegment.start).toEqual(player);
    });

    it("should have both green (actual) and red (planned) segments", () => {
      const actualPath = calculateActualPathUnified(player, cursor, surfaces);
      const plannedPath = calculatePlannedPath(player, cursor, []);

      const divergence = findDivergence(
        { waypoints: actualPath.waypoints },
        { waypoints: plannedPath.waypoints }
      );

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

      // Should have at least one green segment (actual path to obstruction)
      const greenSegments = segments.filter((s) => s.color === "green");
      expect(greenSegments.length).toBeGreaterThan(0);

      // Should have at least one red segment (planned path to cursor)
      const redSegments = segments.filter((s) => s.color === "red");
      expect(redSegments.length).toBeGreaterThan(0);
    });
  });
});
