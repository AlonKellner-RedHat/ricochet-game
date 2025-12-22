/**
 * Tests for DivergenceDetector - TDD First
 *
 * FIRST PRINCIPLES (from principles-audit.md):
 * - A3: Both paths share a common prefix (aligned section)
 * - A4: Paths may diverge at exactly ONE point
 *
 * DESIGN PRINCIPLE: Divergence is found by comparing two paths AFTER they're calculated.
 * This is much simpler than detecting divergence inline during path calculation.
 */

import { describe, it, expect } from "vitest";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import { findDivergence, type PathForComparison } from "@/trajectory-v2/engine/DivergenceDetector";

// Type aliases for clarity
type ActualPath = PathForComparison;
type PlannedPath = PathForComparison;

describe("DivergenceDetector", () => {
  describe("Core Behavior", () => {
    it("should return isAligned=true for identical paths", () => {
      const waypoints = [
        { x: 0, y: 0 },
        { x: 100, y: 0 },
        { x: 200, y: 0 },
      ];

      const actual: ActualPath = { waypoints };
      const planned: PlannedPath = { waypoints };

      const result = findDivergence(actual, planned);

      expect(result.isAligned).toBe(true);
      expect(result.segmentIndex).toBe(-1);
      expect(result.point).toBeNull();
    });

    it("should find first waypoint mismatch", () => {
      const actual: ActualPath = {
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 150, y: 50 }, // Diverges here (waypoint 2)
        ],
      };

      const planned: PlannedPath = {
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 200, y: 0 }, // Different from actual
        ],
      };

      const result = findDivergence(actual, planned);

      expect(result.isAligned).toBe(false);
      // Divergence is detected at waypoint index 2
      expect(result.segmentIndex).toBe(2);
      // Divergence point is the last aligned waypoint (index 1)
      expect(result.point).toEqual({ x: 100, y: 0 });
    });

    it("should handle paths of different lengths - actual shorter", () => {
      const actual: ActualPath = {
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          // Actual stops here (blocked by wall)
        ],
      };

      const planned: PlannedPath = {
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 200, y: 0 },
          { x: 300, y: 0 },
        ],
      };

      const result = findDivergence(actual, planned);

      expect(result.isAligned).toBe(false);
      // Divergence at segment 1 (actual ends at index 1)
      expect(result.segmentIndex).toBe(1);
    });

    it("should handle paths of different lengths - planned shorter", () => {
      const actual: ActualPath = {
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 200, y: 0 },
          { x: 300, y: 0 },
        ],
      };

      const planned: PlannedPath = {
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
      };

      const result = findDivergence(actual, planned);

      expect(result.isAligned).toBe(false);
      expect(result.segmentIndex).toBe(1);
    });

    it("should use small tolerance for floating point", () => {
      const actual: ActualPath = {
        waypoints: [
          { x: 0, y: 0 },
          { x: 100.0001, y: 0.0001 }, // Very close to planned
        ],
      };

      const planned: PlannedPath = {
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
      };

      const result = findDivergence(actual, planned, 0.5);

      // Should be considered aligned due to tolerance
      expect(result.isAligned).toBe(true);
    });

    it("should detect divergence at first waypoint if different", () => {
      const actual: ActualPath = {
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
      };

      const planned: PlannedPath = {
        waypoints: [
          { x: 5, y: 5 }, // Different from actual (unusual but possible)
          { x: 100, y: 0 },
        ],
      };

      const result = findDivergence(actual, planned);

      expect(result.isAligned).toBe(false);
      expect(result.segmentIndex).toBe(0);
    });
  });

  describe("First Principle Validation", () => {
    it("A3: paths before divergence should be identical", () => {
      const actual: ActualPath = {
        waypoints: [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 100, y: 0 },
          { x: 150, y: 50 }, // Diverges here
        ],
      };

      const planned: PlannedPath = {
        waypoints: [
          { x: 0, y: 0 },
          { x: 50, y: 0 },
          { x: 100, y: 0 },
          { x: 200, y: 0 }, // Different
        ],
      };

      const result = findDivergence(actual, planned);

      // A3: Before divergence, paths share common prefix
      expect(result.isAligned).toBe(false);
      expect(result.segmentIndex).toBe(3); // Diverges at segment 3

      // The divergence point is the last shared waypoint
      expect(result.point).toEqual({ x: 100, y: 0 });
    });

    it("A4: should return exactly one divergence point", () => {
      const actual: ActualPath = {
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 50 }, // Different at waypoint 1
          { x: 200, y: 100 }, // Also different
        ],
      };

      const planned: PlannedPath = {
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 }, // Different
          { x: 200, y: 0 }, // Also different
        ],
      };

      const result = findDivergence(actual, planned);

      // A4: Only ONE divergence point, even though multiple waypoints differ
      // We report the FIRST divergent waypoint index
      expect(result.isAligned).toBe(false);
      expect(result.segmentIndex).toBe(1); // Divergence detected at waypoint 1
      // Divergence point is the last SHARED waypoint (index 0)
      expect(result.point).toEqual({ x: 0, y: 0 });
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty paths", () => {
      const actual: ActualPath = { waypoints: [] };
      const planned: PlannedPath = { waypoints: [] };

      const result = findDivergence(actual, planned);

      // Empty paths are considered aligned (degenerate case)
      expect(result.isAligned).toBe(true);
    });

    it("should handle single-point paths", () => {
      const actual: ActualPath = { waypoints: [{ x: 100, y: 100 }] };
      const planned: PlannedPath = { waypoints: [{ x: 100, y: 100 }] };

      const result = findDivergence(actual, planned);

      expect(result.isAligned).toBe(true);
    });

    it("should handle single-point divergence", () => {
      const actual: ActualPath = { waypoints: [{ x: 100, y: 100 }] };
      const planned: PlannedPath = { waypoints: [{ x: 200, y: 200 }] };

      const result = findDivergence(actual, planned);

      expect(result.isAligned).toBe(false);
      expect(result.segmentIndex).toBe(0);
    });
  });
});

