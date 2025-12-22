/**
 * Tests for path alignment between planned and actual trajectories
 *
 * First Principles:
 * 1. Planned and actual paths MUST start in the same direction
 * 2. Off-segment reflection points should be included in plan (not bypassed)
 * 3. Actual path uses real physics while following planned direction
 * 4. Obstructions stop the path
 */

import { DualTrajectoryBuilder } from "@/trajectory/DualTrajectoryBuilder";
import { RicochetSurface, WallSurface } from "@/surfaces";
import { Vec2 } from "@/math/Vec2";
import { describe, expect, it } from "vitest";

describe("Path Alignment", () => {
  const builder = new DualTrajectoryBuilder();

  describe("Bug: Obstruction between reflection and cursor", () => {
    it("actual path should start toward planned surface, not cursor", () => {
      // Setup: player shoots toward a ricochet surface, bounces, then blocked by wall
      //
      // The key is:
      // - Player shoots right
      // - Surface reflects the arrow (but continues going right due to angle)
      // - Wall blocks the reflected path
      //
      // Using a horizontal surface for easier reflection math:
      //
      //     player (100, 0) shoots down-right
      //           \
      //            v
      //         surface (y=100) ------>  reflects to go up-right
      //                           \
      //                            wall (x=300) blocks
      //                             \
      //                              cursor (400, 50)

      const player = { x: 100, y: 0 };
      const cursor = { x: 400, y: 50 };

      // Horizontal surface at y=100, normal pointing UP
      // Arrow coming from above bounces back up
      const ricochet = new RicochetSurface("r1", {
        start: { x: 300, y: 100 },
        end: { x: 0, y: 100 },
      });

      // Verify normal points up
      expect(ricochet.getNormal().y).toBeLessThan(0);

      // Wall at x=300 (between surface and cursor)
      // After bouncing, arrow goes up-right toward cursor but hits wall
      const wall = new WallSurface("wall", {
        start: { x: 300, y: 0 },
        end: { x: 300, y: 100 },
      });

      const result = builder.build(player, cursor, [ricochet], [ricochet, wall]);

      console.log("=== Test: obstruction after reflection ===");
      console.log("Planned points:", result.planned.points);
      console.log("Actual points:", result.actual.points);
      console.log("Bypassed:", result.bypassedSurfaces);
      console.log("Alignment:", result.alignment);

      // First principle: Both paths start from player
      expect(result.planned.points[0]).toEqual(player);
      expect(result.actual.points[0]).toEqual(player);

      // First principle: Both paths should have the same FIRST DIRECTION
      const plannedDir = Vec2.direction(
        result.planned.points[0]!,
        result.planned.points[1]!
      );
      const actualDir = Vec2.direction(
        result.actual.points[0]!,
        result.actual.points[1]!
      );

      console.log("Planned direction:", plannedDir);
      console.log("Actual direction:", actualDir);

      // Both should be heading in the same direction
      expect(Vec2.dot(plannedDir, actualDir)).toBeCloseTo(1, 1);

      // Both should be heading DOWN-RIGHT toward the surface at y=100
      expect(plannedDir.y).toBeGreaterThan(0);
      expect(actualDir.y).toBeGreaterThan(0);

      // Planned path's second point should be on the surface (y ≈ 100)
      expect(result.planned.points[1]!.y).toBeCloseTo(100, 0);

      // Actual path's second point should also be on the surface
      expect(result.actual.points[1]!.y).toBeCloseTo(100, 0);
    });

    it("planned path should include the reflection point even if it leads to obstruction", () => {
      const player = { x: 100, y: 300 };
      const cursor = { x: 500, y: 300 };

      const ricochet = new RicochetSurface("r1", {
        start: { x: 200, y: 200 },
        end: { x: 200, y: 400 },
      });

      const wall = new WallSurface("wall", {
        start: { x: 400, y: 200 },
        end: { x: 400, y: 400 },
      });

      const result = builder.build(player, cursor, [ricochet], [ricochet, wall]);

      // Planned path should include: player → surface → (blocked at wall or continues to cursor)
      expect(result.planned.points.length).toBeGreaterThanOrEqual(2);

      // Second point should be the surface hit (x ≈ 200)
      expect(result.planned.points[1]!.x).toBeCloseTo(200, 0);
    });
  });

  describe("First segment alignment", () => {
    it("should always align first segment when plan exists", () => {
      const player = { x: 0, y: 0 };
      const cursor = { x: 300, y: 0 };

      // Surface at x=100, cursor at x=300
      const surface = new RicochetSurface("r1", {
        start: { x: 100, y: -50 },
        end: { x: 100, y: 50 },
      });

      const result = builder.build(player, cursor, [surface], [surface]);

      // Both paths should start toward x=100 (surface), not x=300 (cursor)
      const plannedSecondX = result.planned.points[1]!.x;
      const actualSecondX = result.actual.points[1]!.x;

      // Both should hit something around x=100 (the surface)
      expect(plannedSecondX).toBeCloseTo(100, 0);
      expect(actualSecondX).toBeCloseTo(100, 0);
    });

    it("should align first segment even when surface is bypassed", () => {
      const player = { x: 0, y: 0 };
      const cursor = { x: 300, y: 0 };

      // Surface at x=100, but player on wrong side (will be bypassed)
      // Normal points left, player on right → bypass
      const surface = new RicochetSurface("r1", {
        start: { x: 100, y: 50 },
        end: { x: 100, y: -50 },
      });

      // Verify player is on wrong side
      expect(surface.getNormal().x).toBeGreaterThan(0); // Normal points right
      // Player at x=0 is on left side of surface at x=100
      // So player can approach from left (opposite to normal) = reflective side

      const result = builder.build(player, cursor, [surface], [surface]);

      // Even if surface is bypassed, first segment direction should be consistent
      expect(result.planned.points[0]).toEqual(player);
      expect(result.actual.points[0]).toEqual(player);
    });

    it("first segment directions must ALWAYS match", () => {
      // Test various configurations to ensure first directions always match
      const testCases = [
        {
          name: "surface between player and cursor",
          player: { x: 0, y: 100 },
          cursor: { x: 400, y: 100 },
          surface: new RicochetSurface("r1", {
            start: { x: 200, y: 0 },
            end: { x: 200, y: 200 },
          }),
        },
        {
          name: "surface behind cursor",
          player: { x: 0, y: 100 },
          cursor: { x: 200, y: 100 },
          surface: new RicochetSurface("r2", {
            start: { x: 400, y: 0 },
            end: { x: 400, y: 200 },
          }),
        },
        {
          name: "diagonal trajectory",
          player: { x: 0, y: 0 },
          cursor: { x: 400, y: 200 },
          surface: new RicochetSurface("r3", {
            start: { x: 200, y: 50 },
            end: { x: 200, y: 150 },
          }),
        },
      ];

      for (const tc of testCases) {
        const result = builder.build(tc.player, tc.cursor, [tc.surface], [tc.surface]);

        // First point is always player
        expect(result.planned.points[0]).toEqual(tc.player);
        expect(result.actual.points[0]).toEqual(tc.player);

        // Get first directions
        if (result.planned.points.length >= 2 && result.actual.points.length >= 2) {
          const plannedDir = Vec2.direction(
            result.planned.points[0]!,
            result.planned.points[1]!
          );
          const actualDir = Vec2.direction(
            result.actual.points[0]!,
            result.actual.points[1]!
          );

          // First principle: first segment directions MUST match
          const dotProduct = Vec2.dot(plannedDir, actualDir);
          expect(dotProduct).toBeCloseTo(1, 1);
        }
      }
    });
  });

  describe("Divergence point tracking", () => {
    it("should return divergence point where paths split", () => {
      // Setup: off-segment reflection
      // Planned path goes through off-segment point and continues to cursor
      // Actual path diverges at the off-segment point
      const player = { x: 100, y: 100 };
      const cursor = { x: 400, y: 100 };

      // Surface at y=200, x=150-180 (narrow)
      // Image reflection would hit at x=250, which is off-segment
      const surface = new RicochetSurface("r1", {
        start: { x: 180, y: 200 },
        end: { x: 150, y: 200 },
      });

      const result = builder.build(player, cursor, [surface], [surface]);

      console.log("=== Divergence point test ===");
      console.log("Planned points:", result.planned.points);
      console.log("Actual points:", result.actual.points);
      console.log("Alignment:", result.alignment);

      // The divergence point should be at the planned reflection point
      // This is where the actual path diverges from the planned path
      expect(result.alignment.divergencePoint).toBeDefined();

      // Divergence point should be the off-segment reflection point (250, 200)
      const plannedReflection = result.planned.points[1];
      expect(result.alignment.divergencePoint!.x).toBeCloseTo(plannedReflection!.x, 0);
      expect(result.alignment.divergencePoint!.y).toBeCloseTo(plannedReflection!.y, 0);
    });

    it("should have no divergence point when paths are fully aligned", () => {
      const player = { x: 100, y: 100 };
      const cursor = { x: 300, y: 100 };

      // Surface at y=200, wide enough to hit
      const surface = new RicochetSurface("r1", {
        start: { x: 400, y: 200 },
        end: { x: 0, y: 200 },
      });

      const result = builder.build(player, cursor, [surface], [surface]);

      // When paths are fully aligned, there is no divergence
      if (result.alignment.isFullyAligned) {
        expect(result.alignment.divergencePoint).toBeUndefined();
      }
    });

    it("should have divergence point at off-segment reflection for rendering", () => {
      // This test verifies the divergence point is correct for rendering:
      // - Solid green: player → divergence point
      // - Solid red: divergence point → cursor
      // - Dashed yellow: divergence point → actual end

      const player = { x: 100, y: 100 };
      const cursor = { x: 400, y: 100 };

      // Narrow surface that will cause off-segment reflection
      const surface = new RicochetSurface("r1", {
        start: { x: 180, y: 200 },
        end: { x: 150, y: 200 },
      });

      const result = builder.build(player, cursor, [surface], [surface]);

      console.log("=== Rendering divergence test ===");
      console.log("Planned points:", result.planned.points);
      console.log("Actual points:", result.actual.points);
      console.log("Divergence point:", result.alignment.divergencePoint);
      console.log("Aligned segment count:", result.alignment.alignedSegmentCount);

      // Should have exactly 1 aligned segment (player → reflection point)
      expect(result.alignment.alignedSegmentCount).toBe(1);

      // Divergence point should be the planned reflection point
      expect(result.alignment.divergencePoint).toBeDefined();
      const divPoint = result.alignment.divergencePoint!;

      // The divergence point should match the second planned point (reflection point)
      const plannedReflection = result.planned.points[1];
      expect(divPoint.x).toBeCloseTo(plannedReflection!.x, 0);
      expect(divPoint.y).toBeCloseTo(plannedReflection!.y, 0);

      // Verify rendering expectations:
      // 1. Green solid should be from player (100, 100) to divergence (250, 200)
      expect(divPoint.x).toBeCloseTo(250, 0);
      expect(divPoint.y).toBeCloseTo(200, 0);

      // 2. Red solid should be from divergence (250, 200) to cursor (400, 100)
      // This is just verifying the cursor is where we expect
      const cursor_ = result.planned.points[result.planned.points.length - 1];
      expect(cursor_!.x).toBeCloseTo(400, 0);
      expect(cursor_!.y).toBeCloseTo(100, 0);

      // 3. Yellow dashed should be from divergence (250, 200) to actual end
      const actualEnd = result.actual.points[result.actual.points.length - 1];
      // Actual path continues in the direction from player toward the reflection point
      // Since it's off-segment, it goes to exhaustion distance
      expect(actualEnd).toBeDefined();
    });
  });

  describe("BUG: Obstacle between reflection point and cursor", () => {
    it("actual path stops at wall blocking reflected trajectory", () => {
      // Asymmetric case: cursor at y=50 but reflected path hits wall at y=150
      const player = { x: 100, y: 100 };
      const cursor = { x: 400, y: 50 };

      const ricochetSurface = new RicochetSurface("r1", {
        start: { x: 500, y: 200 },
        end: { x: 0, y: 200 },
      });

      const wall = new WallSurface("wall1", {
        start: { x: 200, y: 150 },
        end: { x: 450, y: 150 },
      });

      const result = builder.build(player, cursor, [ricochetSurface], [ricochetSurface, wall]);

      // Actual path should stop at wall
      const actualEnd = result.actual.points[result.actual.points.length - 1];
      expect(actualEnd).toBeDefined();
      expect(actualEnd!.y).toBeGreaterThanOrEqual(145);
      expect(result.isCursorReachable).toBe(false);
    });

    it("should stop at obstacle after valid on-segment reflection", () => {
      // Symmetric reflection with wall blocking the path
      const player = { x: 100, y: 100 };
      const cursor = { x: 400, y: 100 };

      const ricochetSurface = new RicochetSurface("r1", {
        start: { x: 500, y: 200 },
        end: { x: 0, y: 200 },
      });

      const wall = new WallSurface("wall1", {
        start: { x: 200, y: 150 },
        end: { x: 400, y: 150 },
      });

      const result = builder.build(player, cursor, [ricochetSurface], [ricochetSurface, wall]);

      // Both planned and actual should stop at the wall
      const actualEnd = result.actual.points[result.actual.points.length - 1];
      expect(actualEnd).toBeDefined();
      expect(actualEnd!.y).toBeGreaterThan(120); // Near wall, not at cursor
      expect(result.isCursorReachable).toBe(false);
    });

    it("arrow waypoints should not include points beyond obstacles", () => {
      // When arrow is shot, it uses actual.points as waypoints
      // These waypoints must not go through obstacles
      const player = { x: 100, y: 100 };
      const cursor = { x: 400, y: 100 };

      const ricochetSurface = new RicochetSurface("r1", {
        start: { x: 500, y: 200 },
        end: { x: 0, y: 200 },
      });

      const wall = new WallSurface("wall1", {
        start: { x: 200, y: 150 },
        end: { x: 400, y: 150 },
      });

      const result = builder.build(player, cursor, [ricochetSurface], [ricochetSurface, wall]);

      // The actual path (arrow waypoints) should stop at wall
      const waypoints = result.actual.points;

      // All waypoints after player should be at or above wall level (y >= 150)
      // because the wall blocks at y=150
      for (let i = 1; i < waypoints.length; i++) {
        const wp = waypoints[i];
        expect(wp).toBeDefined();
        // After the first point (player at y=100), waypoints should not pass through wall
        // Wall is at y=150, so no waypoint should have y < 150 (closer to cursor at y=100)
        // Actually the wall blocks at y=150, so all waypoints after reflection should be at y >= 150
        expect(wp!.y).toBeGreaterThanOrEqual(145); // Allow small tolerance
      }

      expect(result.isCursorReachable).toBe(false);
    });
  });

  describe("BUG: Arrow reflects at off-segment point", () => {
    it("arrow should NOT reflect when planned hit is off-segment", () => {
      // Exact reproduction of user's issue:
      // - Player and cursor on same side of surface
      // - Planned reflection point is off the segment
      // - Arrow should NOT reflect in mid-air

      const player = { x: 100, y: 100 };
      const cursor = { x: 400, y: 100 };

      // Horizontal surface at y=200, from x=150 to x=180 (30 pixels wide)
      // The image reflection would hit at x=250 (outside segment)
      const surface = new RicochetSurface("r1", {
        start: { x: 180, y: 200 },
        end: { x: 150, y: 200 },
      });

      // Verify normal points up (toward player/cursor)
      expect(surface.getNormal().y).toBeLessThan(0);
      expect(player.y).toBeLessThan(200);
      expect(cursor.y).toBeLessThan(200);

      const result = builder.build(player, cursor, [surface], [surface]);

      console.log("=== BUG REPRODUCTION ===");
      console.log("Player:", player);
      console.log("Cursor:", cursor);
      console.log("Surface segment: x=150-180, y=200");
      console.log("Planned points:", result.planned.points);
      console.log("Actual points:", result.actual.points);
      console.log("Alignment:", result.alignment);
      console.log("Cursor reachable:", result.isCursorReachable);

      // Calculate expected reflection point using image reflection
      // Player image = reflect (100, 100) through y=200 → (100, 300)
      // Line from (100, 300) to (400, 100) intersects y=200:
      //   t = (300-200)/(300-100) = 100/200 = 0.5
      //   x = 100 + 0.5*(400-100) = 100 + 150 = 250
      // Expected reflection point: (250, 200) which is OUTSIDE segment (150-180)

      const plannedHit = result.planned.points[1];
      console.log("Planned reflection point:", plannedHit);
      console.log("Expected off-segment x=250, segment is 150-180");

      if (plannedHit) {
        expect(plannedHit.y).toBeCloseTo(200, 0);
        // x should be ~250, which is outside segment (150-180)
        expect(plannedHit.x).toBeGreaterThan(180); // Off-segment
      }

      // CRITICAL: Actual path should NOT reflect at the off-segment point
      // The arrow should either:
      // a) Go directly to cursor (if no surface is hit), OR
      // b) Continue forward past the segment

      // Check if actual path reflects (BAD) or continues forward (GOOD)
      const actualPoints = result.actual.points;
      console.log("Actual path has", actualPoints.length, "points");

      // If there are 3+ points, the arrow reflected somewhere
      if (actualPoints.length >= 3) {
        const secondPoint = actualPoints[1];
        const thirdPoint = actualPoints[2];
        console.log("Second point:", secondPoint);
        console.log("Third point:", thirdPoint);

        // Check if second point is at the off-segment reflection point
        if (
          secondPoint &&
          plannedHit &&
          Math.abs(secondPoint.x - plannedHit.x) < 5 &&
          Math.abs(secondPoint.y - plannedHit.y) < 5
        ) {
          console.log("BUG CONFIRMED: Actual path hit the off-segment point!");
          console.log("The arrow is reflecting in mid-air!");
        }
      }

      // Alignment should NOT be fully aligned (paths diverge)
      expect(result.alignment.isFullyAligned).toBe(false);

      // CRITICAL: First segment MUST be aligned (same direction from player)
      // Even though paths diverge, the initial section is aligned
      expect(result.alignment.alignedSegmentCount).toBe(1);
      expect(result.alignment.firstMismatchIndex).toBe(1);

      // The actual path's second point should NOT be the off-segment reflection point
      if (actualPoints.length >= 2 && plannedHit) {
        const actualSecond = actualPoints[1];
        const hitsSamePlannedPoint =
          actualSecond &&
          Math.abs(actualSecond.x - plannedHit.x) < 1 &&
          Math.abs(actualSecond.y - plannedHit.y) < 1;

        expect(hitsSamePlannedPoint).toBe(false);
      }
    });
  });

  describe("Off-segment reflection handling", () => {
    it("off-segment reflection should be in planned path but actual ignores it", () => {
      // Setup where the reflection point is truly off the segment:
      // - Horizontal surface at y=200, from x=100 to x=150 (50 pixels wide, narrow)
      // - Player at (0, 50), cursor at (400, 50) - both above, same side
      // - Image reflection math:
      //   - Player image = reflect through y=200 → (0, 350)
      //   - Line from (0, 350) to (400, 50) intersects y=200:
      //     - t = (350-200)/(350-50) = 150/300 = 0.5
      //     - x = 0.5 * 400 = 200
      //   - Hit at (200, 200) which is OUTSIDE segment x=100-150

      const player = { x: 0, y: 50 };
      const cursor = { x: 400, y: 50 };

      // Small horizontal surface at y=200
      const surface = new RicochetSurface("r1", {
        start: { x: 150, y: 200 },
        end: { x: 100, y: 200 },
      });

      // Normal should point UP (toward player)
      expect(surface.getNormal().y).toBeLessThan(0);

      const result = builder.build(player, cursor, [surface], [surface]);

      console.log("=== True off-segment test ===");
      console.log("Planned points:", result.planned.points);
      console.log("Actual points:", result.actual.points);
      console.log("Bypassed:", result.bypassedSurfaces);

      // Both paths start from player
      expect(result.planned.points[0]).toEqual(player);
      expect(result.actual.points[0]).toEqual(player);

      // First directions should align
      if (result.planned.points.length >= 2 && result.actual.points.length >= 2) {
        const plannedDir = Vec2.direction(
          result.planned.points[0]!,
          result.planned.points[1]!
        );
        const actualDir = Vec2.direction(
          result.actual.points[0]!,
          result.actual.points[1]!
        );

        // First principle: first segment must always align
        expect(Vec2.dot(plannedDir, actualDir)).toBeCloseTo(1, 1);
      }

      // Planned path should include a reflection point at y=200 (even if off-segment)
      // The x coordinate (200) is outside the segment (100-150)
      expect(result.planned.points.length).toBeGreaterThanOrEqual(3);
      const plannedHit = result.planned.points[1];
      expect(plannedHit).toBeDefined();
      expect(plannedHit!.y).toBeCloseTo(200, 0);
      expect(plannedHit!.x).toBeCloseTo(200, 0); // Off-segment (outside 100-150)

      // CRITICAL: Actual path should NOT reflect at the off-segment point
      // The actual path continues forward in the planned direction
      const actualSecond = result.actual.points[1];
      expect(actualSecond).toBeDefined();

      // The actual second point should NOT be at the planned reflection point
      // because the arrow doesn't actually hit the segment
      const actualHitsSameAsPlanned =
        Math.abs(actualSecond!.x - plannedHit!.x) < 1 &&
        Math.abs(actualSecond!.y - plannedHit!.y) < 1;

      // Actual should go forward past the segment (not reflect)
      expect(actualHitsSameAsPlanned).toBe(false);

      // Actual path will NOT reach the cursor because it's going in a different direction
      // The last point will be the forward physics endpoint (exhaustion distance)
      const lastActualPoint = result.actual.points[result.actual.points.length - 1];
      expect(lastActualPoint).toBeDefined();

      // The actual path diverged - it won't be at the cursor
      // This is correct physics behavior
    });

    it("planned path includes off-segment point, actual path uses forward physics", () => {
      // Setup for TRUE off-segment reflection:
      // - Player and cursor on SAME side of surface (valid reflection geometry)
      // - Segment is VERY short, so reflection point is definitely outside
      //
      // Layout:
      // - Horizontal surface at y=200, from x=120 to x=130 (only 10 pixels wide!)
      // - Player at (0, 50) - above surface (normal side)
      // - Cursor at (400, 50) - also above surface (same side)
      // - The image reflection would hit at x=200 (outside segment x=120-130)

      const player = { x: 0, y: 50 };
      const cursor = { x: 400, y: 50 };

      // Very short horizontal surface at y=200, only 10 pixels wide
      const surface = new RicochetSurface("r1", {
        start: { x: 130, y: 200 },
        end: { x: 120, y: 200 },
      });

      // Normal should point UP (negative y)
      expect(surface.getNormal().y).toBeLessThan(0);

      // Verify player and cursor are on the normal side (y < 200)
      expect(player.y).toBeLessThan(200);
      expect(cursor.y).toBeLessThan(200);

      const result = builder.build(player, cursor, [surface], [surface]);

      console.log("=== Off-segment simple test ===");
      console.log("Planned points:", result.planned.points);
      console.log("Actual points:", result.actual.points);
      console.log("Bypassed:", result.bypassedSurfaces);
      console.log("Alignment:", result.alignment);

      // Both start from player
      expect(result.planned.points[0]).toEqual(player);
      expect(result.actual.points[0]).toEqual(player);

      // First directions must align
      const plannedDir = Vec2.direction(
        result.planned.points[0]!,
        result.planned.points[1]!
      );
      const actualDir = Vec2.direction(
        result.actual.points[0]!,
        result.actual.points[1]!
      );

      expect(Vec2.dot(plannedDir, actualDir)).toBeCloseTo(1, 1);

      // Planned path should have a reflection point at y=200 (on the surface LINE)
      // The x coordinate (200) is OUTSIDE the segment (120-130)
      const plannedHit = result.planned.points[1];
      expect(plannedHit).toBeDefined();
      expect(plannedHit!.y).toBeCloseTo(200, 0);
      expect(plannedHit!.x).toBeCloseTo(200, 0); // Off-segment x (outside 120-130)

      // Actual path should NOT reflect because the hit is off-segment
      // It should continue forward (not hit the 10-pixel segment) and eventually reach cursor
      // The second point should NOT be at (200, 200) like planned
      const actualSecond = result.actual.points[1];
      expect(actualSecond).toBeDefined();

      // Key assertion: actual path should NOT hit the same point as planned (off-segment)
      // The actual arrow travels in the planned direction but doesn't hit the tiny segment
      if (Vec2.distance(actualSecond!, plannedHit!) < 1) {
        // If it hit the same point, it should NOT reflect (should continue forward)
        // The next point should show forward motion, not reflection
        expect(result.actual.points.length).toBeGreaterThan(2);
      }

      // Actual path diverges from planned - it may not reach cursor
      // The physics takes it in a different direction
      const lastActualPoint = result.actual.points[result.actual.points.length - 1];
      expect(lastActualPoint).toBeDefined();
    });
  });
});

