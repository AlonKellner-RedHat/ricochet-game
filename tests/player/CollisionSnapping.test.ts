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

describe("Collision Snapping Issues", () => {
  describe("wall snapping while jumping", () => {
    it("should NOT snap to wall when jumping 15 pixels away", () => {
      const leftWall = new WallSurface("leftWall", {
        start: { x: 50, y: 0 },
        end: { x: 50, y: 600 },
      });
      const floor = new WallSurface("floor", {
        start: { x: 0, y: 500 },
        end: { x: 1000, y: 500 },
      });

      // Player with left edge 15 pixels from wall, on ground
      const player = new Player({ x: 81, y: 476 });
      const surfaces = [leftWall, floor];

      // Ground and jump
      player.update(0.016, noInput(), surfaces);
      player.update(0.016, { left: false, right: false, jump: true, jumpHeld: true }, surfaces);
      expect(player.isGrounded).toBe(false);

      const initialX = player.position.x;
      console.log("Jumping - Initial position:", initialX, "left edge:", initialX - 16);

      // Move left for ONE frame while in air
      player.update(0.016, leftInput(), surfaces);

      const afterOneFrame = player.position.x;
      console.log("Jumping - After 1 frame:", afterOneFrame, "left edge:", afterOneFrame - 16);

      const distanceMoved = initialX - afterOneFrame;
      console.log("Jumping - Distance moved:", distanceMoved);

      // Should have moved less than 5 pixels while airborne
      expect(distanceMoved).toBeLessThan(5);
    });
  });

  describe("wall snapping", () => {
    it("should NOT snap to wall when 15 pixels away", () => {
      const leftWall = new WallSurface("leftWall", {
        start: { x: 50, y: 0 },
        end: { x: 50, y: 600 },
      });
      const floor = new WallSurface("floor", {
        start: { x: 0, y: 500 },
        end: { x: 1000, y: 500 },
      });

      // Player with left edge 15 pixels from wall
      // Wall at x=50, left edge should be at 65, so center at 65+16=81
      const player = new Player({ x: 81, y: 476 });
      const surfaces = [leftWall, floor];

      // Ground the player
      player.update(0.016, noInput(), surfaces);
      expect(player.isGrounded).toBe(true);

      const initialX = player.position.x;
      console.log("Initial position:", initialX, "left edge:", initialX - 16);

      // Move left for ONE frame
      player.update(0.016, leftInput(), surfaces);

      const afterOneFrame = player.position.x;
      console.log("After 1 frame:", afterOneFrame, "left edge:", afterOneFrame - 16);

      // Player should have moved slightly, not teleported to wall
      // With acceleration 4000, after 1 frame: v = 4000 * 0.016 = 64 px/s
      // distance = 64 * 0.016 = ~1 pixel
      const distanceMoved = initialX - afterOneFrame;
      console.log("Distance moved:", distanceMoved);

      // Should have moved less than 5 pixels, definitely not 15
      expect(distanceMoved).toBeLessThan(5);
      expect(distanceMoved).toBeGreaterThan(0);
    });

    it("should move smoothly towards wall, not teleport", () => {
      const leftWall = new WallSurface("leftWall", {
        start: { x: 50, y: 0 },
        end: { x: 50, y: 600 },
      });
      const floor = new WallSurface("floor", {
        start: { x: 0, y: 500 },
        end: { x: 1000, y: 500 },
      });

      // Start further from wall
      const player = new Player({ x: 120, y: 476 });
      const surfaces = [leftWall, floor];

      player.update(0.016, noInput(), surfaces);

      // Record positions as we move left
      const positions: number[] = [player.position.x];
      for (let i = 0; i < 30; i++) {
        player.update(0.016, leftInput(), surfaces);
        positions.push(player.position.x);
      }

      // Check that movement is smooth - no big jumps except at the end when hitting wall
      for (let i = 1; i < positions.length; i++) {
        const prevPos = positions[i - 1] as number;
        const currPos = positions[i] as number;
        const jump = prevPos - currPos;
        const leftEdge = currPos - 16;
        const atWall = leftEdge <= 51; // Within 1 pixel of wall

        if (!atWall) {
          // Not at wall yet - movement should be gradual
          expect(jump).toBeLessThan(10); // No teleporting more than 10 pixels
        }
      }
    });
  });

  describe("ground snapping", () => {
    it("should NOT snap to ground when falling from height", () => {
      const floor = new WallSurface("floor", {
        start: { x: 0, y: 500 },
        end: { x: 1000, y: 500 },
      });

      // Player falling from above
      const player = new Player({ x: 100, y: 400 });
      const surfaces = [floor];

      // Record Y positions as player falls
      const positions: number[] = [player.position.y];
      for (let i = 0; i < 60; i++) {
        player.update(0.016, noInput(), surfaces);
        positions.push(player.position.y);

        if (player.isGrounded) break;
      }

      // Check for smooth descent - no big jumps
      for (let i = 1; i < positions.length; i++) {
        const prevPos = positions[i - 1] as number;
        const currPos = positions[i] as number;
        const jump = currPos - prevPos;
        const feetY = currPos + 24; // half height
        const atGround = feetY >= 499; // Within 1 pixel of ground

        if (!atGround) {
          // Not at ground yet - movement should be gradual
          // Even at terminal velocity (800 px/s), max move is 800 * 0.016 = 12.8 px
          expect(jump).toBeLessThan(15);
        }
      }
    });
  });
});
