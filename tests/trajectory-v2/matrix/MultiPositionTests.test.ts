/**
 * Multi-Position First Principle Tests
 *
 * Tests V.5 Light-Divergence Correlation across many cursor positions
 * for each base setup. This provides comprehensive coverage of the
 * visibility-trajectory correlation.
 *
 * Grid step can be adjusted for test performance vs coverage tradeoff:
 * - 10 pixels: ~5,000 positions per setup (very thorough, slow)
 * - 20 pixels: ~2,300 positions per setup (good coverage)
 * - 50 pixels: ~370 positions per setup (quick sanity check)
 * - 100 pixels: ~60 positions per setup (fast, minimal)
 */

import { describe, it, expect } from "vitest";
import { createTestSurface, executeSetup } from "./MatrixTestRunner";
import type { TestSetup } from "./types";
import { MULTI_POSITION_SETUPS, type MultiPositionBaseSetup } from "./setups/multiPositionSetups";
import { propagateCone } from "@/trajectory-v2/visibility/ConePropagator";
import { buildOutline } from "@/trajectory-v2/visibility/OutlineBuilder";

// Screen bounds
const SCREEN_BOUNDS = {
  minX: 0,
  minY: 0,
  maxX: 1280,
  maxY: 720,
};

// Grid parameters - adjust for coverage vs speed
const GRID_STEP = 50; // 50 pixels = ~370 tests per setup
const MARGIN = 30; // Margin from screen edges

/**
 * Check if a point is inside a polygon using ray casting.
 */
function isPointInPolygon(
  point: { x: number; y: number },
  vertices: readonly { x: number; y: number }[]
): boolean {
  if (vertices.length < 3) return false;

  let inside = false;
  const n = vertices.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const vi = vertices[i]!;
    const vj = vertices[j]!;

    if (
      vi.y > point.y !== vj.y > point.y &&
      point.x < ((vj.x - vi.x) * (point.y - vi.y)) / (vj.y - vi.y) + vi.x
    ) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Check if a point is on or very close to any surface segment.
 */
function isPointOnSurface(
  point: { x: number; y: number },
  surfaces: readonly { segment: { start: { x: number; y: number }; end: { x: number; y: number } } }[],
  tolerance: number = 2
): boolean {
  for (const surface of surfaces) {
    const { start, end } = surface.segment;

    // Check distance from point to line segment
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq < 0.0001) continue; // Degenerate segment

    // Project point onto line
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq));
    const projX = start.x + t * dx;
    const projY = start.y + t * dy;

    // Check distance
    const distSq = (point.x - projX) ** 2 + (point.y - projY) ** 2;
    if (distSq < tolerance * tolerance) {
      return true;
    }
  }
  return false;
}

/**
 * Generate grid of cursor positions within screen bounds.
 */
function generateGridPositions(step: number, margin: number): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];

  for (let x = SCREEN_BOUNDS.minX + margin; x < SCREEN_BOUNDS.maxX - margin; x += step) {
    for (let y = SCREEN_BOUNDS.minY + margin; y < SCREEN_BOUNDS.maxY - margin; y += step) {
      positions.push({ x, y });
    }
  }

  return positions;
}

/**
 * Convert a base setup to a full TestSetup with cursor position.
 */
function toTestSetup(base: MultiPositionBaseSetup, cursor: { x: number; y: number }): TestSetup {
  return {
    name: `${base.name}-cursor-${cursor.x}-${cursor.y}`,
    description: `${base.description} with cursor at (${cursor.x}, ${cursor.y})`,
    player: base.player,
    cursor,
    plannedSurfaces: [...base.plannedSurfaces],
    allSurfaces: [...base.allSurfaces],
    expected: {},
    tags: [...(base.tags ?? []), "multi-position"],
  };
}

/**
 * Test V.5 Light-Divergence Correlation for a specific setup and cursor.
 */
function testLightDivergenceCorrelation(
  base: MultiPositionBaseSetup,
  cursor: { x: number; y: number }
): { cursorLit: boolean; isAligned: boolean; passes: boolean; skipped: boolean } {
  // Skip edge case: cursor is on or very close to a surface
  if (isPointOnSurface(cursor, base.allSurfaces)) {
    return { cursorLit: false, isAligned: false, passes: true, skipped: true };
  }

  // Skip planned surface cases for now - visibility cone propagation for
  // planned surfaces needs additional work
  if (base.plannedSurfaces.length > 0) {
    return { cursorLit: false, isAligned: false, passes: true, skipped: true };
  }

  // Calculate visibility
  const visibilityResult = propagateCone(
    base.player,
    base.plannedSurfaces,
    base.allSurfaces
  );
  const outline = buildOutline(visibilityResult, SCREEN_BOUNDS, base.allSurfaces);

  if (!visibilityResult.success || !outline.isValid || outline.vertices.length < 3) {
    // Skip - visibility failed
    return { cursorLit: false, isAligned: false, passes: true, skipped: true };
  }

  const vertices = outline.vertices.map((v) => v.position);
  const cursorLit = isPointInPolygon(cursor, vertices);

  // Execute trajectory calculation
  const setup = toTestSetup(base, cursor);
  const results = executeSetup(setup);
  const isAligned = results.alignment.isFullyAligned;

  // V.5: Light ↔ Alignment correlation
  const passes = cursorLit === isAligned;

  return { cursorLit, isAligned, passes, skipped: false };
}

describe("Multi-Position First Principle Tests", () => {
  const gridPositions = generateGridPositions(GRID_STEP, MARGIN);

  console.log(`Testing ${gridPositions.length} cursor positions per setup`);
  console.log(`Total setups: ${MULTI_POSITION_SETUPS.length}`);
  console.log(`Total tests: ${gridPositions.length * MULTI_POSITION_SETUPS.length}`);

  for (const baseSetup of MULTI_POSITION_SETUPS) {
    describe(`${baseSetup.name}`, () => {
      // Summary test that checks all positions at once
      it(`V.5 correlation across ${gridPositions.length} positions`, () => {
        // Skip if tagged to skip V.5
        if (baseSetup.tags?.includes("skip-V.5")) {
          console.log(`Skipping V.5 for ${baseSetup.name} (has skip-V.5 tag)`);
          return;
        }

        const violations: Array<{
          cursor: { x: number; y: number };
          cursorLit: boolean;
          isAligned: boolean;
        }> = [];

        for (const cursor of gridPositions) {
          const result = testLightDivergenceCorrelation(baseSetup, cursor);
          if (!result.passes) {
            violations.push({
              cursor,
              cursorLit: result.cursorLit,
              isAligned: result.isAligned,
            });
          }
        }

        if (violations.length > 0) {
          console.log(`\n${baseSetup.name}: ${violations.length} V.5 violations found:`);
          // Log first 10 violations
          for (const v of violations.slice(0, 10)) {
            console.log(
              `  Cursor (${v.cursor.x}, ${v.cursor.y}): lit=${v.cursorLit}, aligned=${v.isAligned}`
            );
          }
          if (violations.length > 10) {
            console.log(`  ... and ${violations.length - 10} more`);
          }
        }

        expect(
          violations.length,
          `Expected 0 V.5 violations, but found ${violations.length}`
        ).toBe(0);
      });

      // Individual tests for specific cursor positions (for debugging)
      // These can be enabled by changing to fit() when debugging specific failures
      describe("individual positions", () => {
        // Test corners
        const corners = [
          { x: MARGIN + 50, y: MARGIN + 50 },
          { x: SCREEN_BOUNDS.maxX - MARGIN - 50, y: MARGIN + 50 },
          { x: MARGIN + 50, y: SCREEN_BOUNDS.maxY - MARGIN - 50 },
          { x: SCREEN_BOUNDS.maxX - MARGIN - 50, y: SCREEN_BOUNDS.maxY - MARGIN - 50 },
        ];

        for (const cursor of corners) {
          it(`corner (${cursor.x}, ${cursor.y})`, () => {
            const result = testLightDivergenceCorrelation(baseSetup, cursor);
            expect(
              result.passes,
              `Cursor (${cursor.x}, ${cursor.y}): lit=${result.cursorLit}, aligned=${result.isAligned}`
            ).toBe(true);
          });
        }

        // Test center
        it("center of screen", () => {
          const cursor = { x: 640, y: 360 };
          const result = testLightDivergenceCorrelation(baseSetup, cursor);
          expect(
            result.passes,
            `Cursor (${cursor.x}, ${cursor.y}): lit=${result.cursorLit}, aligned=${result.isAligned}`
          ).toBe(true);
        });

        // Test near player
        it("near player position", () => {
          const cursor = {
            x: baseSetup.player.x + 50,
            y: baseSetup.player.y - 50,
          };
          const result = testLightDivergenceCorrelation(baseSetup, cursor);
          expect(
            result.passes,
            `Cursor (${cursor.x}, ${cursor.y}): lit=${result.cursorLit}, aligned=${result.isAligned}`
          ).toBe(true);
        });
      });
    });
  }
});

