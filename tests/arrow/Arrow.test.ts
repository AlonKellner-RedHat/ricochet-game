import { Arrow, type ArrowConfig, DEFAULT_ARROW_CONFIG } from "@/arrow/Arrow";
import { describe, expect, it } from "vitest";

// Test config with no decay for predictable movement tests
const NO_DECAY_CONFIG: ArrowConfig = {
  initialSpeed: 100,
  normalDecay: 1, // No decay
  exhaustedDecay: 1,
  exhaustionDistance: 100000, // Very high so we don't hit it
  minSpeed: 1,
};

// Helper to create config with specific speed
function configWithSpeed(speed: number): ArrowConfig {
  return {
    ...NO_DECAY_CONFIG,
    initialSpeed: speed,
  };
}

describe("Arrow", () => {
  describe("construction", () => {
    it("should require at least 2 waypoints", () => {
      expect(() => new Arrow("test", [{ x: 0, y: 0 }])).toThrow();
    });

    it("should start at first waypoint", () => {
      const arrow = new Arrow("test", [
        { x: 100, y: 200 },
        { x: 300, y: 200 },
      ]);

      expect(arrow.position.x).toBe(100);
      expect(arrow.position.y).toBe(200);
    });

    it("should start in flying state", () => {
      const arrow = new Arrow("test", [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]);

      expect(arrow.state).toBe("flying");
      expect(arrow.isActive).toBe(true);
    });

    it("should start at initial speed", () => {
      const arrow = new Arrow("test", [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]);

      expect(arrow.currentSpeed).toBe(DEFAULT_ARROW_CONFIG.initialSpeed);
    });
  });

  describe("movement", () => {
    it("should move toward next waypoint", () => {
      const arrow = new Arrow(
        "test",
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        configWithSpeed(100)
      );

      arrow.update(0.5); // 0.5 seconds at 100 px/s = 50 px

      expect(arrow.position.x).toBeCloseTo(50);
      expect(arrow.position.y).toBeCloseTo(0);
    });

    it("should follow diagonal path", () => {
      const arrow = new Arrow(
        "test",
        [
          { x: 0, y: 0 },
          { x: 100, y: 100 },
        ],
        configWithSpeed(Math.SQRT2 * 100)
      );

      arrow.update(0.5); // Should move 50*sqrt(2) distance

      expect(arrow.position.x).toBeCloseTo(50);
      expect(arrow.position.y).toBeCloseTo(50);
    });

    it("should transition between waypoints", () => {
      const arrow = new Arrow(
        "test",
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
        configWithSpeed(100)
      );

      // Move 150 px - should go through first waypoint
      arrow.update(1.5);

      // Should be 50 px into second segment
      expect(arrow.position.x).toBeCloseTo(100);
      expect(arrow.position.y).toBeCloseTo(50);
    });

    it("should not move when stuck", () => {
      const arrow = new Arrow(
        "test",
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        configWithSpeed(100)
      );

      // Move past the end
      arrow.update(2.0); // 200px at 100px/s

      expect(arrow.state).toBe("stuck");
      const stuckPosition = arrow.position;

      arrow.update(1.0);
      expect(arrow.position).toEqual(stuckPosition);
    });
  });

  describe("stuck state", () => {
    it("should become stuck at final waypoint", () => {
      const arrow = new Arrow(
        "test",
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        configWithSpeed(100)
      );

      arrow.update(1.0); // Exactly reach the end

      expect(arrow.state).toBe("stuck");
      expect(arrow.position.x).toBeCloseTo(100);
      expect(arrow.isActive).toBe(false);
    });

    it("should preserve angle when stuck", () => {
      const arrow = new Arrow(
        "test",
        [
          { x: 0, y: 0 },
          { x: 100, y: 100 },
        ],
        configWithSpeed(200)
      );

      arrow.update(1.0); // Become stuck

      // Angle should be 45 degrees (pi/4)
      expect(arrow.angle).toBeCloseTo(Math.PI / 4);
    });
  });

  describe("angle", () => {
    it("should report correct angle for horizontal movement", () => {
      const arrow = new Arrow("test", [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]);

      expect(arrow.angle).toBeCloseTo(0);
    });

    it("should report correct angle for downward movement", () => {
      const arrow = new Arrow("test", [
        { x: 0, y: 0 },
        { x: 0, y: 100 },
      ]);

      expect(arrow.angle).toBeCloseTo(Math.PI / 2);
    });

    it("should update angle after changing segments", () => {
      const arrow = new Arrow(
        "test",
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 }, // Horizontal
          { x: 100, y: 100 }, // Vertical
        ],
        configWithSpeed(100)
      );

      // Initially horizontal
      expect(arrow.angle).toBeCloseTo(0);

      // Move to second segment
      arrow.update(1.0); // Reach first waypoint

      // Now should be vertical (downward)
      expect(arrow.angle).toBeCloseTo(Math.PI / 2);
    });
  });

  describe("velocity", () => {
    it("should have velocity in direction of next waypoint", () => {
      const arrow = new Arrow(
        "test",
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        configWithSpeed(200)
      );

      expect(arrow.velocity.x).toBeCloseTo(200);
      expect(arrow.velocity.y).toBeCloseTo(0);
    });

    it("should have zero velocity when stuck", () => {
      const arrow = new Arrow(
        "test",
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        configWithSpeed(200)
      );

      arrow.update(1.0);

      expect(arrow.velocity.x).toBe(0);
      expect(arrow.velocity.y).toBe(0);
    });
  });

  describe("progress", () => {
    it("should report 0 progress at start", () => {
      const arrow = new Arrow("test", [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
      ]);

      expect(arrow.getProgress()).toBeCloseTo(0);
    });

    it("should report partial progress", () => {
      const arrow = new Arrow(
        "test",
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        configWithSpeed(100)
      );

      arrow.update(0.5);

      expect(arrow.getProgress()).toBeCloseTo(0.5);
    });

    it("should report 1 progress at end", () => {
      const arrow = new Arrow(
        "test",
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        configWithSpeed(100)
      );

      arrow.update(1.0);

      expect(arrow.getProgress()).toBeCloseTo(1);
    });
  });

  describe("multi-segment paths", () => {
    it("should follow zigzag path", () => {
      const arrow = new Arrow(
        "test",
        [
          { x: 0, y: 0 },
          { x: 100, y: 50 }, // First ricochet
          { x: 200, y: 0 }, // Final position
        ],
        configWithSpeed(100)
      );

      // Distance of first segment: sqrt(100^2 + 50^2) = ~111.8
      // Distance of second segment: sqrt(100^2 + 50^2) = ~111.8
      // Total: ~223.6

      // Move most of the way
      arrow.update(2.0); // 200 px

      expect(arrow.state).toBe("flying");
      expect(arrow.position.x).toBeGreaterThan(100);
    });

    it("should reach all waypoints in order", () => {
      const waypoints = [
        { x: 0, y: 0 },
        { x: 50, y: 50 },
        { x: 100, y: 0 },
        { x: 150, y: 50 },
      ];

      const arrow = new Arrow("test", waypoints, configWithSpeed(1000));

      // Move enough to traverse all waypoints
      arrow.update(1.0);

      expect(arrow.state).toBe("stuck");
      expect(arrow.position.x).toBeCloseTo(150);
      expect(arrow.position.y).toBeCloseTo(50);
    });
  });

  describe("speed decay", () => {
    it("should slow down during normal flight", () => {
      const config: ArrowConfig = {
        initialSpeed: 1000,
        normalDecay: 0.5, // 50% per second for easy testing
        exhaustedDecay: 0.1,
        exhaustionDistance: 100000,
        minSpeed: 10,
      };

      const arrow = new Arrow(
        "test",
        [
          { x: 0, y: 0 },
          { x: 10000, y: 0 },
        ],
        config
      );

      const initialSpeed = arrow.currentSpeed;
      arrow.update(1.0); // 1 second

      // Speed should have decayed by factor of 0.5
      expect(arrow.currentSpeed).toBeCloseTo(initialSpeed * 0.5);
    });

    it("should stick when speed drops below minimum", () => {
      const config: ArrowConfig = {
        initialSpeed: 100,
        normalDecay: 0.1, // Very aggressive decay
        exhaustedDecay: 0.1,
        exhaustionDistance: 100000,
        minSpeed: 50,
      };

      const arrow = new Arrow(
        "test",
        [
          { x: 0, y: 0 },
          { x: 10000, y: 0 },
        ],
        config
      );

      // Update until speed drops below minimum
      arrow.update(1.0);

      expect(arrow.state).toBe("stuck");
    });
  });

  describe("exhaustion", () => {
    it("should become exhausted after traveling exhaustion distance", () => {
      const config: ArrowConfig = {
        initialSpeed: 1000,
        normalDecay: 1, // No decay for this test
        exhaustedDecay: 1,
        exhaustionDistance: 500, // Short distance for test
        minSpeed: 10,
      };

      const arrow = new Arrow(
        "test",
        [
          { x: 0, y: 0 },
          { x: 2000, y: 0 },
        ],
        config
      );

      // Move past exhaustion distance
      arrow.update(0.6); // 600 px at 1000 px/s

      expect(arrow.state).toBe("exhausted");
      expect(arrow.getDistanceTraveled()).toBeGreaterThan(500);
    });

    it("should decay faster when exhausted", () => {
      const config: ArrowConfig = {
        initialSpeed: 1000,
        normalDecay: 1, // No normal decay
        exhaustedDecay: 0.5, // 50% per second when exhausted
        exhaustionDistance: 100, // Get exhausted quickly
        minSpeed: 10,
      };

      const arrow = new Arrow(
        "test",
        [
          { x: 0, y: 0 },
          { x: 10000, y: 0 },
        ],
        config
      );

      // Get exhausted
      arrow.update(0.2); // Travel 200px, become exhausted

      expect(arrow.state).toBe("exhausted");
      const exhaustedSpeed = arrow.currentSpeed;

      // Now update again and check rapid decay
      arrow.update(1.0);

      expect(arrow.currentSpeed).toBeCloseTo(exhaustedSpeed * 0.5);
    });
  });

  describe("distance tracking", () => {
    it("should track total distance traveled", () => {
      const arrow = new Arrow(
        "test",
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
        ],
        configWithSpeed(100)
      );

      arrow.update(1.5); // Travel 150 px

      expect(arrow.getDistanceTraveled()).toBeCloseTo(150);
    });

    it("should track distance through multiple segments", () => {
      const arrow = new Arrow(
        "test",
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 100, y: 100 },
          { x: 0, y: 100 },
        ],
        configWithSpeed(1000)
      );

      // Traverse all segments (total: 300px)
      arrow.update(0.5);

      expect(arrow.getDistanceTraveled()).toBeGreaterThan(299);
    });
  });
});
