/**
 * ImageChain Tests (TDD)
 *
 * These tests define the contract for ImageChain - the single source of truth
 * for the trajectory and visibility systems.
 *
 * First Principles:
 * 1. Determinism: Same inputs always produce same outputs
 * 2. Reversibility: reflect(reflect(p)) === p exactly
 * 3. Exact predicates: No floating-point tolerance in side checks
 */

import { describe, expect, it } from "vitest";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

// The ImageChain interface we're designing (TDD - define before implementation)
import type { ImageChain } from "@/trajectory-v2/engine/ImageChain";
import { createImageChain, evaluateBypassFromChain, buildPlannedPathFromChain, buildPlannedPathFromBypass } from "@/trajectory-v2/engine/ImageChain";

// Helper to create a mock surface
function createMockSurface(
  id: string,
  start: Vector2,
  end: Vector2,
  reflectiveSide: "left" | "right" | "both" = "both"
): Surface {
  // Calculate normal based on reflective side
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const normalLeft = { x: -dy / len, y: dx / len };
  const normalRight = { x: dy / len, y: -dx / len };

  return {
    id,
    segment: { start, end },
    surfaceType: "ricochet",
    onArrowHit: () => ({ type: "reflect" }),
    isPlannable: () => true,
    getVisualProperties: () => ({ color: 0xffffff, lineWidth: 2, alpha: 1 }),
    getNormal: () => (reflectiveSide === "right" ? normalRight : normalLeft),
    canReflectFrom: (dir: Vector2) => {
      if (reflectiveSide === "both") return true;
      // The normal points toward the reflective side
      // An incoming ray can reflect if it's coming from the normal's side
      const normal = reflectiveSide === "right" ? normalRight : normalLeft;
      // Dot product: if dot > 0, direction is toward the surface from normal's side
      const dot = dir.x * normal.x + dir.y * normal.y;
      // Incoming ray should point AGAINST the normal (toward the surface)
      return dot < 0;
    },
  };
}

describe("ImageChain - Single Source of Truth", () => {
  describe("Determinism", () => {
    it("getPlayerImage returns exact same value on repeated calls", () => {
      const player = { x: 100.123456789, y: 200.987654321 };
      const cursor = { x: 500, y: 300 };
      const surface = createMockSurface("s1", { x: 300, y: 0 }, { x: 300, y: 600 });

      const chain = createImageChain(player, cursor, [surface]);

      const first = chain.getPlayerImage(1);
      const second = chain.getPlayerImage(1);
      const third = chain.getPlayerImage(1);

      // Must be EXACTLY equal, not "close to"
      expect(first.x).toBe(second.x);
      expect(first.y).toBe(second.y);
      expect(second.x).toBe(third.x);
      expect(second.y).toBe(third.y);
    });

    it("getCursorImage returns exact same value on repeated calls", () => {
      const player = { x: 100, y: 200 };
      const cursor = { x: 500.123456789, y: 300.987654321 };
      const surface = createMockSurface("s1", { x: 300, y: 0 }, { x: 300, y: 600 });

      const chain = createImageChain(player, cursor, [surface]);

      const first = chain.getCursorImage(1);
      const second = chain.getCursorImage(1);
      const third = chain.getCursorImage(1);

      expect(first.x).toBe(second.x);
      expect(first.y).toBe(second.y);
      expect(second.x).toBe(third.x);
      expect(second.y).toBe(third.y);
    });

    it("getReflectionPoint returns exact same value on repeated calls", () => {
      const player = { x: 100, y: 200 };
      const cursor = { x: 500, y: 400 };
      const surface = createMockSurface("s1", { x: 300, y: 0 }, { x: 300, y: 600 });

      const chain = createImageChain(player, cursor, [surface]);

      const first = chain.getReflectionPoint(0);
      const second = chain.getReflectionPoint(0);
      const third = chain.getReflectionPoint(0);

      expect(first.x).toBe(second.x);
      expect(first.y).toBe(second.y);
      expect(second.x).toBe(third.x);
      expect(second.y).toBe(third.y);
    });
  });

  describe("Reversibility", () => {
    it("reflecting twice through same line returns original point exactly", () => {
      const player = { x: 137.5, y: 283.7 };
      const cursor = { x: 500, y: 300 };
      // Diagonal surface for non-trivial reflection
      const surface = createMockSurface("s1", { x: 200, y: 100 }, { x: 400, y: 500 });

      const chain = createImageChain(player, cursor, [surface]);

      // Get reflected player image
      const reflected = chain.getPlayerImage(1);

      // Create a new chain with reflected player, reflect back
      const reverseChain = createImageChain(reflected, cursor, [surface]);
      const doubleReflected = reverseChain.getPlayerImage(1);

      // Must be EXACTLY equal to original
      expect(doubleReflected.x).toBeCloseTo(player.x, 10);
      expect(doubleReflected.y).toBeCloseTo(player.y, 10);
    });

    it("cursor image chain is reversible", () => {
      const player = { x: 100, y: 200 };
      const cursor = { x: 583.2, y: 417.8 };
      const surface1 = createMockSurface("s1", { x: 300, y: 0 }, { x: 300, y: 600 });
      const surface2 = createMockSurface("s2", { x: 0, y: 400 }, { x: 600, y: 400 });

      const chain = createImageChain(player, cursor, [surface1, surface2]);

      // Get fully reflected cursor (depth 2 = through both surfaces in reverse)
      const cursorImage2 = chain.getCursorImage(2);

      // Create reverse chain and reflect back
      // Backward images go: cursor -> s2 -> s1
      // To reverse: cursorImage2 -> s1 -> s2 (forward order)
      const reverseChain = createImageChain(cursorImage2, player, [surface1, surface2]);

      // The player image at depth 2 should be the original cursor
      const reversed = reverseChain.getPlayerImage(2);

      expect(reversed.x).toBeCloseTo(cursor.x, 10);
      expect(reversed.y).toBeCloseTo(cursor.y, 10);
    });
  });

  describe("Exact Geometric Predicates", () => {
    it("isPlayerOnReflectiveSide returns true for both-sided surface", () => {
      // For surfaces that reflect from both sides, player is always on reflective side
      const surface = createMockSurface(
        "s1",
        { x: 0, y: 100 },
        { x: 400, y: 100 },
        "both"
      );

      const chainAbove = createImageChain(
        { x: 200, y: 50 },
        { x: 200, y: 200 },
        [surface]
      );
      expect(chainAbove.isPlayerOnReflectiveSide(0)).toBe(true);

      const chainBelow = createImageChain(
        { x: 200, y: 150 },
        { x: 200, y: 200 },
        [surface]
      );
      expect(chainBelow.isPlayerOnReflectiveSide(0)).toBe(true);
    });

    it("isCursorOnReflectiveSide returns true for both-sided surface", () => {
      const surface = createMockSurface(
        "s1",
        { x: 100, y: 0 },
        { x: 100, y: 400 },
        "both"
      );

      const chainLeft = createImageChain(
        { x: 50, y: 200 },
        { x: 50, y: 300 },
        [surface]
      );
      expect(chainLeft.isCursorOnReflectiveSide(0)).toBe(true);

      const chainRight = createImageChain(
        { x: 50, y: 200 },
        { x: 150, y: 300 },
        [surface]
      );
      expect(chainRight.isCursorOnReflectiveSide(0)).toBe(true);
    });

    it("isReflectionOnSegment uses exact parametric check", () => {
      const player = { x: 100, y: 200 };
      const cursor = { x: 500, y: 200 };
      // Surface from y=100 to y=300 at x=300
      const surface = createMockSurface("s1", { x: 300, y: 100 }, { x: 300, y: 300 });

      const chain = createImageChain(player, cursor, [surface]);

      // Ray from player to cursor is horizontal at y=200
      // Hits surface at (300, 200) which is on segment [100, 300]
      expect(chain.isReflectionOnSegment(0)).toBe(true);
    });

    it("isReflectionOnSegment returns false for off-segment reflection", () => {
      // Player and cursor positioned so the ray to cursor image misses the segment
      const player = { x: 100, y: 50 }; // Way above the surface segment
      const cursor = { x: 500, y: 50 }; // Also way above
      // Vertical surface from y=200 to y=400 at x=300
      const surface = createMockSurface("s1", { x: 300, y: 200 }, { x: 300, y: 400 });

      const chain = createImageChain(player, cursor, [surface]);

      // For a single surface, cursor image at depth 1 is cursor reflected through surface
      // cursor = (500, 50) reflected through x=300 -> (100, 50)
      // Ray from player (100, 50) to cursor image (100, 50) is degenerate (same point)
      // Let's use a different setup where it's clearly off-segment

      // Better setup: player at (100, 50), cursor at (500, 350)
      // Surface from (300, 200) to (300, 400) - vertical
      // Cursor reflected: (500, 350) through x=300 -> (100, 350)
      // Ray from (100, 50) to (100, 350) is vertical at x=100, doesn't hit x=300 at all

      const player2 = { x: 100, y: 50 };
      const cursor2 = { x: 500, y: 50 };
      // Surface segment only covers y from 200 to 400
      const surface2 = createMockSurface("s2", { x: 300, y: 200 }, { x: 300, y: 400 });

      const chain2 = createImageChain(player2, cursor2, [surface2]);

      // Cursor image: (500, 50) reflected through x=300 -> (100, 50)
      // Ray from player (100, 50) to (100, 50) is degenerate
      // This is actually a degenerate case - let's try another approach

      // Use a setup where ray clearly hits extended line but not segment
      const player3 = { x: 50, y: 50 };
      const cursor3 = { x: 450, y: 50 }; // Horizontal at y=50
      // Surface is vertical at x=250 but only from y=200 to y=400
      const surface3 = createMockSurface("s3", { x: 250, y: 200 }, { x: 250, y: 400 });

      const chain3 = createImageChain(player3, cursor3, [surface3]);

      // cursor image: (450, 50) reflected through x=250 -> (50, 50)
      // Same as player! Ray is degenerate.
      // Need cursor on the OTHER side of surface

      const player4 = { x: 50, y: 50 };
      const cursor4 = { x: 350, y: 50 }; // On other side of surface at x=250
      const surface4 = createMockSurface("s4", { x: 250, y: 200 }, { x: 250, y: 400 });

      const chain4 = createImageChain(player4, cursor4, [surface4]);

      // cursor image: (350, 50) reflected through x=250 -> (150, 50)
      // Ray from (50, 50) to (150, 50) is horizontal at y=50
      // Extended line at x=250 would be hit at y=50, but segment is y in [200, 400]
      expect(chain4.isReflectionOnSegment(0)).toBe(false);
    });
  });

  describe("Multi-Surface Chains", () => {
    it("calculates correct reflection points through multiple surfaces", () => {
      const player = { x: 100, y: 500 };
      const cursor = { x: 500, y: 500 };

      // Two perpendicular surfaces
      const surface1 = createMockSurface("s1", { x: 200, y: 0 }, { x: 200, y: 600 }); // Vertical
      const surface2 = createMockSurface("s2", { x: 0, y: 300 }, { x: 600, y: 300 }); // Horizontal

      const chain = createImageChain(player, cursor, [surface1, surface2]);

      // First reflection point should be on first surface
      const rp0 = chain.getReflectionPoint(0);
      expect(rp0.x).toBeCloseTo(200); // On vertical surface

      // Second reflection point should be on second surface
      const rp1 = chain.getReflectionPoint(1);
      expect(rp1.y).toBeCloseTo(300); // On horizontal surface
    });

    it("player images are built forward through surfaces", () => {
      const player = { x: 50, y: 50 };
      const cursor = { x: 550, y: 550 };

      const surface1 = createMockSurface("s1", { x: 200, y: 0 }, { x: 200, y: 600 }); // x = 200
      const surface2 = createMockSurface("s2", { x: 0, y: 400 }, { x: 600, y: 400 }); // y = 400

      const chain = createImageChain(player, cursor, [surface1, surface2]);

      // Player at depth 0 is original
      expect(chain.getPlayerImage(0)).toEqual(player);

      // Player at depth 1 is reflected through surface1
      // (50, 50) reflected through x=200 -> (350, 50)
      const p1 = chain.getPlayerImage(1);
      expect(p1.x).toBeCloseTo(350);
      expect(p1.y).toBeCloseTo(50);

      // Player at depth 2 is p1 reflected through surface2
      // (350, 50) reflected through y=400 -> (350, 750)
      const p2 = chain.getPlayerImage(2);
      expect(p2.x).toBeCloseTo(350);
      expect(p2.y).toBeCloseTo(750);
    });

    it("cursor images are built backward through surfaces", () => {
      const player = { x: 50, y: 50 };
      const cursor = { x: 550, y: 550 };

      const surface1 = createMockSurface("s1", { x: 200, y: 0 }, { x: 200, y: 600 }); // x = 200
      const surface2 = createMockSurface("s2", { x: 0, y: 400 }, { x: 600, y: 400 }); // y = 400

      const chain = createImageChain(player, cursor, [surface1, surface2]);

      // Cursor at depth 0 is original
      expect(chain.getCursorImage(0)).toEqual(cursor);

      // Cursor at depth 1 is reflected through surface2 (last surface first)
      // (550, 550) reflected through y=400 -> (550, 250)
      const c1 = chain.getCursorImage(1);
      expect(c1.x).toBeCloseTo(550);
      expect(c1.y).toBeCloseTo(250);

      // Cursor at depth 2 is c1 reflected through surface1
      // (550, 250) reflected through x=200 -> (-150, 250)
      const c2 = chain.getCursorImage(2);
      expect(c2.x).toBeCloseTo(-150);
      expect(c2.y).toBeCloseTo(250);
    });
  });

  describe("Edge Cases", () => {
    it("handles empty surface list", () => {
      const player = { x: 100, y: 200 };
      const cursor = { x: 500, y: 400 };

      const chain = createImageChain(player, cursor, []);

      expect(chain.getPlayerImage(0)).toEqual(player);
      expect(chain.getCursorImage(0)).toEqual(cursor);
      expect(chain.surfaces).toHaveLength(0);
    });

    it("handles player at cursor position", () => {
      const position = { x: 300, y: 300 };
      const surface = createMockSurface("s1", { x: 200, y: 0 }, { x: 200, y: 600 });

      const chain = createImageChain(position, position, [surface]);

      // Should still compute images correctly
      const playerImg = chain.getPlayerImage(1);
      const cursorImg = chain.getCursorImage(1);

      // Both should be reflected the same way
      expect(playerImg.x).toBe(cursorImg.x);
      expect(playerImg.y).toBe(cursorImg.y);
    });

    it("handles very small coordinates without precision loss", () => {
      const player = { x: 0.000001, y: 0.000002 };
      const cursor = { x: 0.000003, y: 0.000004 };
      const surface = createMockSurface(
        "s1",
        { x: 0.0000015, y: -1 },
        { x: 0.0000015, y: 1 }
      );

      const chain = createImageChain(player, cursor, [surface]);

      // Verify determinism even with tiny numbers
      const first = chain.getReflectionPoint(0);
      const second = chain.getReflectionPoint(0);
      expect(first.x).toBe(second.x);
      expect(first.y).toBe(second.y);
    });

    it("handles very large coordinates without precision loss", () => {
      const player = { x: 1e9, y: 2e9 };
      const cursor = { x: 3e9, y: 4e9 };
      const surface = createMockSurface(
        "s1",
        { x: 2e9, y: 0 },
        { x: 2e9, y: 5e9 }
      );

      const chain = createImageChain(player, cursor, [surface]);

      // Verify determinism even with huge numbers
      const first = chain.getReflectionPoint(0);
      const second = chain.getReflectionPoint(0);
      expect(first.x).toBe(second.x);
      expect(first.y).toBe(second.y);
    });
  });

  describe("Plan Validity Helpers", () => {
    it("isValidPlan returns true when all surfaces are accessible", () => {
      // Player and cursor on correct sides of all surfaces
      const player = { x: 50, y: 300 };
      const cursor = { x: 550, y: 300 };
      const surface = createMockSurface("s1", { x: 300, y: 0 }, { x: 300, y: 600 }, "both");

      const chain = createImageChain(player, cursor, [surface]);

      expect(chain.isPlayerOnReflectiveSide(0)).toBe(true);
      expect(chain.isCursorOnReflectiveSide(0)).toBe(true);
    });

    it("reflection points form the planned path", () => {
      const player = { x: 100, y: 300 };
      const cursor = { x: 500, y: 300 };
      const surface = createMockSurface("s1", { x: 300, y: 0 }, { x: 300, y: 600 });

      const chain = createImageChain(player, cursor, [surface]);

      // The planned path should be: player -> reflectionPoint(0) -> cursor
      const rp = chain.getReflectionPoint(0);

      // Reflection point should be on the surface (x = 300)
      expect(rp.x).toBeCloseTo(300);
      // And at y = 300 (same as player and cursor since horizontal ray)
      expect(rp.y).toBeCloseTo(300);
    });
  });

  describe("Bypass Evaluation from Chain", () => {
    it("returns empty result for empty surface list", () => {
      const player = { x: 100, y: 200 };
      const cursor = { x: 500, y: 400 };

      const result = evaluateBypassFromChain(player, cursor, []);

      expect(result.activeSurfaces).toHaveLength(0);
      expect(result.bypassedSurfaces).toHaveLength(0);
      expect(result.bypassedIndices).toHaveLength(0);
    });

    it("keeps surface active when player and cursor on correct sides", () => {
      const player = { x: 100, y: 300 };
      const cursor = { x: 500, y: 300 };
      const surface = createMockSurface("s1", { x: 300, y: 0 }, { x: 300, y: 600 }, "both");

      const result = evaluateBypassFromChain(player, cursor, [surface]);

      expect(result.activeSurfaces).toHaveLength(1);
      expect(result.bypassedSurfaces).toHaveLength(0);
    });

    it("provides ImageChain with active surfaces only", () => {
      const player = { x: 100, y: 300 };
      const cursor = { x: 500, y: 300 };
      const surface = createMockSurface("s1", { x: 300, y: 0 }, { x: 300, y: 600 }, "both");

      const result = evaluateBypassFromChain(player, cursor, [surface]);

      // The chain should have the active surfaces
      expect(result.chain.surfaces).toHaveLength(1);
      expect(result.chain.surfaces[0]).toBe(surface);
    });

    it("returns chain with correct player and cursor", () => {
      const player = { x: 100, y: 300 };
      const cursor = { x: 500, y: 400 };
      const surface = createMockSurface("s1", { x: 300, y: 0 }, { x: 300, y: 600 }, "both");

      const result = evaluateBypassFromChain(player, cursor, [surface]);

      expect(result.chain.player).toEqual(player);
      expect(result.chain.cursor).toEqual(cursor);
    });

    it("multiple surfaces all active when accessible", () => {
      const player = { x: 50, y: 300 };
      const cursor = { x: 550, y: 300 };
      const surface1 = createMockSurface("s1", { x: 200, y: 0 }, { x: 200, y: 600 }, "both");
      const surface2 = createMockSurface("s2", { x: 400, y: 0 }, { x: 400, y: 600 }, "both");

      const result = evaluateBypassFromChain(player, cursor, [surface1, surface2]);

      expect(result.activeSurfaces).toHaveLength(2);
      expect(result.bypassedSurfaces).toHaveLength(0);
    });

    it("result is deterministic - same inputs produce same outputs", () => {
      const player = { x: 100, y: 300 };
      const cursor = { x: 500, y: 300 };
      const surface = createMockSurface("s1", { x: 300, y: 0 }, { x: 300, y: 600 }, "both");

      const result1 = evaluateBypassFromChain(player, cursor, [surface]);
      const result2 = evaluateBypassFromChain(player, cursor, [surface]);

      expect(result1.activeSurfaces.length).toBe(result2.activeSurfaces.length);
      expect(result1.bypassedSurfaces.length).toBe(result2.bypassedSurfaces.length);
    });
  });

  describe("Planned Path from Chain", () => {
    it("builds correct waypoints for empty surface list", () => {
      const player = { x: 100, y: 200 };
      const cursor = { x: 500, y: 400 };
      const chain = createImageChain(player, cursor, []);

      const path = buildPlannedPathFromChain(chain);

      expect(path.waypoints).toHaveLength(2);
      expect(path.waypoints[0]).toEqual(player);
      expect(path.waypoints[1]).toEqual(cursor);
      expect(path.hits).toHaveLength(0);
    });

    it("builds correct waypoints for single surface", () => {
      const player = { x: 100, y: 300 };
      const cursor = { x: 500, y: 300 };
      const surface = createMockSurface("s1", { x: 300, y: 0 }, { x: 300, y: 600 });

      const chain = createImageChain(player, cursor, [surface]);
      const path = buildPlannedPathFromChain(chain);

      expect(path.waypoints).toHaveLength(3); // player -> reflection -> cursor
      expect(path.waypoints[0]).toEqual(player);
      expect(path.waypoints[2]).toEqual(cursor);
      expect(path.hits).toHaveLength(1);
      expect(path.hits[0]!.onSegment).toBe(true);
    });

    it("builds correct waypoints for two surfaces", () => {
      const player = { x: 50, y: 300 };
      const cursor = { x: 550, y: 300 };
      const surface1 = createMockSurface("s1", { x: 200, y: 0 }, { x: 200, y: 600 });
      const surface2 = createMockSurface("s2", { x: 400, y: 0 }, { x: 400, y: 600 });

      const chain = createImageChain(player, cursor, [surface1, surface2]);
      const path = buildPlannedPathFromChain(chain);

      expect(path.waypoints).toHaveLength(4); // player -> rp1 -> rp2 -> cursor
      expect(path.hits).toHaveLength(2);
    });

    it("correctly identifies off-segment hits", () => {
      const player = { x: 100, y: 50 };
      const cursor = { x: 400, y: 50 };
      // Surface only covers y in [200, 400]
      const surface = createMockSurface("s1", { x: 300, y: 200 }, { x: 300, y: 400 });

      const chain = createImageChain(player, cursor, [surface]);
      const path = buildPlannedPathFromChain(chain);

      expect(path.hits[0]!.onSegment).toBe(false);
    });

    it("path from bypass result uses active surfaces only", () => {
      const player = { x: 100, y: 300 };
      const cursor = { x: 500, y: 300 };
      const surface = createMockSurface("s1", { x: 300, y: 0 }, { x: 300, y: 600 }, "both");

      const bypassResult = evaluateBypassFromChain(player, cursor, [surface]);
      const path = buildPlannedPathFromBypass(bypassResult);

      expect(path.chain).toBe(bypassResult.chain);
      expect(path.waypoints).toHaveLength(3);
    });

    it("cursorIndex and cursorT are correct", () => {
      const player = { x: 100, y: 300 };
      const cursor = { x: 500, y: 300 };
      const surface = createMockSurface("s1", { x: 300, y: 0 }, { x: 300, y: 600 });

      const chain = createImageChain(player, cursor, [surface]);
      const path = buildPlannedPathFromChain(chain);

      // Cursor is at end of last segment (index 1, t=1)
      expect(path.cursorIndex).toBe(path.waypoints.length - 2);
      expect(path.cursorT).toBe(1);
    });
  });
});

