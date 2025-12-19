import { Arrow } from "@/arrow/Arrow";
import { describe, expect, it } from "vitest";

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
  });

  describe("movement", () => {
    it("should move toward next waypoint", () => {
      const arrow = new Arrow(
        "test",
        [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        { speed: 100 }
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
        { speed: Math.SQRT2 * 100 }
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
        { speed: 100 }
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
        { speed: 100 }
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
        { speed: 100 }
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
        { speed: 200 }
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
        { speed: 100 }
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
        { speed: 200 }
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
        { speed: 200 }
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
        { speed: 100 }
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
        { speed: 100 }
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
        { speed: 100 }
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

      const arrow = new Arrow("test", waypoints, { speed: 1000 });

      // Move enough to traverse all waypoints
      arrow.update(1.0);

      expect(arrow.state).toBe("stuck");
      expect(arrow.position.x).toBeCloseTo(150);
      expect(arrow.position.y).toBeCloseTo(50);
    });
  });
});
