/**
 * Invariant Tests
 *
 * Tests invariants across a cartesian product of:
 * - Scenes (surface configurations)
 * - Player positions (10x10 grid + special positions)
 * - Cursor positions (10x10 grid + special positions)
 * - Invariants (assertions that must always hold)
 *
 * Total combinations: 13 scenes × 100 players × 100 cursors × 3 invariants = 390,000 tests
 *
 * ## Modes
 *
 * ### Batched Mode (Default)
 * Fast execution with one test per scene. Violations are collected and reported
 * with copy-paste commands for focused investigation.
 *
 * ### Focused Mode (Investigation)
 * Set environment variables to narrow down to specific cases:
 * - INVARIANT_FOCUS_SCENE=single-horizontal
 * - INVARIANT_FOCUS_PLAYER=109,81
 * - INVARIANT_FOCUS_CURSOR=581,81
 * - INVARIANT_FOCUS_INVARIANT=polygon-edges
 *
 * Example:
 *   INVARIANT_FOCUS_SCENE=single-horizontal INVARIANT_FOCUS_PLAYER=109,81 npm test -- tests/invariants/
 */

import { describe, it, expect } from "vitest";
import { ALL_SCENES } from "./scenes";
import { ALL_POSITIONS, positionKey } from "./positions";
import { ALL_INVARIANTS } from "./invariants";
import { computeContext, DEFAULT_SCREEN_BOUNDS } from "./runner";
import type { Scene, InvariantContext, PlannedSequence } from "./types";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

/** Default sequence for scenes without plannedSequences */
const EMPTY_SEQUENCE: PlannedSequence = { name: "empty", surfaces: [] };

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Parse a position from environment variable (e.g., "109,81" -> {x: 109, y: 81})
 */
function parsePosition(value: string | undefined): Vector2 | undefined {
  if (!value) return undefined;
  const parts = value.split(",").map((s) => parseFloat(s.trim()));
  if (parts.length !== 2 || parts.some(isNaN)) return undefined;
  return { x: parts[0]!, y: parts[1]! };
}

/**
 * Focus configuration from environment variables.
 * When any of these are set, we switch to focused mode.
 */
const FOCUS = {
  scene: process.env.INVARIANT_FOCUS_SCENE,
  player: parsePosition(process.env.INVARIANT_FOCUS_PLAYER),
  cursor: parsePosition(process.env.INVARIANT_FOCUS_CURSOR),
  invariant: process.env.INVARIANT_FOCUS_INVARIANT,
  sequence: process.env.INVARIANT_FOCUS_SEQUENCE,
};

/**
 * Whether we're in focused mode (any focus variable is set).
 */
const IS_FOCUSED = !!(FOCUS.scene || FOCUS.player || FOCUS.cursor || FOCUS.invariant || FOCUS.sequence);

/**
 * Whether to run full test suite (all positions) or sampled.
 * Use environment variable INVARIANT_FULL=1 for full run.
 */
const FULL_RUN = process.env.INVARIANT_FULL === "1";

/**
 * Sample rate for positions (1 = every position, 4 = every 4th position).
 * In focused mode, always use all positions.
 */
const SAMPLE_RATE = IS_FOCUSED || FULL_RUN ? 1 : 4;

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get positions to test, applying sampling if not focused.
 */
function getPositionsToTest(): Vector2[] {
  return ALL_POSITIONS.filter((_, i) => i % SAMPLE_RATE === 0);
}

/**
 * Check if player and cursor are too close (skip these).
 */
function arePositionsTooClose(player: Vector2, cursor: Vector2): boolean {
  const dx = player.x - cursor.x;
  const dy = player.y - cursor.y;
  return dx * dx + dy * dy < 100; // 10 pixels minimum distance
}

/**
 * Check if a position is within screen bounds.
 */
function isWithinBounds(pos: Vector2): boolean {
  return (
    pos.x >= DEFAULT_SCREEN_BOUNDS.minX &&
    pos.x <= DEFAULT_SCREEN_BOUNDS.maxX &&
    pos.y >= DEFAULT_SCREEN_BOUNDS.minY &&
    pos.y <= DEFAULT_SCREEN_BOUNDS.maxY
  );
}

/**
 * Check if a position matches a focus position (within 1 pixel).
 */
function positionMatches(pos: Vector2, focus: Vector2 | undefined): boolean {
  if (!focus) return true; // No focus = match all
  return Math.abs(pos.x - focus.x) < 1 && Math.abs(pos.y - focus.y) < 1;
}

/**
 * Format a violation as a copy-paste command.
 */
function formatViolationCommand(
  scene: string,
  player: Vector2,
  cursor: Vector2,
  sequence: string,
  invariantId?: string
): string {
  const px = Math.round(player.x);
  const py = Math.round(player.y);
  const cx = Math.round(cursor.x);
  const cy = Math.round(cursor.y);
  const invPart = invariantId ? ` INVARIANT_FOCUS_INVARIANT=${invariantId}` : "";
  const seqPart = sequence !== "empty" ? ` INVARIANT_FOCUS_SEQUENCE=${sequence}` : "";
  return `INVARIANT_FOCUS_SCENE=${scene} INVARIANT_FOCUS_PLAYER=${px},${py} INVARIANT_FOCUS_CURSOR=${cx},${cy}${seqPart}${invPart} npm test -- tests/invariants/`;
}

/**
 * Violation record for tracking.
 */
interface Violation {
  scene: string;
  sequence: string;
  player: Vector2;
  cursor: Vector2;
  invariantId: string;
  message: string;
}

// =============================================================================
// HELPERS FOR SEQUENCES
// =============================================================================

/**
 * Get sequences to test for a scene.
 */
function getSequencesToTest(scene: Scene): PlannedSequence[] {
  return scene.plannedSequences ?? [EMPTY_SEQUENCE];
}

// =============================================================================
// BATCHED MODE - Fast execution, one test per scene
// =============================================================================

function runBatchedTests(): void {
  const positions = getPositionsToTest();

  // Count total sequences
  let totalSequences = 0;
  for (const scene of ALL_SCENES) {
    totalSequences += getSequencesToTest(scene).length;
  }

  console.log("=== Invariant Tests (Batched Mode) ===");
  console.log(`Scenes: ${ALL_SCENES.length}`);
  console.log(`Total sequences: ${totalSequences}`);
  console.log(`Positions: ${positions.length} (sampled from ${ALL_POSITIONS.length})`);
  console.log(`Invariants: ${ALL_INVARIANTS.length}`);
  console.log(`Total test cases: ~${totalSequences * positions.length * positions.length * ALL_INVARIANTS.length}`);
  console.log("");

  describe("Invariant Tests", () => {
    for (const scene of ALL_SCENES) {
      describe(`Scene: ${scene.name}`, () => {
        const sequences = getSequencesToTest(scene);

        for (const sequence of sequences) {
          it(`${scene.name}/${sequence.name}: should satisfy all invariants`, () => {
            const violations: Violation[] = [];
            let testedCount = 0;
            let skippedCount = 0;

            for (const player of positions) {
              if (!isWithinBounds(player)) {
                skippedCount++;
                continue;
              }

              for (const cursor of positions) {
                if (!isWithinBounds(cursor)) {
                  skippedCount++;
                  continue;
                }

                if (arePositionsTooClose(player, cursor)) {
                  skippedCount++;
                  continue;
                }

                testedCount++;

                // Compute context once per position pair
                let context: InvariantContext;
                try {
                  context = computeContext(scene, player, cursor, DEFAULT_SCREEN_BOUNDS, sequence);
                } catch (error) {
                  violations.push({
                    scene: scene.name,
                    sequence: sequence.name,
                    player,
                    cursor,
                    invariantId: "context",
                    message: `Context computation failed: ${error}`,
                  });
                  continue;
                }

                // Check all invariants
                for (const invariant of ALL_INVARIANTS) {
                  try {
                    invariant.assert(context);
                  } catch (error) {
                    const message = error instanceof Error ? error.message : String(error);
                    violations.push({
                      scene: scene.name,
                      sequence: sequence.name,
                      player,
                      cursor,
                      invariantId: invariant.id,
                      message,
                    });
                  }
                }
              }
            }

            // Report results
            console.log(`  ${scene.name}/${sequence.name}: ${testedCount} tested, ${skippedCount} skipped`);

            if (violations.length > 0) {
              // Group by invariant
              const byInvariant = new Map<string, Violation[]>();
              for (const v of violations) {
                const list = byInvariant.get(v.invariantId) ?? [];
                list.push(v);
                byInvariant.set(v.invariantId, list);
              }

              console.log(`  Found ${violations.length} violations:`);
              for (const [invariantId, invViolations] of byInvariant) {
                console.log(`    [${invariantId}]: ${invViolations.length} violations`);
              }

              // Print first few as copy-paste commands
              console.log("\n  To investigate, run:");
              const uniquePositions = new Map<string, Violation>();
              for (const v of violations) {
                const key = `${positionKey(v.player)}-${positionKey(v.cursor)}-${v.sequence}`;
                if (!uniquePositions.has(key)) {
                  uniquePositions.set(key, v);
                }
              }
              const toShow = Array.from(uniquePositions.values()).slice(0, 5);
              for (const v of toShow) {
                console.log(`    ${formatViolationCommand(v.scene, v.player, v.cursor, v.sequence)}`);
              }
              if (uniquePositions.size > 5) {
                console.log(`    ... and ${uniquePositions.size - 5} more position pairs`);
              }
            }

            expect(
              violations.length,
              `Found ${violations.length} invariant violations in "${scene.name}/${sequence.name}"`
            ).toBe(0);
          });
        }
      });
    }
  });
}

// =============================================================================
// FOCUSED MODE - Individual test cases for investigation
// =============================================================================

function runFocusedTests(): void {
  const positions = getPositionsToTest();

  // Filter scenes
  const scenes = FOCUS.scene
    ? ALL_SCENES.filter((s) => s.name === FOCUS.scene)
    : ALL_SCENES;

  // Filter invariants
  const invariants = FOCUS.invariant
    ? ALL_INVARIANTS.filter((i) => i.id === FOCUS.invariant)
    : ALL_INVARIANTS;

  // Filter positions
  const players = positions.filter((p) => positionMatches(p, FOCUS.player));
  const cursors = positions.filter((c) => positionMatches(c, FOCUS.cursor));

  // Get sequences (optionally filtered)
  const getFilteredSequences = (scene: Scene): PlannedSequence[] => {
    const allSeqs = getSequencesToTest(scene);
    if (FOCUS.sequence) {
      return allSeqs.filter((s) => s.name === FOCUS.sequence);
    }
    return allSeqs;
  };

  // Count total sequences for display
  let totalSequences = 0;
  for (const s of scenes) {
    totalSequences += getFilteredSequences(s).length;
  }

  console.log("=== Invariant Tests (Focused Mode) ===");
  console.log(`Scenes: ${scenes.length} (${scenes.map((s) => s.name).join(", ")})`);
  console.log(`Sequences: ${totalSequences}${FOCUS.sequence ? ` (filtered to: ${FOCUS.sequence})` : ""}`);
  console.log(`Players: ${players.length}`);
  console.log(`Cursors: ${cursors.length}`);
  console.log(`Invariants: ${invariants.length} (${invariants.map((i) => i.id).join(", ")})`);
  console.log("");

  describe("Invariant Tests (Focused)", () => {
    for (const scene of scenes) {
      const sequences = getFilteredSequences(scene);

      for (const sequence of sequences) {
        describe(`Scene: ${scene.name}/${sequence.name}`, () => {
          for (const player of players) {
            if (!isWithinBounds(player)) continue;

            for (const cursor of cursors) {
              if (!isWithinBounds(cursor)) continue;
              if (arePositionsTooClose(player, cursor)) continue;

              describe(`player=${positionKey(player)} cursor=${positionKey(cursor)}`, () => {
                // Compute context once per position pair
                let context: InvariantContext;

                // Use a single test for context computation errors
                it("should compute context successfully", () => {
                  context = computeContext(scene, player, cursor, DEFAULT_SCREEN_BOUNDS, sequence);
                  expect(context).toBeDefined();
                });

                // Individual test for each invariant
                for (const invariant of invariants) {
                  it(`${invariant.id}: ${invariant.name}`, () => {
                    // Skip if context failed
                    if (!context) {
                      throw new Error("Context computation failed in previous test");
                    }
                    invariant.assert(context);
                  });
                }
              });
            }
          }
        });
      }
    }
  });
}

// =============================================================================
// MAIN - Choose mode based on environment
// =============================================================================

if (IS_FOCUSED) {
  runFocusedTests();
} else {
  runBatchedTests();
}
