/**
 * Generated (Parameterized) Test Setups
 *
 * Category 6: Auto-generated setups with variations
 */

import { createAngledSurface, createVerticalSurface } from "../MatrixTestRunner";
import type { TestSetup } from "../types";

// Base player position for generated tests
const BASE_PLAYER = { x: 300, y: 300 };

/**
 * Generate cursor position setups (grid of 9 positions).
 */
function generateCursorPositions(): TestSetup[] {
  const setups: TestSetup[] = [];
  const offsets = [-200, 0, 200];

  for (const dx of offsets) {
    for (const dy of offsets) {
      // Skip center (same as player)
      if (dx === 0 && dy === 0) continue;

      setups.push({
        name: `gen-cursor-${dx >= 0 ? "+" : ""}${dx}-${dy >= 0 ? "+" : ""}${dy}`,
        description: `Generated: cursor at offset (${dx}, ${dy}) from player`,
        player: BASE_PLAYER,
        cursor: { x: BASE_PLAYER.x + dx, y: BASE_PLAYER.y + dy },
        plannedSurfaces: [],
        allSurfaces: [],
        expected: {
          reachesCursor: true,
          isAligned: true,
        },
        tags: ["generated", "cursor-position"],
      });
    }
  }

  return setups;
}

/**
 * Generate surface angle setups (0 to 90 degrees in 15-degree increments).
 */
function generateSurfaceAngles(): TestSetup[] {
  const setups: TestSetup[] = [];
  const angles = [0, 15, 30, 45, 60, 75, 90];

  for (const angle of angles) {
    setups.push({
      name: `gen-surface-angle-${angle}`,
      description: `Generated: surface at ${angle} degrees`,
      player: { x: 100, y: 300 },
      cursor: { x: 500, y: 300 },
      plannedSurfaces: [],
      allSurfaces: [createAngledSurface("surface1", { x: 300, y: 300 }, 200, angle)],
      expected: {
        // Depends on angle
      },
      tags: ["generated", "surface-angle"],
    });
  }

  return setups;
}

/**
 * Generate surface distance setups (various distances from player).
 */
function generateSurfaceDistances(): TestSetup[] {
  const setups: TestSetup[] = [];
  const distances = [50, 100, 200, 400, 800];

  for (const dist of distances) {
    setups.push({
      name: `gen-surface-distance-${dist}`,
      description: `Generated: surface ${dist}px from player`,
      player: { x: 100, y: 300 },
      cursor: { x: 100 + dist + 100, y: 300 }, // Cursor past surface
      plannedSurfaces: [],
      allSurfaces: [createVerticalSurface("surface1", 100 + dist, 200, 400)],
      expected: {
        reachesCursor: false, // Surface blocks
      },
      tags: ["generated", "surface-distance"],
    });
  }

  return setups;
}

/**
 * Generate cursor distance setups (various distances from player).
 */
function generateCursorDistances(): TestSetup[] {
  const setups: TestSetup[] = [];
  const distances = [10, 50, 100, 200, 500, 1000];

  for (const dist of distances) {
    setups.push({
      name: `gen-cursor-distance-${dist}`,
      description: `Generated: cursor ${dist}px from player`,
      player: { x: 100, y: 300 },
      cursor: { x: 100 + dist, y: 300 },
      plannedSurfaces: [],
      allSurfaces: [],
      expected: {
        reachesCursor: true,
        isAligned: true,
      },
      tags: ["generated", "cursor-distance"],
    });
  }

  return setups;
}

/**
 * Generate wall positions relative to cursor.
 */
function generateWallPositions(): TestSetup[] {
  const setups: TestSetup[] = [];
  const cursorX = 300;

  // Wall before cursor (blocking)
  setups.push({
    name: "gen-wall-before-cursor",
    description: "Generated: wall between player and cursor",
    player: { x: 100, y: 300 },
    cursor: { x: cursorX, y: 300 },
    plannedSurfaces: [],
    allSurfaces: [createVerticalSurface("wall1", 200, 200, 400, false)],
    expected: {
      reachesCursor: false,
      blockedBy: "wall1",
      isAligned: false,
    },
    tags: ["generated", "wall-position"],
  });

  // Wall at cursor
  setups.push({
    name: "gen-wall-at-cursor",
    description: "Generated: wall exactly at cursor",
    player: { x: 100, y: 300 },
    cursor: { x: cursorX, y: 300 },
    plannedSurfaces: [],
    allSurfaces: [createVerticalSurface("wall1", cursorX, 200, 400, false)],
    expected: {
      // Edge case
    },
    tags: ["generated", "wall-position", "edge-case"],
  });

  // Wall after cursor
  setups.push({
    name: "gen-wall-after-cursor",
    description: "Generated: wall after cursor",
    player: { x: 100, y: 300 },
    cursor: { x: cursorX, y: 300 },
    plannedSurfaces: [],
    allSurfaces: [createVerticalSurface("wall1", 400, 200, 400, false)],
    expected: {
      reachesCursor: true,
      isAligned: true,
    },
    tags: ["generated", "wall-position"],
  });

  return setups;
}

/**
 * Generate reflection scenarios with surface before cursor.
 */
function generateReflectionBeforeCursor(): TestSetup[] {
  const setups: TestSetup[] = [];

  // Surface right before cursor, cursor between player and surface
  setups.push({
    name: "gen-ricochet-cursor-before",
    description: "Generated: ricochet surface after cursor",
    player: { x: 100, y: 300 },
    cursor: { x: 200, y: 300 },
    plannedSurfaces: [],
    allSurfaces: [createVerticalSurface("ricochet1", 400, 200, 400)],
    expected: {
      reachesCursor: true,
      isAligned: true,
    },
    tags: ["generated", "reflection"],
  });

  // Surface between player and cursor
  setups.push({
    name: "gen-ricochet-between",
    description: "Generated: ricochet surface between player and cursor",
    player: { x: 100, y: 300 },
    cursor: { x: 500, y: 300 },
    plannedSurfaces: [],
    allSurfaces: [createVerticalSurface("ricochet1", 300, 200, 400)],
    expected: {
      reachesCursor: false,
    },
    tags: ["generated", "reflection"],
  });

  return setups;
}

/**
 * All generated setups.
 */
export const generatedSetups: readonly TestSetup[] = [
  ...generateCursorPositions(),
  ...generateSurfaceAngles(),
  ...generateSurfaceDistances(),
  ...generateCursorDistances(),
  ...generateWallPositions(),
  ...generateReflectionBeforeCursor(),
];

