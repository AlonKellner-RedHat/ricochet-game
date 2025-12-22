/**
 * Edge Case Test Setups
 *
 * Category 5: Boundary conditions and unusual scenarios
 */

import { createVerticalSurface } from "../MatrixTestRunner";
import type { TestSetup } from "../types";

/**
 * Cursor at player position (zero distance).
 * Note: This is a degenerate case, behavior may vary.
 */
export const cursorAtPlayer: TestSetup = {
  name: "cursor-at-player",
  description: "Cursor at exact player position (zero distance)",
  player: { x: 300, y: 300 },
  cursor: { x: 300, y: 300 },
  plannedSurfaces: [],
  allSurfaces: [],
  expected: {
    reachesCursor: true,
  },
  tags: ["edge-case", "degenerate"],
};

/**
 * Cursor very close to player.
 */
export const cursorVeryClose: TestSetup = {
  name: "cursor-very-close",
  description: "Cursor very close to player (1 pixel)",
  player: { x: 300, y: 300 },
  cursor: { x: 301, y: 300 },
  plannedSurfaces: [],
  allSurfaces: [],
  expected: {
    reachesCursor: true,
    isAligned: true,
  },
  tags: ["edge-case", "close"],
};

/**
 * Cursor very far from player.
 */
export const cursorVeryFar: TestSetup = {
  name: "cursor-very-far",
  description: "Cursor very far from player (10000 pixels)",
  player: { x: 100, y: 300 },
  cursor: { x: 10100, y: 300 },
  plannedSurfaces: [],
  allSurfaces: [],
  expected: {
    reachesCursor: true,
    isAligned: true,
  },
  tags: ["edge-case", "far"],
};

/**
 * Surface exactly at cursor position.
 */
export const surfaceAtCursor: TestSetup = {
  name: "surface-at-cursor",
  description: "Surface placed exactly at cursor position",
  player: { x: 100, y: 300 },
  cursor: { x: 300, y: 300 },
  plannedSurfaces: [],
  allSurfaces: [createVerticalSurface("surface1", 300, 200, 400)],
  expected: {
    // Cursor exactly at surface - may or may not reach
  },
  tags: ["edge-case", "at-cursor"],
};

/**
 * Surface exactly at player position.
 */
export const surfaceAtPlayer: TestSetup = {
  name: "surface-at-player",
  description: "Surface placed at player position",
  player: { x: 100, y: 300 },
  cursor: { x: 500, y: 300 },
  plannedSurfaces: [],
  allSurfaces: [createVerticalSurface("surface1", 100, 200, 400)],
  expected: {
    // Player at surface - behavior depends on implementation
  },
  tags: ["edge-case", "at-player"],
};

/**
 * Negative coordinates.
 */
export const negativeCoordinates: TestSetup = {
  name: "negative-coordinates",
  description: "Player and cursor in negative coordinate space",
  player: { x: -500, y: -300 },
  cursor: { x: -100, y: -300 },
  plannedSurfaces: [],
  allSurfaces: [],
  expected: {
    reachesCursor: true,
    isAligned: true,
  },
  tags: ["edge-case", "negative"],
};

/**
 * Very steep angle (nearly vertical).
 */
export const steepAngle: TestSetup = {
  name: "steep-angle",
  description: "Path at very steep angle",
  player: { x: 300, y: 100 },
  cursor: { x: 301, y: 500 },
  plannedSurfaces: [],
  allSurfaces: [],
  expected: {
    reachesCursor: true,
    isAligned: true,
  },
  tags: ["edge-case", "steep"],
};

/**
 * Very shallow angle (nearly horizontal).
 */
export const shallowAngle: TestSetup = {
  name: "shallow-angle",
  description: "Path at very shallow angle",
  player: { x: 100, y: 300 },
  cursor: { x: 500, y: 301 },
  plannedSurfaces: [],
  allSurfaces: [],
  expected: {
    reachesCursor: true,
    isAligned: true,
  },
  tags: ["edge-case", "shallow"],
};

/**
 * All edge case setups.
 */
export const edgeCaseSetups: readonly TestSetup[] = [
  cursorAtPlayer,
  cursorVeryClose,
  cursorVeryFar,
  surfaceAtCursor,
  surfaceAtPlayer,
  negativeCoordinates,
  steepAngle,
  shallowAngle,
];

