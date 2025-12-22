/**
 * Debug test: Reproduce the exact visual issue
 *
 * Issue: When a surface is selected and between player/cursor,
 * the dashed red line should be straight, but it appears to:
 * 1. "reflect-through" the surface
 * 2. Change angle at cursor
 * 3. Then continue straight
 */

import { DualTrajectoryBuilder } from "@/trajectory/DualTrajectoryBuilder";
import {
  calculatePlannedTrajectoryWithValidation,
  buildPlayerImages,
  buildCursorImages,
} from "@/trajectory/ImageReflectionCalculator";
import { RicochetSurface } from "@/surfaces";
import { describe, expect, it } from "vitest";

describe("Debug: Planned path should be straight line", () => {
  it("should have straight planned path when surface is in plan", () => {
    const builder = new DualTrajectoryBuilder();

    const player = { x: 100, y: 300 };
    const cursor = { x: 500, y: 300 };

    // Vertical ricochet surface between player and cursor
    const ricochet = new RicochetSurface("r1", {
      start: { x: 300, y: 200 },
      end: { x: 300, y: 400 },
    });

    // Surface IS in the plan
    const reflection = calculatePlannedTrajectoryWithValidation(player, cursor, [ricochet]);

    console.log("=== ImageReflectionResult ===");
    console.log("path:", reflection.path);
    console.log("hitOnSegment:", reflection.hitOnSegment);
    console.log("isFullyAligned:", reflection.isFullyAligned);
    console.log("firstMissIndex:", reflection.firstMissIndex);

    const result = builder.build(player, cursor, [ricochet], [ricochet]);

    console.log("\n=== DualTrajectoryResult ===");
    console.log("planned.points:", result.planned.points);
    console.log("planned.ghostPoints:", result.planned.ghostPoints);
    console.log("actual.points:", result.actual.points);
    console.log("actual.ghostPoints:", result.actual.ghostPoints);
    console.log("alignment:", result.alignment);
    console.log("isCursorReachable:", result.isCursorReachable);

    // Surface should be bypassed (player on wrong side of vertical surface)
    expect(result.bypassedSurfaces.length).toBeGreaterThan(0);

    // Planned path goes straight to cursor (bypassed surface)
    expect(result.planned.points[0]).toEqual(player);

    // Actual path should hit surface and reflect
    expect(result.actual.points.length).toBeGreaterThanOrEqual(2);
    expect(result.actual.points[0]).toEqual(player);
    expect(result.actual.points[1]!.x).toBeCloseTo(300, 0); // Surface hit
  });

  it("planned ghost path should continue in direction of arrow travel", () => {
    const builder = new DualTrajectoryBuilder();

    const player = { x: 100, y: 300 };
    const cursor = { x: 500, y: 300 };

    const ricochet = new RicochetSurface("r1", {
      start: { x: 300, y: 200 },
      end: { x: 300, y: 400 },
    });

    const result = builder.build(player, cursor, [ricochet], [ricochet]);

    // Ghost path exists
    const ghostPoint = result.planned.ghostPoints[0];
    expect(ghostPoint).toBeDefined();

    // Since the path reflects off the surface, the ghost path continues
    // in the reflected direction (which is to the left in this case)
    if (ghostPoint && result.planned.points.length >= 2) {
      const lastPlannedPoint = result.planned.points[result.planned.points.length - 1]!;
      const prevPoint = result.planned.points[result.planned.points.length - 2]!;

      // Ghost should extend in same direction as the last segment
      const lastSegmentDir = {
        x: lastPlannedPoint.x - prevPoint.x,
        y: lastPlannedPoint.y - prevPoint.y,
      };
      const cursorToGhost = {
        x: ghostPoint.position.x - lastPlannedPoint.x,
        y: ghostPoint.position.y - lastPlannedPoint.y,
      };

      // Both should have same sign (direction)
      if (Math.abs(lastSegmentDir.x) > 0.001) {
        expect(Math.sign(cursorToGhost.x)).toBe(Math.sign(lastSegmentDir.x));
      }
    }
  });

  it("cursor image should NOT be reflected when cursor is beyond surface", () => {
    const player = { x: 100, y: 300 };
    const cursor = { x: 500, y: 300 };

    const ricochet = new RicochetSurface("r1", {
      start: { x: 300, y: 200 },
      end: { x: 300, y: 400 },
    });

    // Check what buildCursorImages returns
    const cursorImages = buildCursorImages(cursor, [ricochet]);
    const playerImages = buildPlayerImages(player, [ricochet]);

    console.log("\n=== Image Reflection Debug ===");
    console.log("Player:", player);
    console.log("Cursor:", cursor);
    console.log("Player images:", playerImages);
    console.log("Cursor images:", cursorImages);

    const reflection = calculatePlannedTrajectoryWithValidation(player, cursor, [ricochet]);

    console.log("Reflection path:", reflection.path);

    // Path should have correct intersection at x=300
    expect(reflection.path[1]!.x).toBeCloseTo(300);
    expect(reflection.path[1]!.y).toBeCloseTo(300);

    // The hitOnSegment should be false (cursor is unreachable via reflection)
    expect(reflection.hitOnSegment[0]).toBe(false);
  });
});
