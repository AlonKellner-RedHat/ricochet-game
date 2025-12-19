import { Player } from "@/player/Player";
import { WallSurface } from "@/surfaces";
import type { MovementInput } from "@/types";
import { describe, expect, it } from "vitest";

describe("Player", () => {
  function noInput(): MovementInput {
    return { left: false, right: false, jump: false, jumpHeld: false };
  }

  function jumpInput(): MovementInput {
    return { left: false, right: false, jump: true, jumpHeld: true };
  }

  describe("landing and jumping - game scenario", () => {
    it("should land on floor and be able to jump", () => {
      // Simulate actual game scenario:
      // - Player spawns above floor
      // - Falls due to gravity
      // - Lands on floor
      // - Should be able to jump

      const floorY = 500;
      const floor = new WallSurface("floor", {
        start: { x: 0, y: floorY },
        end: { x: 1000, y: floorY },
      });

      // Spawn player above floor
      const spawnY = 400;
      const player = new Player({ x: 100, y: spawnY });

      // Player should not be grounded initially
      expect(player.isGrounded).toBe(false);

      // Simulate falling for several frames (16ms each at 60fps)
      const surfaces = [floor];
      for (let i = 0; i < 60; i++) {
        player.update(0.016, noInput(), surfaces);
      }

      // Player should now be grounded
      expect(player.isGrounded).toBe(true);

      // Player position should be at or above floor level
      const playerBottom = player.position.y + 24; // half height
      expect(playerBottom).toBeLessThanOrEqual(floorY + 1); // Allow 1px tolerance

      // Now try to jump
      player.update(0.016, jumpInput(), surfaces);

      // Player should be jumping (upward velocity)
      expect(player.velocity.y).toBeLessThan(0);
      expect(player.state).toBe("jumping");
    });

    it("should detect ground when spawned close to floor", () => {
      const floorY = 500;
      const floor = new WallSurface("floor", {
        start: { x: 0, y: floorY },
        end: { x: 1000, y: floorY },
      });

      // Spawn player just above floor (within ground check distance)
      // Player center at y=476, feet at y=500 (right at floor)
      const player = new Player({ x: 100, y: 476 });

      // First update should detect ground
      player.update(0.016, noInput(), [floor]);

      expect(player.isGrounded).toBe(true);
    });

    it("should not fall through floor at high velocity", () => {
      const floorY = 500;
      const floor = new WallSurface("floor", {
        start: { x: 0, y: floorY },
        end: { x: 1000, y: floorY },
      });

      // Spawn player high above floor
      const player = new Player({ x: 100, y: 100 });

      // Simulate many frames of falling
      for (let i = 0; i < 300; i++) {
        player.update(0.016, noInput(), [floor]);
      }

      // Player should be grounded and not have fallen through
      expect(player.isGrounded).toBe(true);
      const playerBottom = player.position.y + 24;
      expect(playerBottom).toBeLessThanOrEqual(floorY + 1);
    });
  });
});
