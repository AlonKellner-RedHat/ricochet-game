/**
 * WindowConfig Tests
 *
 * TDD tests for the WindowConfig type and splitWindow() function.
 * All geometry is source-of-truth based - no epsilons or angle calculations.
 */

import { describe, it, expect } from "vitest";
import {
  type WindowConfig,
  type Segment,
  splitWindow,
  createSingleWindow,
  createMultiWindow,
  getWindowSegments,
  isMultiWindow,
} from "@/trajectory-v2/visibility/WindowConfig";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if two points are equal within floating-point tolerance.
 * This is for TEST VERIFICATION ONLY - the implementation itself uses exact arithmetic.
 */
function expectPointEquals(actual: { x: number; y: number }, expected: { x: number; y: number }): void {
  expect(actual.x).toBeCloseTo(expected.x, 10);
  expect(actual.y).toBeCloseTo(expected.y, 10);
}

// =============================================================================
// SPLIT WINDOW TESTS
// =============================================================================

describe("splitWindow", () => {
  describe("basic splitting", () => {
    it("splits a horizontal segment at center with equal halves", () => {
      const segment: Segment = {
        start: { x: 0, y: 100 },
        end: { x: 100, y: 100 },
      };

      // Gap from 45% to 55% of segment length
      const [left, right] = splitWindow(segment, 0.45, 0.55);

      // Left window: (0, 100) to (45, 100)
      expectPointEquals(left.start, { x: 0, y: 100 });
      expectPointEquals(left.end, { x: 45, y: 100 });

      // Right window: (55, 100) to (100, 100)
      expectPointEquals(right.start, { x: 55, y: 100 });
      expectPointEquals(right.end, { x: 100, y: 100 });
    });

    it("splits a vertical segment correctly", () => {
      const segment: Segment = {
        start: { x: 50, y: 0 },
        end: { x: 50, y: 200 },
      };

      const [left, right] = splitWindow(segment, 0.4, 0.6);

      // Left window: (50, 0) to (50, 80)
      expectPointEquals(left.start, { x: 50, y: 0 });
      expectPointEquals(left.end, { x: 50, y: 80 });

      // Right window: (50, 120) to (50, 200)
      expectPointEquals(right.start, { x: 50, y: 120 });
      expectPointEquals(right.end, { x: 50, y: 200 });
    });

    it("splits a diagonal segment correctly", () => {
      const segment: Segment = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 100 },
      };

      const [left, right] = splitWindow(segment, 0.3, 0.7);

      // Left window: (0, 0) to (30, 30)
      expectPointEquals(left.start, { x: 0, y: 0 });
      expectPointEquals(left.end, { x: 30, y: 30 });

      // Right window: (70, 70) to (100, 100)
      expectPointEquals(right.start, { x: 70, y: 70 });
      expectPointEquals(right.end, { x: 100, y: 100 });
    });
  });

  describe("edge cases", () => {
    it("creates a very small gap at center", () => {
      const segment: Segment = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      };

      // Very narrow gap: 49% to 51%
      const [left, right] = splitWindow(segment, 0.49, 0.51);

      expectPointEquals(left.start, { x: 0, y: 0 });
      expectPointEquals(left.end, { x: 49, y: 0 });

      expectPointEquals(right.start, { x: 51, y: 0 });
      expectPointEquals(right.end, { x: 100, y: 0 });
    });

    it("handles gap near start of segment", () => {
      const segment: Segment = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      };

      // Gap from 5% to 15%
      const [left, right] = splitWindow(segment, 0.05, 0.15);

      expectPointEquals(left.start, { x: 0, y: 0 });
      expectPointEquals(left.end, { x: 5, y: 0 });

      expectPointEquals(right.start, { x: 15, y: 0 });
      expectPointEquals(right.end, { x: 100, y: 0 });
    });

    it("handles gap near end of segment", () => {
      const segment: Segment = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      };

      // Gap from 85% to 95%
      const [left, right] = splitWindow(segment, 0.85, 0.95);

      expectPointEquals(left.start, { x: 0, y: 0 });
      expectPointEquals(left.end, { x: 85, y: 0 });

      expectPointEquals(right.start, { x: 95, y: 0 });
      expectPointEquals(right.end, { x: 100, y: 0 });
    });

    it("handles asymmetric gap", () => {
      const segment: Segment = {
        start: { x: 0, y: 0 },
        end: { x: 200, y: 0 },
      };

      // Gap from 20% to 40%
      const [left, right] = splitWindow(segment, 0.2, 0.4);

      expectPointEquals(left.start, { x: 0, y: 0 });
      expectPointEquals(left.end, { x: 40, y: 0 });

      expectPointEquals(right.start, { x: 80, y: 0 });
      expectPointEquals(right.end, { x: 200, y: 0 });
    });
  });

  describe("provenance preservation", () => {
    it("left segment starts at original start", () => {
      const segment: Segment = {
        start: { x: 123, y: 456 },
        end: { x: 789, y: 101 },
      };

      const [left] = splitWindow(segment, 0.4, 0.6);

      // Left segment must start at EXACTLY the original start (provenance)
      expect(left.start.x).toBe(segment.start.x);
      expect(left.start.y).toBe(segment.start.y);
    });

    it("right segment ends at original end", () => {
      const segment: Segment = {
        start: { x: 123, y: 456 },
        end: { x: 789, y: 101 },
      };

      const [, right] = splitWindow(segment, 0.4, 0.6);

      // Right segment must end at EXACTLY the original end (provenance)
      expect(right.end.x).toBe(segment.end.x);
      expect(right.end.y).toBe(segment.end.y);
    });
  });
});

// =============================================================================
// WINDOW CONFIG TYPE TESTS
// =============================================================================

describe("WindowConfig", () => {
  describe("createSingleWindow", () => {
    it("creates a single window config from a segment", () => {
      const segment: Segment = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      };

      const config = createSingleWindow(segment);

      expect(config.type).toBe("single");
      expect(config.segment).toEqual(segment);
    });
  });

  describe("createMultiWindow", () => {
    it("creates a multi window config from multiple segments", () => {
      const segments: Segment[] = [
        { start: { x: 0, y: 0 }, end: { x: 40, y: 0 } },
        { start: { x: 60, y: 0 }, end: { x: 100, y: 0 } },
      ];

      const config = createMultiWindow(segments);

      expect(config.type).toBe("multi");
      expect(config.segments).toEqual(segments);
    });
  });

  describe("isMultiWindow", () => {
    it("returns false for single window", () => {
      const config = createSingleWindow({
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      });

      expect(isMultiWindow(config)).toBe(false);
    });

    it("returns true for multi window", () => {
      const config = createMultiWindow([
        { start: { x: 0, y: 0 }, end: { x: 40, y: 0 } },
        { start: { x: 60, y: 0 }, end: { x: 100, y: 0 } },
      ]);

      expect(isMultiWindow(config)).toBe(true);
    });
  });

  describe("getWindowSegments", () => {
    it("returns single segment as array for single window", () => {
      const segment: Segment = {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      };
      const config = createSingleWindow(segment);

      const segments = getWindowSegments(config);

      expect(segments).toHaveLength(1);
      expect(segments[0]).toEqual(segment);
    });

    it("returns all segments for multi window", () => {
      const segment1: Segment = { start: { x: 0, y: 0 }, end: { x: 40, y: 0 } };
      const segment2: Segment = { start: { x: 60, y: 0 }, end: { x: 100, y: 0 } };
      const config = createMultiWindow([segment1, segment2]);

      const segments = getWindowSegments(config);

      expect(segments).toHaveLength(2);
      expect(segments[0]).toEqual(segment1);
      expect(segments[1]).toEqual(segment2);
    });
  });
});

// =============================================================================
// INTEGRATION: SPLIT + CONFIG
// =============================================================================

describe("splitWindow + WindowConfig integration", () => {
  it("splitWindow result can be used to create multi window config", () => {
    const umbrella: Segment = {
      start: { x: 100, y: 200 },
      end: { x: 300, y: 200 },
    };

    const [left, right] = splitWindow(umbrella, 0.45, 0.55);
    const config = createMultiWindow([left, right]);

    expect(config.type).toBe("multi");
    expect(getWindowSegments(config)).toHaveLength(2);

    // Verify provenance
    expect(getWindowSegments(config)[0]!.start).toEqual(umbrella.start);
    expect(getWindowSegments(config)[1]!.end).toEqual(umbrella.end);
  });
});

