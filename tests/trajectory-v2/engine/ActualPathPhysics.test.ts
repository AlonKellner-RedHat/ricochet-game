/**
 * ActualPathPhysics.test.ts
 *
 * First-Principle Tests for Actual Path Physics
 *
 * These tests enforce the fundamental requirements:
 * 1. Direction Parameterization: Cursor images determine ray directions
 * 2. Forward Physics: Actual intersections/reflections use real geometry
 * 3. Immutable Shot: Trajectory is locked at shot time
 */

import { describe, it, expect } from "vitest";
import { RicochetSurface, WallSurface } from "@/surfaces";
import type { Surface } from "@/surfaces";
import type { Vector2 } from "@/types";
import {
  buildPlannedPath,
  buildActualPath,
} from "@/trajectory-v2/engine/PathBuilder";

// Helper to create a ricochet surface
function createRicochetSurface(
  id: string,
  start: Vector2,
  end: Vector2
): Surface {
  return new RicochetSurface(id, { start, end });
}

// Helper to create a wall surface
function createWallSurface(id: string, start: Vector2, end: Vector2): Surface {
  return new WallSurface(id, { start, end });
}

// Helper to check if two vectors are approximately equal
function vectorsEqual(a: Vector2, b: Vector2, tolerance = 1): boolean {
  return Math.abs(a.x - b.x) < tolerance && Math.abs(a.y - b.y) < tolerance;
}

// Helper to get direction from two points
function getDirection(from: Vector2, to: Vector2): Vector2 {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 0.001) return { x: 1, y: 0 };
  return { x: dx / len, y: dy / len };
}

describe("ActualPathPhysics", () => {
  describe("First Principle 1: Direction from Images, Hits from Physics", () => {
    it("should use forward ray casting for actual hits, not planned hit points", () => {
      // Setup for a VALID reflection scenario where BOTH player and cursor are
      // on the reflective side of the surface:
      //
      // - Player at (100, 300)
      // - Cursor at (200, 350) - also on the SAME side as player (below surface visually, y > 200)
      // - Horizontal surface from (50, 200) to (250, 200)
      //   Normal points DOWN (toward higher y values where player/cursor are)
      //
      // In Phaser, y increases downward. For the bidirectional reflection to work:
      // - The planned path reflects off the surface toward the cursor
      // - The actual path casts toward the surface and reflects

      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 200, y: 350 }; // On same side as player (y > 200)
      
      // Horizontal surface at y=200, traversed left-to-right
      // Normal = perpendicular "left" of direction = (0, 1) = points DOWN (increasing y)
      // Reflective side is where y > 200 (where player and cursor are)
      const surface = createRicochetSurface(
        "horizontal",
        { x: 50, y: 200 },
        { x: 250, y: 200 }
      );

      const plannedSurfaces = [surface];
      const allSurfaces = [surface];

      const planned = buildPlannedPath(player, cursor, plannedSurfaces);
      const actual = buildActualPath(player, cursor, plannedSurfaces, allSurfaces);

      // Both should have 3 points: player → hit → cursor
      expect(planned.points.length).toBeGreaterThanOrEqual(3);
      expect(actual.points.length).toBeGreaterThanOrEqual(3);

      // Actual path should have a hit point at y=200 (on the surface segment)
      const actualHitPoint = actual.points[1];
      expect(actualHitPoint).toBeDefined();
      expect(actualHitPoint!.y).toBeCloseTo(200, 0);
    });

    it("should NOT reflect through surface when cursor is on wrong side", () => {
      // CRITICAL TEST: This is the bug we're fixing
      //
      // Setup:
      // - Player at (100, 300)
      // - Ricochet surface from (300, 200) to (300, 400) - vertical at x=300
      // - Cursor at (200, 100) - on SAME side as player (wrong side for reflection)
      //
      // Bug behavior: Arrow "reflects through" the surface as if perpendicular
      // Correct behavior: Arrow should aim toward cursor image, hit surface, and reflect

      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 200, y: 100 }; // Same side as player
      const surface = createRicochetSurface(
        "vertical",
        { x: 300, y: 200 },
        { x: 300, y: 400 }
      );

      const plannedSurfaces = [surface];
      const allSurfaces = [surface];

      const actual = buildActualPath(player, cursor, plannedSurfaces, allSurfaces);

      // The actual path should:
      // 1. Start at player
      // 2. Go toward the surface (direction from player image to cursor image)
      // 3. Hit the surface at a real point on the segment
      // 4. Reflect and continue

      expect(actual.points.length).toBeGreaterThanOrEqual(2);

      // The first segment should be heading toward the surface (x increasing)
      const firstDir = getDirection(actual.points[0]!, actual.points[1]!);
      expect(firstDir.x).toBeGreaterThan(0); // Should be moving right toward surface

      // If there's a hit, it should be at x=300 (on the surface segment)
      if (actual.points.length >= 2) {
        const hitPoint = actual.points[1]!;
        // Either hits the surface at x=300, or misses and continues
        // But should NOT have impossible reflection through the surface
        if (hitPoint.x >= 299 && hitPoint.x <= 301) {
          // Hit the surface - verify it's on the segment
          expect(hitPoint.y).toBeGreaterThanOrEqual(200);
          expect(hitPoint.y).toBeLessThanOrEqual(400);
        }
      }
    });

    it("should use physics-based intersection even when planned hit is off-segment", () => {
      // Setup:
      // - Player at (100, 300)
      // - Short ricochet surface from (300, 290) to (300, 310) - only 20px tall
      // - Cursor positioned so planned hit would be at (300, 400) - off segment
      //
      // Planned path: Shows off-segment hit at (300, 400)
      // Actual path: Ray should either hit the segment or miss entirely

      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 500, y: 500 }; // Will cause hit below segment
      const surface = createRicochetSurface(
        "short-vertical",
        { x: 300, y: 290 },
        { x: 300, y: 310 }
      );

      const plannedSurfaces = [surface];
      const allSurfaces = [surface];

      const planned = buildPlannedPath(player, cursor, plannedSurfaces);
      const actual = buildActualPath(player, cursor, plannedSurfaces, allSurfaces);

      // Planned path may have off-segment hit
      if (planned.hitInfo.length > 0) {
        const plannedHit = planned.hitInfo[0]!;
        // The planned hit might be off-segment
        console.log("Planned hit onSegment:", plannedHit.onSegment);
      }

      // Actual path should NOT have an impossible hit
      // It either hits the segment (y between 290 and 310) or misses
      if (actual.points.length >= 2) {
        const actualSecondPoint = actual.points[1]!;
        
        // If it's a hit on the surface line (x ≈ 300)
        if (Math.abs(actualSecondPoint.x - 300) < 1) {
          // Must be on the actual segment
          expect(actualSecondPoint.y).toBeGreaterThanOrEqual(289);
          expect(actualSecondPoint.y).toBeLessThanOrEqual(311);
        }
      }
    });
  });

  describe("First Principle 2: Same Direction = Same Actual Path", () => {
    it("should produce identical actual paths for same initial direction", () => {
      // Setup: Two scenarios with same player and NO plan (direct path)
      // Different cursor distances along same ray should produce same hit points

      const player: Vector2 = { x: 100, y: 300 };
      const surface = createRicochetSurface(
        "vertical",
        { x: 300, y: 200 },
        { x: 300, y: 400 }
      );

      // Cursor 1 and 2 at same direction but different distances
      // NO planned surfaces - just see what the arrow actually hits
      const cursor1: Vector2 = { x: 500, y: 300 };
      const cursor2: Vector2 = { x: 600, y: 300 };

      const allSurfaces = [surface];
      const plannedSurfaces: Surface[] = []; // No plan

      const actual1 = buildActualPath(player, cursor1, plannedSurfaces, allSurfaces);
      const actual2 = buildActualPath(player, cursor2, plannedSurfaces, allSurfaces);

      // Both should hit the surface at the same point
      expect(actual1.points.length).toBeGreaterThanOrEqual(2);
      expect(actual2.points.length).toBeGreaterThanOrEqual(2);

      // First hit point should be the same (at the surface)
      expect(actual1.points[1]!.x).toBeCloseTo(actual2.points[1]!.x, 0);
      expect(actual1.points[1]!.y).toBeCloseTo(actual2.points[1]!.y, 0);
    });

    it("should not change actual path when cursor moves but direction stays same", () => {
      // The actual path is determined by the ray direction
      // Moving cursor along the same ray should not change the actual hit points
      // (When there's no plan, direction is directly toward cursor)

      const player: Vector2 = { x: 100, y: 300 };
      const surface = createRicochetSurface(
        "vertical",
        { x: 300, y: 200 },
        { x: 300, y: 400 }
      );

      const allSurfaces = [surface];
      const plannedSurfaces: Surface[] = []; // No plan - just direct path

      // Cursor at different distances along same ray
      const cursorNear: Vector2 = { x: 400, y: 300 };
      const cursorFar: Vector2 = { x: 800, y: 300 };

      const actualNear = buildActualPath(player, cursorNear, plannedSurfaces, allSurfaces);
      const actualFar = buildActualPath(player, cursorFar, plannedSurfaces, allSurfaces);

      // Both should hit the surface at the same point
      expect(actualNear.points.length).toBeGreaterThanOrEqual(2);
      expect(actualFar.points.length).toBeGreaterThanOrEqual(2);

      // The hit points should be the same
      expect(actualNear.points[1]!.x).toBeCloseTo(actualFar.points[1]!.x, 0);
      expect(actualNear.points[1]!.y).toBeCloseTo(actualFar.points[1]!.y, 0);
    });
  });

  describe("First Principle 3: Forward Physics Ray Casting", () => {
    it("should find first intersection with any surface, not just planned", () => {
      // Setup:
      // - Player at (100, 300)
      // - Wall at x=200 (before planned ricochet surface)
      // - Ricochet surface at x=300
      //
      // Actual path should stop at wall, not reach ricochet surface

      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 500, y: 300 };

      const wall = createWallSurface(
        "blocking-wall",
        { x: 200, y: 200 },
        { x: 200, y: 400 }
      );
      const ricochetSurface = createRicochetSurface(
        "ricochet",
        { x: 300, y: 200 },
        { x: 300, y: 400 }
      );

      const plannedSurfaces = [ricochetSurface];
      const allSurfaces = [wall, ricochetSurface];

      const actual = buildActualPath(player, cursor, plannedSurfaces, allSurfaces);

      // Should stop at wall (x=200), not reach ricochet surface
      expect(actual.points.length).toBe(2);
      expect(actual.points[1]!.x).toBeCloseTo(200, 0);
    });

    it("should reflect off ricochet surface and continue", () => {
      // Setup:
      // - Player at (100, 300)
      // - Ricochet surface at x=300 (vertical)
      // - Cursor at (400, 200)
      //
      // Arrow should hit surface at (300, ~250) and reflect

      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 400, y: 200 };

      const surface = createRicochetSurface(
        "vertical",
        { x: 300, y: 100 },
        { x: 300, y: 400 }
      );

      const plannedSurfaces = [surface];
      const allSurfaces = [surface];

      const actual = buildActualPath(player, cursor, plannedSurfaces, allSurfaces);

      // Should have at least 3 points: player → surface hit → reflected endpoint
      expect(actual.points.length).toBeGreaterThanOrEqual(3);

      // First hit should be on surface at x=300
      expect(actual.points[1]!.x).toBeCloseTo(300, 0);

      // After reflection, x should be decreasing (bouncing back)
      if (actual.points.length >= 3) {
        expect(actual.points[2]!.x).toBeLessThan(300);
      }
    });

    it("should stop at wall surface (no reflection)", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 500, y: 300 };

      const wall = createWallSurface(
        "wall",
        { x: 300, y: 200 },
        { x: 300, y: 400 }
      );

      const plannedSurfaces: Surface[] = [];
      const allSurfaces = [wall];

      const actual = buildActualPath(player, cursor, plannedSurfaces, allSurfaces);

      // Should stop at wall
      expect(actual.points.length).toBe(2);
      expect(actual.points[1]!.x).toBeCloseTo(300, 0);
      expect(actual.reachedCursor).toBe(false);
    });
  });

  describe("First Principle 4: No Impossible Reflections", () => {
    it("should never reflect through a surface", () => {
      // This tests the specific bug reported:
      // When cursor is on wrong side, arrow should NOT "reflect through"

      const player: Vector2 = { x: 100, y: 300 };
      const surface = createRicochetSurface(
        "vertical",
        { x: 300, y: 200 },
        { x: 300, y: 400 }
      );

      // Cursor on same side as player (wrong side for reflection)
      const cursor: Vector2 = { x: 50, y: 250 };

      const plannedSurfaces = [surface];
      const allSurfaces = [surface];

      const actual = buildActualPath(player, cursor, plannedSurfaces, allSurfaces);

      // Check that the path makes physical sense
      for (let i = 0; i < actual.points.length - 1; i++) {
        const from = actual.points[i]!;
        const to = actual.points[i + 1]!;

        // If crossing the surface line (x = 300), must be at a valid hit point
        if ((from.x < 300 && to.x > 300) || (from.x > 300 && to.x < 300)) {
          // The crossing point should be exactly on the surface
          const t = (300 - from.x) / (to.x - from.x);
          const crossingY = from.y + t * (to.y - from.y);

          // Must be within segment bounds
          expect(crossingY).toBeGreaterThanOrEqual(199);
          expect(crossingY).toBeLessThanOrEqual(401);
        }
      }
    });

    it("should handle perpendicular surface correctly", () => {
      // Setup: Horizontal surface, arrow coming from below

      const player: Vector2 = { x: 300, y: 400 };
      const cursor: Vector2 = { x: 300, y: 100 };

      const surface = createRicochetSurface(
        "horizontal",
        { x: 200, y: 250 },
        { x: 400, y: 250 }
      );

      const plannedSurfaces = [surface];
      const allSurfaces = [surface];

      const actual = buildActualPath(player, cursor, plannedSurfaces, allSurfaces);

      // Should hit surface at y=250
      expect(actual.points.length).toBeGreaterThanOrEqual(2);
      expect(actual.points[1]!.y).toBeCloseTo(250, 0);

      // After vertical reflection, y should continue decreasing
      // (or the path ends at the surface if it's treated as obstruction)
    });
  });

  describe("Edge Cases", () => {
    it("should handle no planned surfaces (direct path)", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 500, y: 300 };

      const actual = buildActualPath(player, cursor, [], []);

      expect(actual.points.length).toBe(2);
      expect(actual.points[0]).toEqual(player);
      expect(actual.points[1]).toEqual(cursor);
      expect(actual.reachedCursor).toBe(true);
    });

    it("should handle ray missing all surfaces", () => {
      const player: Vector2 = { x: 100, y: 100 };
      const cursor: Vector2 = { x: 200, y: 100 };

      // Surface is below the ray - NOT in the plan
      const surface = createRicochetSurface(
        "below",
        { x: 150, y: 300 },
        { x: 150, y: 400 }
      );

      // No planned surfaces - just direct path
      const actual = buildActualPath(player, cursor, [], [surface]);

      // Should reach cursor without hitting surface
      expect(actual.reachedCursor).toBe(true);
      expect(actual.points.length).toBe(2);
      expect(actual.points[0]).toEqual(player);
      expect(actual.points[1]).toEqual(cursor);
    });

    it("should handle multiple reflections", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 500, y: 300 };

      // Two parallel vertical surfaces
      const surface1 = createRicochetSurface(
        "left",
        { x: 200, y: 200 },
        { x: 200, y: 400 }
      );
      const surface2 = createRicochetSurface(
        "right",
        { x: 400, y: 200 },
        { x: 400, y: 400 }
      );

      const plannedSurfaces = [surface1, surface2];
      const allSurfaces = [surface1, surface2];

      const actual = buildActualPath(player, cursor, plannedSurfaces, allSurfaces);

      // Should hit first surface, reflect, potentially hit second
      expect(actual.points.length).toBeGreaterThanOrEqual(2);
      expect(actual.points[1]!.x).toBeCloseTo(200, 0);
    });
  });
});

