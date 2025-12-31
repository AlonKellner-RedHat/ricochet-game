/**
 * Polygon Self-Intersection Invariant
 *
 * A visibility polygon must never self-intersect.
 * That is, no two non-adjacent edges should cross each other.
 *
 * Self-intersections indicate a sorting or construction error in the
 * visibility algorithm.
 */

import type { Invariant, InvariantContext, VisibilityStage } from "../types";
import { assertNoViolations } from "../types";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

/**
 * Check if two line segments properly intersect (cross through each other).
 * Does not count touching at endpoints.
 */
function segmentsProperlyIntersect(
  a1: Vector2,
  a2: Vector2,
  b1: Vector2,
  b2: Vector2
): boolean {
  // Cross products for orientation
  const d1 = (b2.x - b1.x) * (a1.y - b1.y) - (b2.y - b1.y) * (a1.x - b1.x);
  const d2 = (b2.x - b1.x) * (a2.y - b1.y) - (b2.y - b1.y) * (a2.x - b1.x);
  const d3 = (a2.x - a1.x) * (b1.y - a1.y) - (a2.y - a1.y) * (b1.x - a1.x);
  const d4 = (a2.x - a1.x) * (b2.y - a1.y) - (a2.y - a1.y) * (b2.x - a1.x);

  // Check if segments straddle each other (proper intersection)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  return false;
}

/**
 * Find all self-intersections in a polygon.
 */
function findSelfIntersections(
  polygon: Vector2[]
): Array<{ edge1: number; edge2: number }> {
  const intersections: Array<{ edge1: number; edge2: number }> = [];
  const n = polygon.length;

  if (n < 4) return intersections; // Need at least 4 vertices for possible intersection

  for (let i = 0; i < n; i++) {
    const a1 = polygon[i]!;
    const a2 = polygon[(i + 1) % n]!;

    // Check against non-adjacent edges
    for (let j = i + 2; j < n; j++) {
      // Skip if j is adjacent to i (wrapping around)
      if (j === (i + n - 1) % n) continue;
      if (i === 0 && j === n - 1) continue; // First and last edges are adjacent

      const b1 = polygon[j]!;
      const b2 = polygon[(j + 1) % n]!;

      if (segmentsProperlyIntersect(a1, a2, b1, b2)) {
        intersections.push({ edge1: i, edge2: j });
      }
    }
  }

  return intersections;
}

/**
 * Validate a single visibility stage for self-intersections.
 */
function validateStageSelfIntersection(
  stage: VisibilityStage
): string[] {
  const violations: string[] = [];
  const intersections = findSelfIntersections(stage.polygon);

  for (const { edge1, edge2 } of intersections) {
    const n = stage.polygon.length;
    const a1 = stage.polygon[edge1]!;
    const a2 = stage.polygon[(edge1 + 1) % n]!;
    const b1 = stage.polygon[edge2]!;
    const b2 = stage.polygon[(edge2 + 1) % n]!;

    violations.push(
      `Edge ${edge1}→${(edge1 + 1) % n} (${a1.x.toFixed(1)},${a1.y.toFixed(1)})→(${a2.x.toFixed(1)},${a2.y.toFixed(1)}) ` +
        `crosses edge ${edge2}→${(edge2 + 1) % n} (${b1.x.toFixed(1)},${b1.y.toFixed(1)})→(${b2.x.toFixed(1)},${b2.y.toFixed(1)})`
    );
  }

  return violations;
}

export const noSelfIntersectionInvariant: Invariant = {
  id: "no-self-intersection",
  name: "No Self-Intersection",
  description: "Polygon edges must not cross each other",

  assert: (context: InvariantContext): void => {
    const allViolations: string[] = [];

    for (const stage of context.visibilityStages) {
      const stageViolations = validateStageSelfIntersection(stage);
      if (stageViolations.length > 0) {
        allViolations.push(
          `Stage ${stage.stageIndex} (${stage.surfaceId ?? "player"}): ${stageViolations.join("; ")}`
        );
      }
    }

    assertNoViolations("no-self-intersection", allViolations);
  },
};

