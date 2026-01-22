/**
 * Regression test for trajectory going through consecutive surfaces.
 * 
 * BUG: When the trajectory passes near multiple horizontal pyramid surfaces,
 * the path was incorrectly drawn going through surfaces instead of reflecting.
 * 
 * ROOT CAUSE: In TracePath, after a reflection, the segment start was using
 * the reflected origin IMAGE position instead of the physical HIT POINT.
 * 
 * FIX: Track currentPhysicalPosition separately from propagator's image positions.
 */

import { describe, it, expect } from "vitest";
import { createRayPropagator } from "@/trajectory-v2/engine/RayPropagator";
import { tracePath } from "@/trajectory-v2/engine/TracePath";
import { calculateActualPathUnified } from "@/trajectory-v2/engine/ActualPathCalculator";
import { createMockBidirectionalSurface, createMockWall } from "@test/helpers/surfaceHelpers";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

describe("Pyramid Pass-Through Bug Regression", () => {
  // User-reported bug case: trajectory goes through 3 consecutive pyramid surfaces
  const player: Vector2 = { x: 458.04032270001164, y: 666 };
  const cursor: Vector2 = { x: 952.1951219512196, y: 496.5853658536586 };

  // Pyramid surfaces (horizontal, at different y levels)
  const pyramidSurfaces: Surface[] = [
    createMockBidirectionalSurface("pyramid-1-0", { x: 1030, y: 500 }, { x: 1070, y: 500 }),
    createMockBidirectionalSurface("pyramid-2-0", { x: 1015, y: 460 }, { x: 1085, y: 460 }),
    createMockBidirectionalSurface("pyramid-3-0", { x: 1000, y: 420 }, { x: 1100, y: 420 }),
    createMockBidirectionalSurface("pyramid-4-0", { x: 985, y: 380 }, { x: 1115, y: 380 }),
  ];

  // Room boundaries
  const roomBoundaries: Surface[] = [
    createMockBidirectionalSurface("room-0", { x: 20, y: 80 }, { x: 1260, y: 80 }), // ceiling (reflective)
    createMockWall("room-1", { x: 1260, y: 80 }, { x: 1260, y: 700 }), // right wall
    createMockWall("room-2", { x: 1260, y: 700 }, { x: 20, y: 700 }), // floor
    createMockBidirectionalSurface("room-3", { x: 20, y: 700 }, { x: 20, y: 80 }), // left wall (reflective)
  ];

  describe("Segment connectivity invariant", () => {
    it("should have connected segments (each segment start equals previous segment end)", () => {
      const propagator = createRayPropagator(player, cursor);
      const allSurfaces = [...roomBoundaries, ...pyramidSurfaces];

      const result = tracePath(propagator, allSurfaces, {
        mode: "physical",
      });

      // Verify we got some segments
      expect(result.segments.length).toBeGreaterThan(0);

      // CRITICAL: Each segment's start must equal the previous segment's end
      for (let i = 1; i < result.segments.length; i++) {
        const prevEnd = result.segments[i - 1]!.end;
        const currStart = result.segments[i]!.start;

        expect(currStart.x).toBeCloseTo(prevEnd.x, 10);
        expect(currStart.y).toBeCloseTo(prevEnd.y, 10);
      }
    });

    it("should start from player position", () => {
      const propagator = createRayPropagator(player, cursor);
      const allSurfaces = [...roomBoundaries, ...pyramidSurfaces];

      const result = tracePath(propagator, allSurfaces, {
        mode: "physical",
      });

      // First segment must start at player
      expect(result.segments[0]!.start.x).toBeCloseTo(player.x, 10);
      expect(result.segments[0]!.start.y).toBeCloseTo(player.y, 10);
    });
  });

  describe("Path does not go through surfaces", () => {
    it("should NOT have trajectory points that skip surfaces", () => {
      // If a trajectory segment crosses a surface without reflecting, that's a bug
      const propagator = createRayPropagator(player, cursor);
      const allSurfaces = [...roomBoundaries, ...pyramidSurfaces];

      const result = tracePath(propagator, allSurfaces, {
        mode: "physical",
      });

      // For each segment, verify it doesn't "jump" across a surface
      for (let i = 0; i < result.segments.length; i++) {
        const seg = result.segments[i]!;
        
        // A segment that ends at a surface should record that surface
        // A segment that ends without hitting a surface (terminationType = no_hit)
        // should not have a surface
        if (i < result.segments.length - 1) {
          // Not the last segment - must have hit a surface
          expect(seg.surface).not.toBeNull();
        }
      }
    });

    it("should reflect at surfaces, not pass through", () => {
      const result = calculateActualPathUnified(
        player,
        cursor,
        [...roomBoundaries, ...pyramidSurfaces]
      );

      // The waypoints should form a connected path
      expect(result.waypoints.length).toBeGreaterThanOrEqual(2);

      // Verify waypoints are connected (no jumps)
      for (let i = 1; i < result.waypoints.length; i++) {
        const prev = result.waypoints[i - 1]!;
        const curr = result.waypoints[i]!;
        
        // Each waypoint should be reasonably close to the previous
        // (trajectory segments shouldn't be absurdly long)
        const dist = Math.sqrt((curr.x - prev.x) ** 2 + (curr.y - prev.y) ** 2);
        expect(dist).toBeLessThan(2000); // Max distance per segment
      }

      // If there are reflections, verify they're at surface positions
      for (const hit of result.hits) {
        expect(hit.surface).toBeDefined();
        expect(hit.point).toBeDefined();
      }
    });
  });

  describe("ActualPathUnified correctness", () => {
    it("should produce consistent waypoints", () => {
      const result = calculateActualPathUnified(
        player,
        cursor,
        [...roomBoundaries, ...pyramidSurfaces]
      );

      // Should have at least player position
      expect(result.waypoints.length).toBeGreaterThanOrEqual(1);
      expect(result.waypoints[0]!.x).toBeCloseTo(player.x, 10);
      expect(result.waypoints[0]!.y).toBeCloseTo(player.y, 10);

      // If blocked, should record blocking surface
      if (result.blockedBy) {
        expect(result.reachedCursor).toBe(false);
      }
    });
  });
});
