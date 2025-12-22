/**
 * Obstacle/Wall Test Setups
 *
 * Category 3: Scenes with walls that block the path
 */

import { createHorizontalSurface, createVerticalSurface } from "../MatrixTestRunner";
import type { TestSetup } from "../types";

/**
 * Wall blocking the direct path to cursor.
 */
export const wallBlocking: TestSetup = {
  name: "wall-blocking",
  description: "Wall between player and cursor blocks the path",
  player: { x: 100, y: 300 },
  cursor: { x: 500, y: 300 },
  plannedSurfaces: [],
  allSurfaces: [createVerticalSurface("wall1", 300, 200, 400, false)],
  expected: {
    reachesCursor: false,
    blockedBy: "wall1",
    isAligned: false,
  },
  tags: ["wall", "blocking"],
};

/**
 * Wall after cursor (doesn't block reaching cursor).
 */
export const wallAfterCursor: TestSetup = {
  name: "wall-after-cursor",
  description: "Wall exists after cursor position",
  player: { x: 100, y: 300 },
  cursor: { x: 250, y: 300 },
  plannedSurfaces: [],
  allSurfaces: [createVerticalSurface("wall1", 400, 200, 400, false)],
  expected: {
    reachesCursor: true,
    isAligned: true,
  },
  tags: ["wall", "after-cursor"],
};

/**
 * Wall exists but not in the path.
 */
export const wallNotOnPath: TestSetup = {
  name: "wall-not-on-path",
  description: "Wall exists but is not in the arrow path",
  player: { x: 100, y: 300 },
  cursor: { x: 500, y: 300 },
  plannedSurfaces: [],
  allSurfaces: [createVerticalSurface("wall1", 300, 100, 200, false)], // Above the path
  expected: {
    reachesCursor: true,
    isAligned: true,
  },
  tags: ["wall", "not-blocking"],
};

/**
 * Horizontal wall blocking vertical path.
 */
export const horizontalWallBlocking: TestSetup = {
  name: "horizontal-wall-blocking",
  description: "Horizontal wall blocking vertical path",
  player: { x: 300, y: 100 },
  cursor: { x: 300, y: 500 },
  plannedSurfaces: [],
  allSurfaces: [createHorizontalSurface("wall1", 300, 200, 400, false)],
  expected: {
    reachesCursor: false,
    blockedBy: "wall1",
    isAligned: false,
  },
  tags: ["wall", "horizontal", "blocking"],
};

/**
 * Multiple walls, one blocking.
 */
export const multipleWallsOneBlocking: TestSetup = {
  name: "multiple-walls-one-blocking",
  description: "Multiple walls in scene, one blocks the path",
  player: { x: 100, y: 300 },
  cursor: { x: 500, y: 300 },
  plannedSurfaces: [],
  allSurfaces: [
    createVerticalSurface("wall1", 200, 100, 200, false), // Above path
    createVerticalSurface("wall2", 300, 200, 400, false), // Blocking
    createVerticalSurface("wall3", 400, 400, 500, false), // Below path
  ],
  expected: {
    reachesCursor: false,
    blockedBy: "wall2",
    isAligned: false,
  },
  tags: ["wall", "multiple"],
};

/**
 * All obstacle setups.
 */
export const obstacleSetups: readonly TestSetup[] = [
  wallBlocking,
  wallAfterCursor,
  wallNotOnPath,
  horizontalWallBlocking,
  multipleWallsOneBlocking,
];

