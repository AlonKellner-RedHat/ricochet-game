/**
 * Empty Scene Test Setups
 *
 * Category 1: Minimal scenes with no surfaces
 */

import type { TestSetup } from "../types";

/**
 * Empty scene with cursor directly ahead.
 */
export const emptySceneAhead: TestSetup = {
  name: "empty-scene-ahead",
  description: "No surfaces, cursor directly ahead of player",
  player: { x: 100, y: 300 },
  cursor: { x: 500, y: 300 },
  plannedSurfaces: [],
  allSurfaces: [],
  expected: {
    reachesCursor: true,
    isAligned: true,
  },
  tags: ["empty", "simple"],
};

/**
 * Empty scene with cursor behind player.
 */
export const emptySceneBehind: TestSetup = {
  name: "empty-scene-behind",
  description: "No surfaces, cursor behind player",
  player: { x: 500, y: 300 },
  cursor: { x: 100, y: 300 },
  plannedSurfaces: [],
  allSurfaces: [],
  expected: {
    reachesCursor: true,
    isAligned: true,
  },
  tags: ["empty", "simple"],
};

/**
 * Empty scene with cursor at diagonal angle.
 */
export const emptySceneDiagonal: TestSetup = {
  name: "empty-scene-diagonal",
  description: "No surfaces, cursor at 45-degree angle",
  player: { x: 100, y: 100 },
  cursor: { x: 400, y: 400 },
  plannedSurfaces: [],
  allSurfaces: [],
  expected: {
    reachesCursor: true,
    isAligned: true,
  },
  tags: ["empty", "diagonal"],
};

/**
 * Empty scene with cursor above player.
 */
export const emptySceneAbove: TestSetup = {
  name: "empty-scene-above",
  description: "No surfaces, cursor directly above player",
  player: { x: 300, y: 400 },
  cursor: { x: 300, y: 100 },
  plannedSurfaces: [],
  allSurfaces: [],
  expected: {
    reachesCursor: true,
    isAligned: true,
  },
  tags: ["empty", "vertical"],
};

/**
 * All empty scene setups.
 */
export const emptySceneSetups: readonly TestSetup[] = [
  emptySceneAhead,
  emptySceneBehind,
  emptySceneDiagonal,
  emptySceneAbove,
];

