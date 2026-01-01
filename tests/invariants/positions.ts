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
 */
export const SPECIAL_POSITIONS: Vector2[] = [
  // Chain1 120-degree V junction pixel-perfect bug (player positions)
  { x: 952.9123332000011, y: 666 }, // INVALID - junction apex missing
  { x: 952.9123736006022, y: 666 }, // VALID - junction apex present
  // Corresponding cursor positions
  { x: 649.1646778042959, y: 268.35322195704055 }, // cursor for invalid
  { x: 655.2744630071599, y: 269.88066825775655 }, // cursor for valid
  // Chain3 60-degree V junction sorting bug
  { x: 595.2037203000001, y: 666 }, // player position for chain3 bug
  { x: 905.7756563245823, y: 120.1909307875895 }, // cursor position for chain3 bug
  // Pyramid sorting bug - missing endpoint (1030, 500)
  { x: 1090.8850699188959, y: 666 }, // BUGGY - pyramid-1 left endpoint missing
  { x: 1090.7970816001189, y: 666 }, // CORRECT - pyramid-1 left endpoint present
  { x: 1035.6085918854415, y: 485.25059665871123 }, // cursor for buggy
  { x: 1031.0262529832935, y: 477.61336515513125 }, // cursor for correct
  // Top-left corner sorting bug - left-wall endpoint (20, 80) missing
  { x: 130.71028971272352, y: 522.6852008399795 }, // BUGGY player - (20,80) missing
  { x: 130.86070971272358, y: 522.6601108399797 }, // CORRECT player - (20,80) present
  { x: 82.90155440414507, y: 209.11917098445593 }, // cursor for buggy
  { x: 66.32124352331606, y: 200.82901554404143 }, // cursor for correct
  // Chain reflection bug - reflected polygon truncated (only 3 vertices)
  { x: 799.5532401600012, y: 666 }, // player for chain1-0 reflection bug
  { x: 640, y: 283.7305699481865 }, // cursor for chain1-0 reflection bug
  // Duplicate apex bug - apex appears twice with floating-point error
  { x: 1105.6955874, y: 666 }, // BUGGY - apex duplicated (5 vertices)
  { x: 1105.6955179119636, y: 666 }, // CORRECT - apex once (4 vertices)
  { x: 658.2383419689119, y: 439.5854922279793 }, // cursor for buggy
  { x: 668.1865284974093, y: 573.8860103626943 }, // cursor for correct
  // Junction sorting bug - black triangle between ceiling and chain3 apex (850, 250)
  // Apex and its continuation ceiling hit are on same ray but sorted incorrectly
  { x: 889.0416036756611, y: 269.9802316262268 }, // player - black triangle bug
  { x: 802.4870466321242, y: 159.3782383419689 }, // cursor - black triangle bug
];

/**
 * All positions to test (grid + special).
 */
export const ALL_POSITIONS: Vector2[] = [...generateGridPositions(), ...SPECIAL_POSITIONS];

/**
 * Get a position key for deduplication/logging.
 */
export function positionKey(pos: Vector2): string {
  return `(${Math.round(pos.x)},${Math.round(pos.y)})`;
}
