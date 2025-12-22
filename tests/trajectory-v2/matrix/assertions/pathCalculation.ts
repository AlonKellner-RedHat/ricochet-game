/**
 * Path Calculation First Principle Assertions
 *
 * Principles 3.1, 3.2, 4.1, 4.2: Path calculation and alignment rules
 */

import { expect } from "vitest";
import { distance } from "../MatrixTestRunner";
import type { FirstPrincipleAssertion, TestResults, TestSetup } from "../types";

/**
 * Principle 3.1 + 3.2: Path ending behavior
 *
 * - Path ends at cursor when cursor is on path before obstacles (3.1)
 * - Path ends at obstacle if obstacle is before cursor (3.2)
 */
export const pathEndingCorrect: FirstPrincipleAssertion = {
  id: "path-ending",
  principle: "3.1/3.2",
  description: "Path ends correctly at cursor or obstacle",
  assert: (setup: TestSetup, results: TestResults) => {
    const { actualPath } = results;
    const lastPoint = actualPath.points[actualPath.points.length - 1];

    if (actualPath.reachedCursor) {
      // Path ends at cursor
      expect(lastPoint).toBeDefined();
      if (lastPoint) {
        const distToCursor = distance(lastPoint, setup.cursor);
        expect(distToCursor).toBeLessThan(1); // Within 1 pixel
      }
    } else if (actualPath.blockedBy) {
      // Path ends at obstacle
      expect(lastPoint).toBeDefined();
      // The last point should be on the blocking surface
      // (We can't easily verify exact position, but it should exist)
    }

    // Verify expected outcomes if specified
    if (setup.expected?.reachesCursor !== undefined) {
      expect(actualPath.reachedCursor).toBe(setup.expected.reachesCursor);
    }
  },
};

/**
 * Principle 4.1 + 4.2: Alignment detection
 *
 * - Full alignment when both paths reach cursor with same segments (4.1)
 * - Divergence when actual path hits obstacle or planned hit is off-segment (4.2)
 */
export const alignmentCorrect: FirstPrincipleAssertion = {
  id: "alignment-correct",
  principle: "4.1/4.2",
  description: "Alignment detection is accurate",
  assert: (setup: TestSetup, results: TestResults) => {
    const { plannedPath, actualPath, alignment } = results;

    // Verify expected alignment if specified
    if (setup.expected?.isAligned !== undefined) {
      expect(alignment.isFullyAligned).toBe(setup.expected.isAligned);
    }

    // If both paths reach cursor, alignment depends on segment matching
    if (plannedPath.reachedCursor && actualPath.reachedCursor) {
      // Check if paths have same number of points (rough alignment check)
      const samePointCount = plannedPath.points.length === actualPath.points.length;

      // If same point count and both reach cursor, likely aligned
      // (This is a heuristic - actual alignment is more complex)
      if (samePointCount && !actualPath.blockedBy) {
        // Check if first segments match direction
        if (plannedPath.points.length >= 2 && actualPath.points.length >= 2) {
          const plannedDir = {
            x: plannedPath.points[1]!.x - plannedPath.points[0]!.x,
            y: plannedPath.points[1]!.y - plannedPath.points[0]!.y,
          };
          const actualDir = {
            x: actualPath.points[1]!.x - actualPath.points[0]!.x,
            y: actualPath.points[1]!.y - actualPath.points[0]!.y,
          };

          // Normalize and compare
          const plannedLen = Math.sqrt(plannedDir.x ** 2 + plannedDir.y ** 2);
          const actualLen = Math.sqrt(actualDir.x ** 2 + actualDir.y ** 2);

          if (plannedLen > 0 && actualLen > 0) {
            const dotProduct =
              (plannedDir.x / plannedLen) * (actualDir.x / actualLen) +
              (plannedDir.y / plannedLen) * (actualDir.y / actualLen);

            // If directions are nearly parallel (dot product close to 1)
            // then the paths should be aligned
            if (dotProduct > 0.99 && alignment.isFullyAligned) {
              expect(alignment.alignedSegmentCount).toBeGreaterThanOrEqual(1);
            }
          }
        }
      }
    }

    // If blocked, should not be fully aligned (unless blocked at cursor position)
    if (actualPath.blockedBy && !actualPath.reachedCursor) {
      expect(alignment.isFullyAligned).toBe(false);
    }
  },
};

/**
 * All path calculation assertions.
 */
export const pathCalculationAssertions: readonly FirstPrincipleAssertion[] = [
  pathEndingCorrect,
  alignmentCorrect,
];

