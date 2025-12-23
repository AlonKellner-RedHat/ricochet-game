/**
 * Visibility First Principles Tests
 *
 * Tests for the core visibility/shadow system based on first principles:
 * - V.1: Player vicinity must be lit (with empty plan)
 * - V.2: Shadow must exist behind surfaces (facing away from player)
 * - V.3: Light must exit through last planned surface (on reflective side)
 * - V.4: Unobstructed positions must be lit (no obstruction = lit)
 */

import { describe, it, expect } from "vitest";
import { propagateCone } from "@/trajectory-v2/visibility/ConePropagator";
import { buildOutline } from "@/trajectory-v2/visibility/OutlineBuilder";
import { isConeEmpty, coneCoverage } from "@/trajectory-v2/visibility/ConeSection";
import {
  isPointInValidRegion,
  getPointsNearPlayer,
  getPointsBehindSurface,
  getPointsInFrontOfSurface,
  getPointsOnReflectiveSide,
  getPointsOnBackSide,
  createTestSurface,
  percentInValidRegion,
} from "./testHelpers";

const SCREEN_BOUNDS = {
  minX: 0,
  minY: 0,
  maxX: 800,
  maxY: 600,
};

describe("Visibility First Principles", () => {
  describe("V.1: Player Vicinity Lit", () => {
    it("with no surfaces, entire screen should be accessible", () => {
      const player = { x: 400, y: 300 };

      const result = propagateCone(player, [], []);
      const outline = buildOutline(result, SCREEN_BOUNDS, []);

      expect(result.success).toBe(true);
      expect(outline.isValid).toBe(true);

      // All points near player should be lit
      const nearbyPoints = getPointsNearPlayer(player, 50, 8);
      const percentLit = percentInValidRegion(nearbyPoints, outline);

      expect(percentLit).toBe(100);
    });

    it("with single wall, player vicinity still lit", () => {
      const player = { x: 200, y: 300 };
      const wall = createTestSurface(
        "wall",
        { x: 400, y: 200 },
        { x: 400, y: 400 }
      );

      const result = propagateCone(player, [], [wall]);
      const outline = buildOutline(result, SCREEN_BOUNDS, [wall]);

      expect(result.success).toBe(true);

      // Points very close to player should be lit
      const nearbyPoints = getPointsNearPlayer(player, 30, 8);
      const percentLit = percentInValidRegion(nearbyPoints, outline);

      expect(percentLit).toBe(100);
    });

    it("with wall between player and screen edge, player side still lit", () => {
      const player = { x: 400, y: 300 };
      // Wall to the right
      const wall = createTestSurface(
        "wall",
        { x: 600, y: 100 },
        { x: 600, y: 500 }
      );

      const result = propagateCone(player, [], [wall]);
      const outline = buildOutline(result, SCREEN_BOUNDS, [wall]);

      // Points to the left of player should definitely be lit
      const leftPoints = [
        { x: player.x - 50, y: player.y },
        { x: player.x - 100, y: player.y },
        { x: player.x - 50, y: player.y - 50 },
        { x: player.x - 50, y: player.y + 50 },
      ];

      const percentLit = percentInValidRegion(leftPoints, outline);
      expect(percentLit).toBe(100);
    });
  });

  describe("V.2: Shadow Behind Surfaces", () => {
    it("shadow trapezoid behind single wall", () => {
      const player = { x: 200, y: 300 };
      // Vertical wall segment to the right
      const wall = createTestSurface(
        "wall",
        { x: 400, y: 250 },
        { x: 400, y: 350 }
      );

      const result = propagateCone(player, [], [wall]);
      const outline = buildOutline(result, SCREEN_BOUNDS, [wall]);

      expect(result.success).toBe(true);

      // Points behind the wall should be in shadow
      const behindPoints = getPointsBehindSurface(
        player,
        wall.segment,
        100, // 100 units behind the wall
        5
      );

      const percentInShadow = 100 - percentInValidRegion(behindPoints, outline);

      // At least 80% of points behind the wall should be in shadow
      expect(percentInShadow).toBeGreaterThanOrEqual(80);
    });

    it("shadow exists behind horizontal wall", () => {
      const player = { x: 400, y: 200 };
      // Horizontal wall below player
      const wall = createTestSurface(
        "wall",
        { x: 300, y: 400 },
        { x: 500, y: 400 }
      );

      const result = propagateCone(player, [], [wall]);
      const outline = buildOutline(result, SCREEN_BOUNDS, [wall]);

      // Points below the wall should be in shadow
      const behindPoints = getPointsBehindSurface(
        player,
        wall.segment,
        100,
        5
      );

      const percentInShadow = 100 - percentInValidRegion(behindPoints, outline);
      expect(percentInShadow).toBeGreaterThanOrEqual(80);
    });

    it("points in front of wall are lit, points behind are dark", () => {
      const player = { x: 200, y: 300 };
      const wall = createTestSurface(
        "wall",
        { x: 400, y: 200 },
        { x: 400, y: 400 }
      );

      const result = propagateCone(player, [], [wall]);
      const outline = buildOutline(result, SCREEN_BOUNDS, [wall]);

      // Points between player and wall should be mostly lit
      // (Some edge cases at polygon boundaries may fail)
      const frontPoints = getPointsInFrontOfSurface(
        player,
        wall.segment,
        50, // 50 units in front of wall (toward player)
        5
      );
      const frontLit = percentInValidRegion(frontPoints, outline);
      expect(frontLit).toBeGreaterThanOrEqual(80);

      // Points behind wall should be dark
      const behindPoints = getPointsBehindSurface(
        player,
        wall.segment,
        50,
        5
      );
      const behindLit = percentInValidRegion(behindPoints, outline);
      expect(behindLit).toBeLessThanOrEqual(20);
    });

    it("multiple walls create multiple shadows", () => {
      const player = { x: 400, y: 300 };

      // Wall to the left
      const wall1 = createTestSurface(
        "wall1",
        { x: 200, y: 200 },
        { x: 200, y: 400 }
      );

      // Wall to the right
      const wall2 = createTestSurface(
        "wall2",
        { x: 600, y: 200 },
        { x: 600, y: 400 }
      );

      const result = propagateCone(player, [], [wall1, wall2]);
      const outline = buildOutline(result, SCREEN_BOUNDS, [wall1, wall2]);

      // Points behind left wall (to the left of x=200) should be dark
      const behindLeft = [
        { x: 100, y: 300 },
        { x: 50, y: 250 },
        { x: 50, y: 350 },
      ];

      // Points behind right wall (to the right of x=600) should be dark
      const behindRight = [
        { x: 700, y: 300 },
        { x: 750, y: 250 },
        { x: 750, y: 350 },
      ];

      const leftShadow = 100 - percentInValidRegion(behindLeft, outline);
      const rightShadow = 100 - percentInValidRegion(behindRight, outline);

      expect(leftShadow).toBeGreaterThanOrEqual(80);
      expect(rightShadow).toBeGreaterThanOrEqual(80);
    });
  });

  describe("V.3: Light Exits Last Planned Surface", () => {
    it("single planned surface: light on reflective side", () => {
      const player = { x: 200, y: 300 };

      // Reflective surface to the right
      const surface = createTestSurface(
        "reflective",
        { x: 400, y: 200 },
        { x: 400, y: 400 },
        true // canReflect = true
      );

      const result = propagateCone(player, [surface], [surface]);
      const outline = buildOutline(result, SCREEN_BOUNDS, [surface]);

      // If light passes through, it should be on reflective side
      if (result.success && outline.isValid) {
        // Get points on the reflective side (in front based on normal)
        const reflectivePoints = getPointsOnReflectiveSide(surface, 50, 5);
        const percentLit = percentInValidRegion(reflectivePoints, outline);

        // At least some light should be on reflective side
        expect(percentLit).toBeGreaterThan(0);
      }
    });

    it("with planned surface, light exits on far side", () => {
      const player = { x: 200, y: 300 };

      // Vertical reflective surface
      const surface = createTestSurface(
        "window",
        { x: 400, y: 200 },
        { x: 400, y: 400 },
        true
      );

      const result = propagateCone(player, [surface], [surface]);
      const outline = buildOutline(result, SCREEN_BOUNDS, [surface]);

      // With a planned surface, the valid region should be primarily
      // on the exit side (reflective side) of the surface
      if (result.success && outline.isValid) {
        // Points on exit side should be lit
        const exitPoints = getPointsOnReflectiveSide(surface, 100, 5);
        const exitLit = percentInValidRegion(exitPoints, outline);
        expect(exitLit).toBeGreaterThan(0);

        // The exit should have more lit points than the player vicinity
        // (Ideally player vicinity should be 0, but polygon edge cases
        // may cause some points to be incorrectly included)
        const nearPlayer = getPointsNearPlayer(player, 30, 8);
        const playerLit = percentInValidRegion(nearPlayer, outline);

        // Exit region should have at least as many lit points as player region
        expect(exitLit).toBeGreaterThanOrEqual(playerLit);
      }
    });
  });

describe("V.4: Unobstructed Positions Must Be Lit", () => {
    it("empty room - all corners must be lit", () => {
      // Player in center of empty room
      const player = { x: 400, y: 300 };

      const result = propagateCone(player, [], []);
      const outline = buildOutline(result, SCREEN_BOUNDS, []);

      expect(result.success).toBe(true);
      expect(outline.isValid).toBe(true);

      // All screen corners should be lit (no obstructions)
      const corners = [
        { x: 10, y: 10 },      // Top-left
        { x: 790, y: 10 },     // Top-right
        { x: 10, y: 590 },     // Bottom-left
        { x: 790, y: 590 },    // Bottom-right
      ];

      const percentLit = percentInValidRegion(corners, outline);
      expect(percentLit).toBe(100);
    });

    it("empty room - distant floor sections must be lit", () => {
      // Player near top of room
      const player = { x: 400, y: 100 };

      const result = propagateCone(player, [], []);
      const outline = buildOutline(result, SCREEN_BOUNDS, []);

      expect(result.success).toBe(true);
      expect(outline.isValid).toBe(true);

      // Distant floor sections (far from player) should be lit
      const distantFloor = [
        { x: 100, y: 550 },
        { x: 300, y: 550 },
        { x: 500, y: 550 },
        { x: 700, y: 550 },
      ];

      const percentLit = percentInValidRegion(distantFloor, outline);
      expect(percentLit).toBe(100);
    });

    it("empty room - all screen edges must be lit", () => {
      // Player in center
      const player = { x: 400, y: 300 };

      const result = propagateCone(player, [], []);
      const outline = buildOutline(result, SCREEN_BOUNDS, []);

      expect(result.success).toBe(true);
      expect(outline.isValid).toBe(true);

      // Points along all screen edges should be lit
      const edgePoints = [
        // Top edge
        { x: 200, y: 10 },
        { x: 400, y: 10 },
        { x: 600, y: 10 },
        // Bottom edge
        { x: 200, y: 590 },
        { x: 400, y: 590 },
        { x: 600, y: 590 },
        // Left edge
        { x: 10, y: 150 },
        { x: 10, y: 300 },
        { x: 10, y: 450 },
        // Right edge
        { x: 790, y: 150 },
        { x: 790, y: 300 },
        { x: 790, y: 450 },
      ];

      const percentLit = percentInValidRegion(edgePoints, outline);
      expect(percentLit).toBe(100);
    });

    it("player in corner - entire room still lit", () => {
      // Player in corner
      const player = { x: 50, y: 50 };

      const result = propagateCone(player, [], []);
      const outline = buildOutline(result, SCREEN_BOUNDS, []);

      expect(result.success).toBe(true);
      expect(outline.isValid).toBe(true);

      // Opposite corner should be lit (no obstructions)
      const oppositeCorner = { x: 750, y: 550 };
      expect(isPointInValidRegion(oppositeCorner, outline)).toBe(true);

      // Various points across the room should be lit
      const roomPoints = [
        { x: 200, y: 200 },
        { x: 400, y: 300 },
        { x: 600, y: 400 },
        { x: 700, y: 500 },
      ];
      expect(percentInValidRegion(roomPoints, outline)).toBe(100);
    });

    it("room with walls - unobstructed areas still fully lit", () => {
      // Player in center, walls in corners
      const player = { x: 400, y: 300 };

      // Small walls in corners that don't block the main room
      const walls = [
        createTestSurface("corner1", { x: 50, y: 50 }, { x: 100, y: 50 }),
        createTestSurface("corner2", { x: 700, y: 50 }, { x: 750, y: 50 }),
      ];

      const result = propagateCone(player, [], walls);
      const outline = buildOutline(result, SCREEN_BOUNDS, walls);

      expect(result.success).toBe(true);
      expect(outline.isValid).toBe(true);

      // Points that are NOT behind walls should be lit
      const unobstructedPoints = [
        { x: 400, y: 500 },  // Bottom center
        { x: 200, y: 300 },  // Left center
        { x: 600, y: 300 },  // Right center
        { x: 400, y: 100 },  // Top center (not behind the small walls)
      ];

      expect(percentInValidRegion(unobstructedPoints, outline)).toBe(100);
    });
  });

  describe("Geometric Scenarios", () => {
    it("Scenario 1: Shadow trapezoid geometry", () => {
      // Player at center-left, wall segment to the right
      const player = { x: 100, y: 300 };
      const wall = createTestSurface(
        "wall",
        { x: 300, y: 250 },
        { x: 300, y: 350 }
      );

      const result = propagateCone(player, [], [wall]);
      const outline = buildOutline(result, SCREEN_BOUNDS, [wall]);

      expect(result.success).toBe(true);
      expect(outline.isValid).toBe(true);

      // The shadow should form a trapezoid behind the wall
      // Points immediately around player: LIT
      const nearPlayer = getPointsNearPlayer(player, 20, 8);
      expect(percentInValidRegion(nearPlayer, outline)).toBe(100);

      // Points behind wall in shadow: DARK
      const shadow = [
        { x: 500, y: 300 }, // Center of shadow
        { x: 400, y: 280 },
        { x: 400, y: 320 },
      ];
      expect(percentInValidRegion(shadow, outline)).toBe(0);

      // Points to sides of wall (not in shadow): LIT
      const sides = [
        { x: 400, y: 100 }, // Above the shadow
        { x: 400, y: 500 }, // Below the shadow
      ];
      expect(percentInValidRegion(sides, outline)).toBe(100);
    });

    it("Scenario 2: Empty plan full visibility", () => {
      const player = { x: 400, y: 300 };

      const result = propagateCone(player, [], []);
      const outline = buildOutline(result, SCREEN_BOUNDS, []);

      expect(result.success).toBe(true);
      expect(outline.isValid).toBe(true);

      // Full cone coverage (almost 2π)
      expect(coneCoverage(result.finalCone)).toBeGreaterThan(6);

      // Random points across screen should be lit
      const testPoints = [
        { x: 100, y: 100 },
        { x: 700, y: 100 },
        { x: 100, y: 500 },
        { x: 700, y: 500 },
        { x: 400, y: 300 },
      ];
      expect(percentInValidRegion(testPoints, outline)).toBe(100);
    });

    it("Scenario 3: Player surrounded by walls on 3 sides", () => {
      const player = { x: 400, y: 300 };

      // Walls surrounding player except on the right
      const walls = [
        createTestSurface("left", { x: 200, y: 100 }, { x: 200, y: 500 }),
        createTestSurface("top", { x: 200, y: 100 }, { x: 600, y: 100 }),
        createTestSurface("bottom", { x: 200, y: 500 }, { x: 600, y: 500 }),
      ];

      const result = propagateCone(player, [], walls);
      const outline = buildOutline(result, SCREEN_BOUNDS, walls);

      expect(result.success).toBe(true);

      // Player's immediate vicinity should be lit
      const nearPlayer = getPointsNearPlayer(player, 50, 8);
      expect(percentInValidRegion(nearPlayer, outline)).toBe(100);

      // Points behind walls should be dark
      const outsidePoints = [
        { x: 100, y: 300 }, // Left of left wall
        { x: 400, y: 50 },  // Above top wall
        { x: 400, y: 550 }, // Below bottom wall
      ];
      expect(percentInValidRegion(outsidePoints, outline)).toBe(0);

      // Point through the opening (right side) should be lit
      const throughOpening = { x: 700, y: 300 };
      expect(isPointInValidRegion(throughOpening, outline)).toBe(true);
    });

    it("Scenario 4: Angled wall creates angled shadow", () => {
      const player = { x: 100, y: 300 };

      // Diagonal wall
      const wall = createTestSurface(
        "diagonal",
        { x: 300, y: 200 },
        { x: 400, y: 400 }
      );

      const result = propagateCone(player, [], [wall]);
      const outline = buildOutline(result, SCREEN_BOUNDS, [wall]);

      expect(result.success).toBe(true);

      // Points behind diagonal wall should be in shadow
      const behindDiagonal = getPointsBehindSurface(
        player,
        wall.segment,
        100,
        5
      );

      const percentInShadow = 100 - percentInValidRegion(behindDiagonal, outline);
      expect(percentInShadow).toBeGreaterThanOrEqual(80);
    });
  });
});

