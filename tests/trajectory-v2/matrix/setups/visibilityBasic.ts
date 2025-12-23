/**
 * Visibility Test Setups
 *
 * Test setups specifically for visibility/shadow first principles.
 * These focus on the valid cursor region calculations.
 */

import {
  createVerticalSurface,
  createHorizontalSurface,
  createWall,
} from "../MatrixTestRunner";
import type { TestSetup } from "../types";

/**
 * Player with single wall to the right (shadow trapezoid).
 */
export const singleWallShadow: TestSetup = {
  name: "single-wall-shadow",
  description: "Single wall creates shadow trapezoid behind it",
  player: { x: 200, y: 300 },
  cursor: { x: 600, y: 300 }, // In shadow
  plannedSurfaces: [],
  allSurfaces: [createWall("wall1", { x: 400, y: 200 }, { x: 400, y: 400 })],
  expected: {
    reachesCursor: false, // Cursor is blocked by wall
  },
  tags: ["visibility", "shadow", "single-wall"],
};

/**
 * Player with wall above (horizontal shadow).
 */
export const horizontalWallShadow: TestSetup = {
  name: "horizontal-wall-shadow",
  description: "Horizontal wall creates shadow below it",
  player: { x: 400, y: 200 },
  cursor: { x: 400, y: 500 }, // Below wall
  plannedSurfaces: [],
  allSurfaces: [createWall("wall1", { x: 300, y: 350 }, { x: 500, y: 350 })],
  expected: {
    reachesCursor: false,
  },
  tags: ["visibility", "shadow", "horizontal-wall"],
};

/**
 * Player surrounded by walls on 3 sides (only one opening).
 */
export const threeSidedRoom: TestSetup = {
  name: "three-sided-room",
  description: "Player in room with one opening",
  player: { x: 400, y: 300 },
  cursor: { x: 700, y: 300 }, // Through the opening
  plannedSurfaces: [],
  allSurfaces: [
    createWall("left", { x: 200, y: 100 }, { x: 200, y: 500 }),
    createWall("top", { x: 200, y: 100 }, { x: 600, y: 100 }),
    createWall("bottom", { x: 200, y: 500 }, { x: 600, y: 500 }),
  ],
  expected: {
    reachesCursor: true, // Clear path through opening
  },
  tags: ["visibility", "enclosed", "room"],
};

/**
 * Player with multiple walls creating multiple shadows.
 */
export const multipleWallsShadows: TestSetup = {
  name: "multiple-walls-shadows",
  description: "Multiple walls create multiple shadow regions",
  player: { x: 400, y: 300 },
  cursor: { x: 100, y: 300 }, // Behind left wall
  plannedSurfaces: [],
  allSurfaces: [
    createWall("left", { x: 200, y: 200 }, { x: 200, y: 400 }),
    createWall("right", { x: 600, y: 200 }, { x: 600, y: 400 }),
  ],
  expected: {
    reachesCursor: false, // Blocked by left wall
  },
  tags: ["visibility", "shadow", "multiple-walls"],
};

/**
 * Player with planned surface - light through window.
 */
export const singleWindowLight: TestSetup = {
  name: "single-window-light",
  description: "Single planned surface acts as window for light",
  player: { x: 200, y: 300 },
  cursor: { x: 600, y: 300 }, // On reflective side of surface
  plannedSurfaces: [createVerticalSurface("window1", 400, 200, 400)],
  allSurfaces: [createVerticalSurface("window1", 400, 200, 400)],
  expected: {
    // With planned surface, light only exits on reflective side
  },
  tags: ["visibility", "planned", "window"],
};

/**
 * Diagonal wall creates angled shadow.
 */
export const diagonalWallShadow: TestSetup = {
  name: "diagonal-wall-shadow",
  description: "Diagonal wall creates angled shadow",
  player: { x: 100, y: 300 },
  cursor: { x: 500, y: 350 }, // Behind diagonal wall
  plannedSurfaces: [],
  allSurfaces: [createWall("diagonal", { x: 300, y: 200 }, { x: 400, y: 400 })],
  expected: {
    reachesCursor: false,
  },
  tags: ["visibility", "shadow", "diagonal"],
};

/**
 * Small wall creates narrow shadow.
 */
export const smallWallNarrowShadow: TestSetup = {
  name: "small-wall-narrow-shadow",
  description: "Small wall creates narrow shadow cone",
  player: { x: 200, y: 300 },
  cursor: { x: 600, y: 300 }, // In narrow shadow
  plannedSurfaces: [],
  allSurfaces: [createWall("small", { x: 400, y: 280 }, { x: 400, y: 320 })],
  expected: {
    reachesCursor: false,
  },
  tags: ["visibility", "shadow", "narrow"],
};

/**
 * Empty scene (no surfaces) - full visibility.
 */
export const emptySceneFullVisibility: TestSetup = {
  name: "empty-scene-visibility",
  description: "No surfaces means full visibility",
  player: { x: 400, y: 300 },
  cursor: { x: 700, y: 500 },
  plannedSurfaces: [],
  allSurfaces: [],
  expected: {
    reachesCursor: true,
  },
  tags: ["visibility", "empty", "full-visibility"],
};

/**
 * Player next to wall - most directions lit.
 */
export const playerNextToWall: TestSetup = {
  name: "player-next-to-wall",
  description: "Player standing next to wall",
  player: { x: 150, y: 300 },
  cursor: { x: 500, y: 300 },
  plannedSurfaces: [],
  allSurfaces: [createWall("nearby", { x: 100, y: 200 }, { x: 100, y: 400 })],
  expected: {
    reachesCursor: true,
  },
  tags: ["visibility", "nearby-wall"],
};

/**
 * All visibility test setups.
 */
export const visibilitySetups: TestSetup[] = [
  singleWallShadow,
  horizontalWallShadow,
  threeSidedRoom,
  multipleWallsShadows,
  singleWindowLight,
  diagonalWallShadow,
  smallWallNarrowShadow,
  emptySceneFullVisibility,
  playerNextToWall,
];

