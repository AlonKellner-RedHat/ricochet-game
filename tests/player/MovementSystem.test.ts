import { MovementSystem } from "@/player/MovementSystem";
import type { MovementInput } from "@/types";
import { DEFAULT_MOVEMENT_CONFIG } from "@/types";
import { beforeEach, describe, expect, it } from "vitest";

describe("MovementSystem", () => {
  let system: MovementSystem;
  const config = DEFAULT_MOVEMENT_CONFIG;

  beforeEach(() => {
    system = new MovementSystem({ x: 100, y: 100 }, config);
  });

  function noInput(): MovementInput {
    return { left: false, right: false, jump: false, jumpHeld: false };
  }

  function rightInput(): MovementInput {
    return { left: false, right: true, jump: false, jumpHeld: false };
  }

  function leftInput(): MovementInput {
    return { left: true, right: false, jump: false, jumpHeld: false };
  }

  function jumpInput(): MovementInput {
    return { left: false, right: false, jump: true, jumpHeld: true };
  }

  describe("initial state", () => {
    it("should start at given position", () => {
      expect(system.position).toEqual({ x: 100, y: 100 });
    });

    it("should start with zero velocity", () => {
      expect(system.velocity).toEqual({ x: 0, y: 0 });
    });

    it("should start in idle state", () => {
      expect(system.state).toBe("idle");
    });

    it("should not be grounded initially", () => {
      expect(system.isGrounded).toBe(false);
    });
  });

  describe("horizontal movement", () => {
    beforeEach(() => {
      // Make player grounded for movement tests
      system.setGrounded(true, 100);
    });

    it("should accelerate when right input pressed", () => {
      system.update(0.016, rightInput());
      expect(system.velocity.x).toBeGreaterThan(0);
    });

    it("should accelerate when left input pressed", () => {
      system.update(0.016, leftInput());
      expect(system.velocity.x).toBeLessThan(0);
    });

    it("should not exceed max speed", () => {
      // Run many updates
      for (let i = 0; i < 100; i++) {
        system.update(0.016, rightInput());
      }
      expect(system.velocity.x).toBeLessThanOrEqual(config.maxSpeed);
    });

    it("should decelerate when input released", () => {
      // First accelerate
      for (let i = 0; i < 10; i++) {
        system.update(0.016, rightInput());
      }
      const speedAfterAccel = system.velocity.x;
      expect(speedAfterAccel).toBeGreaterThan(0);

      // Then release
      system.update(0.016, noInput());
      expect(system.velocity.x).toBeLessThan(speedAfterAccel);
    });

    it("should stop when decelerating from low speed", () => {
      // Give small velocity
      system.update(0.001, rightInput());

      // Decelerate for a while
      for (let i = 0; i < 100; i++) {
        system.update(0.016, noInput());
      }

      expect(system.velocity.x).toBe(0);
    });
  });

  describe("jumping", () => {
    beforeEach(() => {
      system.setGrounded(true, 100);
    });

    it("should jump when grounded and jump pressed", () => {
      system.update(0.016, jumpInput());
      expect(system.velocity.y).toBeLessThan(0); // Negative = upward
    });

    it("should set state to jumping", () => {
      system.update(0.016, jumpInput());
      expect(system.state).toBe("jumping");
    });

    it("should not be grounded after jumping", () => {
      system.update(0.016, jumpInput());
      expect(system.isGrounded).toBe(false);
    });

    it("should not jump when already airborne", () => {
      // First jump
      system.update(0.016, jumpInput());
      const firstJumpVelocity = system.velocity.y;

      // Try to jump again
      system.update(0.016, jumpInput());

      // Velocity should have changed due to gravity, not another jump
      expect(system.velocity.y).toBeGreaterThan(firstJumpVelocity);
    });

    it("should cut jump height on early release", () => {
      // Start jump with held
      system.update(0.016, jumpInput());
      const fullJumpVelocity = system.velocity.y;

      // Release jump (still going up)
      system.update(0.016, { left: false, right: false, jump: false, jumpHeld: false });

      // Velocity should be reduced (closer to 0)
      expect(system.velocity.y).toBeGreaterThan(fullJumpVelocity);
    });
  });

  describe("gravity", () => {
    it("should apply gravity when airborne", () => {
      const initialVelocityY = system.velocity.y;
      system.update(0.016, noInput());
      expect(system.velocity.y).toBeGreaterThan(initialVelocityY);
    });

    it("should not exceed terminal velocity", () => {
      // Fall for a long time
      for (let i = 0; i < 1000; i++) {
        system.update(0.016, noInput());
      }
      expect(system.velocity.y).toBeLessThanOrEqual(config.maxFallSpeed);
    });

    it("should not apply gravity when grounded", () => {
      system.setGrounded(true, 100);
      const velocityY = system.velocity.y;
      system.update(0.016, noInput());
      expect(system.velocity.y).toBe(velocityY);
    });
  });

  describe("state transitions", () => {
    beforeEach(() => {
      system.setGrounded(true, 100);
    });

    it("should be idle when grounded with no input", () => {
      system.update(0.016, noInput());
      expect(system.state).toBe("idle");
    });

    it("should be running when grounded with horizontal input", () => {
      system.update(0.016, rightInput());
      expect(system.state).toBe("running");
    });

    it("should transition to falling after jump apex", () => {
      // Jump
      system.update(0.016, jumpInput());
      expect(system.state).toBe("jumping");

      // Keep updating until falling
      for (let i = 0; i < 100; i++) {
        system.update(0.016, noInput());
        if (system.state === "falling") break;
      }
      expect(system.state).toBe("falling");
    });

    it("should return to idle on landing", () => {
      // Jump
      system.update(0.016, jumpInput());
      expect(system.state).toBe("jumping");

      // Keep updating until we're falling (velocity becomes positive)
      for (let i = 0; i < 100; i++) {
        system.update(0.016, noInput());
        if (system.velocity.y > 0) break;
      }
      expect(system.state).toBe("falling");
      expect(system.velocity.y).toBeGreaterThan(0);

      // Now land
      system.setGrounded(true, 100);
      system.update(0.016, noInput());

      expect(system.state).toBe("idle");
    });
  });

  describe("collision responses", () => {
    it("should stop vertical velocity when grounded", () => {
      // Give downward velocity
      system.update(0.016, noInput()); // Apply gravity
      expect(system.velocity.y).toBeGreaterThan(0);

      // Land
      system.setGrounded(true, 200);
      expect(system.velocity.y).toBe(0);
    });

    it("should snap to ground position", () => {
      system.setGrounded(true, 200);
      const expectedY = 200 - config.playerHeight / 2;
      expect(system.position.y).toBe(expectedY);
    });

    it("should stop upward velocity on ceiling hit", () => {
      system.setGrounded(true, 100);
      system.update(0.016, jumpInput()); // Jump
      expect(system.velocity.y).toBeLessThan(0);

      system.hitCeiling(50);
      expect(system.velocity.y).toBe(0);
      expect(system.state).toBe("falling");
    });

    it("should stop horizontal velocity on wall hit", () => {
      system.setGrounded(true, 100);
      for (let i = 0; i < 10; i++) {
        system.update(0.016, rightInput());
      }
      expect(system.velocity.x).toBeGreaterThan(0);

      system.hitWall(200, false); // Hit wall on right
      expect(system.velocity.x).toBe(0);
    });
  });

  describe("air control", () => {
    it("should have reduced acceleration in air", () => {
      // Ground acceleration
      system.setGrounded(true, 100);
      system.update(0.016, rightInput());
      const groundedSpeed = system.velocity.x;

      // Reset
      system = new MovementSystem({ x: 100, y: 100 }, config);

      // Air acceleration (not grounded)
      system.update(0.016, rightInput());
      const airSpeed = system.velocity.x;

      // Air speed should be less due to airControl multiplier
      expect(airSpeed).toBeLessThan(groundedSpeed);
    });
  });

  describe("position updates", () => {
    it("should move position based on velocity", () => {
      system.setGrounded(true, 100);

      const initialX = system.position.x;

      // Accelerate and update
      for (let i = 0; i < 10; i++) {
        system.update(0.016, rightInput());
      }

      expect(system.position.x).toBeGreaterThan(initialX);
    });
  });

  describe("bounds calculation", () => {
    it("should return correct bounds", () => {
      const bounds = system.getBounds();
      const halfWidth = config.playerWidth / 2;
      const halfHeight = config.playerHeight / 2;

      expect(bounds.left).toBe(100 - halfWidth);
      expect(bounds.right).toBe(100 + halfWidth);
      expect(bounds.top).toBe(100 - halfHeight);
      expect(bounds.bottom).toBe(100 + halfHeight);
    });
  });

  describe("reset", () => {
    it("should reset position", () => {
      // Move player
      for (let i = 0; i < 10; i++) {
        system.update(0.016, rightInput());
      }

      system.setPosition({ x: 50, y: 50 });
      expect(system.position).toEqual({ x: 50, y: 50 });
    });

    it("should reset velocity", () => {
      system.setGrounded(true, 100);
      system.update(0.016, jumpInput());
      expect(system.velocity.y).not.toBe(0);

      system.resetVelocity();
      expect(system.velocity).toEqual({ x: 0, y: 0 });
      expect(system.state).toBe("idle");
    });
  });
});
