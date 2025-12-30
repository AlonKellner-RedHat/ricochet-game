/**
 * Position Generation for Invariant Tests
 *
 * Generates a 10x10 grid of positions plus special positions.
 * Used for both player and cursor positions.
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";

/** Screen dimensions */
export const SCREEN = {
  width: 1280,
  height: 720,
} as const;

/** Grid size (10x10 = 100 positions) */
export const GRID_SIZE = 10;

/** Margin from screen edges */
export const MARGIN = 50;

/**
 * Generate a 10x10 grid of positions within screen bounds.
 * Positions are centered in each grid cell.
 */
export function generateGridPositions(): Vector2[] {
  const positions: Vector2[] = [];
  const usableWidth = SCREEN.width - 2 * MARGIN;
  const usableHeight = SCREEN.height - 2 * MARGIN;

  for (let row = 0; row < GRID_SIZE; row++) {
    for (let col = 0; col < GRID_SIZE; col++) {
      // Center of each grid cell
      const x = MARGIN + (usableWidth * (col + 0.5)) / GRID_SIZE;
      const y = MARGIN + (usableHeight * (row + 0.5)) / GRID_SIZE;
      positions.push({ x, y });
    }
  }

  return positions;
}

/**
 * Special positions to test edge cases.
 * These are added as bugs are discovered.
 * Initially empty - add positions that reproduce bugs.
 */
export const SPECIAL_POSITIONS: Vector2[] = [
  // Add positions here as bugs are found, e.g.:
  // { x: 1089.866172610004, y: 174 }, // Pixel-perfect bug position
];

/**
 * All positions to test (grid + special).
 */
export const ALL_POSITIONS: Vector2[] = [
  ...generateGridPositions(),
  ...SPECIAL_POSITIONS,
];

/**
 * Get a position key for deduplication/logging.
 */
export function positionKey(pos: Vector2): string {
  return `(${Math.round(pos.x)},${Math.round(pos.y)})`;
}

