import { checkCollisions } from "@/player/CollisionHelper";
import { Player } from "@/player/Player";
import { WallSurface } from "@/surfaces";
import type { MovementInput } from "@/types";
import { describe, expect, it } from "vitest";

function noInput(): MovementInput {
  return { left: false, right: false, jump: false, jumpHeld: false };
}

function leftInput(): MovementInput {
  return { left: true, right: false, jump: false, jumpHeld: false };
}

function rightInput(): MovementInput {
  return { left: false, right: true, jump: false, jumpHeld: false };
}

describe("Wall Collision", () => {
  describe("CollisionHelper wall detection", () => {
    it("should detect left wall when moving left and very close", () => {
      // Left wall at x=50
      const leftWall = new WallSurface("leftWall", {
        start: { x: 50, y: 0 },
        end: { x: 50, y: 500 },
      });

      // Player at x=67 (left edge at 67-16=51), 1 pixel from wall, moving left
      const position = { x: 67, y: 250 };
      const velocity = { x: -100, y: 0 };
      const width = 32;
      const height = 48;

      const result = checkCollisions(position, velocity, width, height, [leftWall]);

      expect(result.hitLeftWall).toBe(true);
      expect(result.leftWallX).toBe(50);
    });

    it("should detect right wall when moving right and very close", () => {
      // Right wall at x=500
      const rightWall = new WallSurface("rightWall", {
        start: { x: 500, y: 0 },
        end: { x: 500, y: 500 },
      });

      // Player at x=483 (right edge at 483+16=499), 1 pixel from wall, moving right
      const position = { x: 483, y: 250 };
      const velocity = { x: 100, y: 0 };
      const width = 32;
      const height = 48;

      const result = checkCollisions(position, velocity, width, height, [rightWall]);

      expect(result.hitRightWall).toBe(true);
      expect(result.rightWallX).toBe(500);
    });

    it("should NOT detect wall when not moving towards it and not overlapping", () => {
      const leftWall = new WallSurface("leftWall", {
        start: { x: 50, y: 0 },
        end: { x: 50, y: 500 },
      });

      // Player near wall but not moving horizontally (just falling)
      // Player left edge at 70-16=54, wall at 50, so 4 pixels gap
      const position = { x: 70, y: 250 };
      const velocity = { x: 0, y: 100 }; // Falling, no horizontal movement
      const width = 32;
      const height = 48;

      const result = checkCollisions(position, velocity, width, height, [leftWall]);

      // Wall should NOT be detected when not moving towards it
      // This allows the player to move away from walls
      expect(result.hitLeftWall).toBe(false);
    });

    it("should detect wall when overlapping even if moving away", () => {
      const leftWall = new WallSurface("leftWall", {
        start: { x: 50, y: 0 },
        end: { x: 50, y: 500 },
      });

      // Player overlapping the wall (left edge at 40, wall at 50, right edge at 72)
      const position = { x: 56, y: 250 };
      const velocity = { x: 100, y: 0 }; // Moving right (away from wall)
      const width = 32;
      const height = 48;

      const result = checkCollisions(position, velocity, width, height, [leftWall]);

      // Wall should be detected because player overlaps it
      expect(result.hitLeftWall).toBe(true);
      expect(result.leftWallX).toBe(50);
    });
  });

  describe("Player wall collision integration", () => {
    it("should stop at left wall when moving left", () => {
      const leftWall = new WallSurface("leftWall", {
        start: { x: 50, y: 0 },
        end: { x: 50, y: 600 },
      });
      const floor = new WallSurface("floor", {
        start: { x: 0, y: 500 },
        end: { x: 1000, y: 500 },
      });

      // Player starts grounded, near left wall
      const player = new Player({ x: 100, y: 476 });
      const surfaces = [leftWall, floor];

      // First, ground the player
      player.update(0.016, noInput(), surfaces);
      expect(player.isGrounded).toBe(true);

      // Now move left for many frames
      for (let i = 0; i < 100; i++) {
        player.update(0.016, leftInput(), surfaces);
      }

      // Player should be stopped at wall (left edge at wall x + half width)
      const leftEdge = player.position.x - 16;
      expect(leftEdge).toBeGreaterThanOrEqual(50);
    });

    it("should stop at right wall when moving right", () => {
      const rightWall = new WallSurface("rightWall", {
        start: { x: 500, y: 0 },
        end: { x: 500, y: 600 },
      });
      const floor = new WallSurface("floor", {
        start: { x: 0, y: 500 },
        end: { x: 1000, y: 500 },
      });

      // Player starts grounded, to the left of right wall
      const player = new Player({ x: 400, y: 476 });
      const surfaces = [rightWall, floor];

      // First, ground the player
      player.update(0.016, noInput(), surfaces);
      expect(player.isGrounded).toBe(true);

      // Now move right for many frames
      for (let i = 0; i < 100; i++) {
        player.update(0.016, rightInput(), surfaces);
      }

      // Player should be stopped at wall (right edge at wall x - half width)
      const rightEdge = player.position.x + 16;
      expect(rightEdge).toBeLessThanOrEqual(500);
    });

    it("should be able to move away from a wall after hitting it", () => {
      const leftWall = new WallSurface("leftWall", {
        start: { x: 50, y: 0 },
        end: { x: 50, y: 600 },
      });
      const floor = new WallSurface("floor", {
        start: { x: 0, y: 500 },
        end: { x: 1000, y: 500 },
      });

      // Player starts near wall
      const player = new Player({ x: 100, y: 476 });
      const surfaces = [leftWall, floor];

      // Ground the player
      player.update(0.016, noInput(), surfaces);
      expect(player.isGrounded).toBe(true);

      // Move left until hitting wall
      for (let i = 0; i < 50; i++) {
        player.update(0.016, leftInput(), surfaces);
      }

      // Player should be at wall
      const atWallX = player.position.x;
      expect(atWallX).toBeCloseTo(66, 0); // wall at 50 + halfWidth 16 = 66

      // Now move RIGHT - player should be able to move away
      for (let i = 0; i < 20; i++) {
        player.update(0.016, rightInput(), surfaces);
      }

      // Player should have moved right, away from wall
      expect(player.position.x).toBeGreaterThan(atWallX + 10);
    });

    it("should not fall off the edge of a platform", () => {
      // Platform with floor and left boundary wall
      const floor = new WallSurface("floor", {
        start: { x: 100, y: 500 },
        end: { x: 500, y: 500 },
      });
      // Left edge wall (prevents falling off left side)
      const leftEdgeWall = new WallSurface("leftEdge", {
        start: { x: 100, y: 500 },
        end: { x: 100, y: 0 },
      });

      const player = new Player({ x: 150, y: 476 });
      const surfaces = [floor, leftEdgeWall];

      // Ground the player
      player.update(0.016, noInput(), surfaces);
      expect(player.isGrounded).toBe(true);

      // Move left towards edge
      for (let i = 0; i < 50; i++) {
        player.update(0.016, leftInput(), surfaces);
      }

      // Player should be stopped at wall
      const leftEdge = player.position.x - 16;
      expect(leftEdge).toBeGreaterThanOrEqual(100);

      // Player should still be grounded
      expect(player.isGrounded).toBe(true);
    });
  });
});
