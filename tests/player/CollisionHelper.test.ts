import { checkCollisions } from "@/player/CollisionHelper";
import { WallSurface } from "@/surfaces";
import { describe, expect, it } from "vitest";

describe("CollisionHelper", () => {
  describe("ground detection", () => {
    it("should detect ground directly below player", () => {
      const floorY = 500;
      const floor = new WallSurface("floor", {
        start: { x: 0, y: floorY },
        end: { x: 1000, y: floorY },
      });

      // Player standing just above floor
      // Player center at y=476, with height 48, bottom at y=500
      const position = { x: 100, y: 476 };
      const velocity = { x: 0, y: 0 };
      const width = 32;
      const height = 48;

      const result = checkCollisions(position, velocity, width, height, [floor]);

      expect(result.grounded).toBe(true);
      expect(result.groundY).toBe(floorY);
    });

    it("should detect ground when falling", () => {
      const floorY = 500;
      const floor = new WallSurface("floor", {
        start: { x: 0, y: floorY },
        end: { x: 1000, y: floorY },
      });

      // Player falling, just above floor
      const position = { x: 100, y: 475 };
      const velocity = { x: 0, y: 100 }; // Falling down
      const width = 32;
      const height = 48;

      const result = checkCollisions(position, velocity, width, height, [floor]);

      expect(result.grounded).toBe(true);
    });
  });
});
