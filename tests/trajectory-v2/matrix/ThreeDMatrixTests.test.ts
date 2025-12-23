/**
 * 3D Test Matrix: Setups × Assertions × Cursor Positions
 *
 * This is the comprehensive test suite that tests:
 * - Every base setup (converted from ALL_SETUPS + MULTI_POSITION_SETUPS)
 * - Every first principle assertion
 * - Many cursor grid positions
 *
 * This provides maximum coverage of first principles across all scenarios.
 *
 * IMPORTANT: Uses batched summary tests to avoid memory exhaustion.
 * Each setup gets ONE test that runs all assertions at all cursor positions.
 *
 * Grid step can be adjusted for performance:
 * - 50 pixels: ~370 positions per setup (balanced)
 * - 100 pixels: ~78 positions per setup (fast)
 * - 200 pixels: ~24 positions per setup (very fast)
 */

import { describe, it, expect } from "vitest";
import { executeSetup } from "./MatrixTestRunner";
import type { TestSetup, FirstPrincipleAssertion, TestResults } from "./types";
import { ALL_SETUPS } from "./setups";
import { MULTI_POSITION_SETUPS, type MultiPositionBaseSetup } from "./setups/multiPositionSetups";
import { ALL_ASSERTIONS } from "./assertions";
import { visibilityLightingAssertions } from "./assertions/visibility-lighting";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";

// Screen bounds
const SCREEN_BOUNDS = {
  minX: 0,
  minY: 0,
  maxX: 1280,
  maxY: 720,
};

// Grid parameters - 4x denser for better coverage (16x more points)
const GRID_STEP = 50; // 50 pixels = ~384 positions per setup
const MARGIN = 50; // Margin from screen edges

/**
 * Base setup for 3D matrix testing (no fixed cursor).
 */
interface BaseSetup {
  readonly name: string;
  readonly description: string;
  readonly player: Vector2;
  readonly plannedSurfaces: readonly Surface[];
  readonly allSurfaces: readonly Surface[];
  readonly tags?: readonly string[];
}

/**
 * Violation record for reporting.
 */
interface Violation {
  cursor: Vector2;
  assertionId: string;
  principle: string;
  error: string;
}

/**
 * Convert a TestSetup to a BaseSetup (removes fixed cursor).
 */
function toBaseSetup(setup: TestSetup): BaseSetup {
  return {
    name: setup.name,
    description: setup.description,
    player: setup.player,
    plannedSurfaces: [...setup.plannedSurfaces],
    allSurfaces: [...setup.allSurfaces],
    tags: setup.tags,
  };
}

/**
 * Convert a BaseSetup to a TestSetup with a specific cursor.
 */
function toTestSetup(base: BaseSetup, cursor: Vector2): TestSetup {
  return {
    name: `${base.name}@(${cursor.x},${cursor.y})`,
    description: `${base.description} with cursor at (${cursor.x}, ${cursor.y})`,
    player: base.player,
    cursor,
    plannedSurfaces: [...base.plannedSurfaces],
    allSurfaces: [...base.allSurfaces],
    expected: {},
    tags: [...(base.tags ?? []), "3d-matrix"],
  };
}

/**
 * Generate grid of cursor positions within screen bounds.
 */
function generateGridPositions(step: number, margin: number): Vector2[] {
  const positions: Vector2[] = [];

  for (let x = SCREEN_BOUNDS.minX + margin; x < SCREEN_BOUNDS.maxX - margin; x += step) {
    for (let y = SCREEN_BOUNDS.minY + margin; y < SCREEN_BOUNDS.maxY - margin; y += step) {
      positions.push({ x, y });
    }
  }

  return positions;
}

/**
 * Check if a point is on or very close to any surface segment.
 */
function isPointOnSurface(
  point: Vector2,
  surfaces: readonly Surface[],
  tolerance: number = 2
): boolean {
  for (const surface of surfaces) {
    const { start, end } = surface.segment;

    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq < 0.0001) continue;

    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq));
    const projX = start.x + t * dx;
    const projY = start.y + t * dy;

    const distSq = (point.x - projX) ** 2 + (point.y - projY) ** 2;
    if (distSq < tolerance * tolerance) {
      return true;
    }
  }
  return false;
}

/**
 * Check if cursor is at the same position as player (degenerate case).
 */
function isCursorAtPlayer(cursor: Vector2, player: Vector2, tolerance: number = 5): boolean {
  const dx = cursor.x - player.x;
  const dy = cursor.y - player.y;
  return dx * dx + dy * dy < tolerance * tolerance;
}

/**
 * Deduplicate base setups by name.
 */
function deduplicateSetups(setups: BaseSetup[]): BaseSetup[] {
  const seen = new Set<string>();
  const result: BaseSetup[] = [];

  for (const setup of setups) {
    if (!seen.has(setup.name)) {
      seen.add(setup.name);
      result.push(setup);
    }
  }

  return result;
}

/**
 * All base setups for 3D matrix testing.
 * Combines converted TestSetups and multi-position setups.
 */
const ALL_BASE_SETUPS: readonly BaseSetup[] = deduplicateSetups([
  // Convert existing TestSetups to base setups
  ...ALL_SETUPS.map(toBaseSetup),
  // Add multi-position setups (already in base format)
  ...MULTI_POSITION_SETUPS,
]);

/**
 * All assertions including visibility assertions.
 */
const ALL_MATRIX_ASSERTIONS: readonly FirstPrincipleAssertion[] = [
  ...ALL_ASSERTIONS,
  ...visibilityLightingAssertions,
];

/**
 * Check if an assertion should be skipped for this setup/cursor combination.
 * 
 * MINIMAL SKIPPING: We only skip in cases where the assertion literally cannot apply.
 * If an assertion fails, that's a real issue to investigate.
 */
function shouldSkipAssertion(
  assertion: FirstPrincipleAssertion,
  setup: TestSetup,
  base: BaseSetup
): boolean {
  // Skip V.3 (light exits last window) for setups without planned surfaces
  // This assertion only makes sense when there ARE planned surfaces
  if (assertion.id === "light-exits-last-window" && base.plannedSurfaces.length === 0) {
    return true;
  }

  // NOTE: We NO LONGER skip visibility assertions for planned surfaces!
  // The visibility system must work correctly with planned surfaces (V.5 principle)

  return false;
}

/**
 * Run all assertions against a single setup+cursor.
 * Returns list of violations.
 */
function runAllAssertions(
  setup: TestSetup,
  results: TestResults,
  assertions: readonly FirstPrincipleAssertion[],
  base: BaseSetup
): Violation[] {
  const violations: Violation[] = [];

  for (const assertion of assertions) {
    // Skip inapplicable assertions
    if (shouldSkipAssertion(assertion, setup, base)) {
      continue;
    }

    try {
      assertion.assert(setup, results);
    } catch (e) {
      violations.push({
        cursor: setup.cursor,
        assertionId: assertion.id,
        principle: assertion.principle,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return violations;
}

describe("3D Test Matrix: Setups × Assertions × Cursor Positions", () => {
  const gridPositions = generateGridPositions(GRID_STEP, MARGIN);

  console.log("\n=== 3D Test Matrix Configuration ===");
  console.log(`Base setups: ${ALL_BASE_SETUPS.length}`);
  console.log(`Assertions: ${ALL_MATRIX_ASSERTIONS.length}`);
  console.log(`Grid positions: ${gridPositions.length}`);
  console.log(`Total combinations: ${ALL_BASE_SETUPS.length * ALL_MATRIX_ASSERTIONS.length * gridPositions.length}`);
  console.log("=====================================\n");

  // ONE test per setup - runs all assertions at all cursor positions
  for (const baseSetup of ALL_BASE_SETUPS) {
    it(`${baseSetup.name}: all assertions × ${gridPositions.length} positions`, () => {
      const allViolations: Violation[] = [];
      let testedCount = 0;
      let skippedCount = 0;

      for (const cursor of gridPositions) {
        // Skip degenerate cases
        if (isPointOnSurface(cursor, baseSetup.allSurfaces)) {
          skippedCount++;
          continue;
        }
        if (isCursorAtPlayer(cursor, baseSetup.player)) {
          skippedCount++;
          continue;
        }

        const setup = toTestSetup(baseSetup, cursor);

        // Execute setup ONCE and run ALL assertions
        const results = executeSetup(setup);
        const violations = runAllAssertions(setup, results, ALL_MATRIX_ASSERTIONS, baseSetup);
        allViolations.push(...violations);
        testedCount++;
      }

      // Log summary of violations
      if (allViolations.length > 0) {
        // Group by principle
        const byPrinciple = new Map<string, Violation[]>();
        for (const v of allViolations) {
          if (!byPrinciple.has(v.principle)) {
            byPrinciple.set(v.principle, []);
          }
          byPrinciple.get(v.principle)!.push(v);
        }

        console.log(`\n[${baseSetup.name}] ${allViolations.length} violations across ${testedCount} positions:`);
        for (const [principle, violations] of byPrinciple) {
          console.log(`  ${principle}: ${violations.length} violations`);
          for (const v of violations.slice(0, 2)) {
            console.log(`    (${v.cursor.x}, ${v.cursor.y}): ${v.error.slice(0, 80)}`);
          }
          if (violations.length > 2) {
            console.log(`    ... and ${violations.length - 2} more`);
          }
        }
      }

      expect(
        allViolations.length,
        `Found ${allViolations.length} principle violations`
      ).toBe(0);
    });
  }
});

/**
 * Focused tests for debugging specific failures.
 * Uncomment and modify to debug specific setups.
 */
// describe.only("Debug specific setup", () => {
//   const setupName = "specific-setup";
//   const baseSetup = ALL_BASE_SETUPS.find((s) => s.name === setupName);
//   const cursor = { x: 500, y: 300 };
//
//   if (baseSetup) {
//     it("should pass all assertions", () => {
//       const setup = toTestSetup(baseSetup, cursor);
//       const results = executeSetup(setup);
//       const violations = runAllAssertions(setup, results, ALL_MATRIX_ASSERTIONS);
//       for (const v of violations) {
//         console.log(`${v.principle} ${v.assertionId}: ${v.error}`);
//       }
//       expect(violations.length).toBe(0);
//     });
//   }
// });

