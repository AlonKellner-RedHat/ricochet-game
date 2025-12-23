/**
 * Generated (Parameterized) Test Setups
 *
 * Category 6: Auto-generated setups with variations
 *
 * Includes:
 * - Cursor position variations
 * - Surface angle variations
 * - Surface distance variations
 * - Wall position variations
 * - Reflection scenarios
 * - Random plans with reflective surfaces
 */

import { createAngledSurface, createVerticalSurface, createTestSurface } from "../MatrixTestRunner";
import type { TestSetup } from "../types";
import type { Surface } from "@/surfaces/Surface";

// Base player position for generated tests
const BASE_PLAYER = { x: 300, y: 300 };

// Seeded random for reproducible tests
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

// Room boundaries
const ROOM = {
  minX: 50,
  maxX: 1230,
  minY: 100,
  maxY: 680,
};

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
 * Generate random surfaces within the room.
 */
function generateRandomSurfaces(
  count: number,
  seed: number,
  reflectRatio: number = 0.5
): Surface[] {
  const random = seededRandom(seed);
  const surfaces: Surface[] = [];

  for (let i = 0; i < count; i++) {
    const canReflect = random() < reflectRatio;
    const centerX = ROOM.minX + random() * (ROOM.maxX - ROOM.minX);
    const centerY = ROOM.minY + random() * (ROOM.maxY - ROOM.minY);
    const angle = random() * Math.PI; // 0 to 180 degrees
    const length = 50 + random() * 150; // 50 to 200 pixels

    const halfLen = length / 2;
    const dx = Math.cos(angle) * halfLen;
    const dy = Math.sin(angle) * halfLen;

    surfaces.push(
      createTestSurface({
        id: `random-${seed}-${i}`,
        start: { x: centerX - dx, y: centerY - dy },
        end: { x: centerX + dx, y: centerY + dy },
        canReflect,
      })
    );
  }

  return surfaces;
}

/**
 * Select random surfaces from the list for a plan.
 */
function selectRandomPlan(
  surfaces: Surface[],
  maxCount: number,
  seed: number
): Surface[] {
  const random = seededRandom(seed);
  const reflective = surfaces.filter((s) => s.canReflect);

  if (reflective.length === 0) return [];

  // Random number of planned surfaces (0 to maxCount)
  const count = Math.floor(random() * (maxCount + 1));
  if (count === 0) return [];

  // Shuffle and pick first 'count' reflective surfaces
  const shuffled = [...reflective].sort(() => random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Generate setups with random surfaces and random plans.
 */
function generateRandomPlanSetups(): TestSetup[] {
  const setups: TestSetup[] = [];

  // Generate 10 random scenarios with varying complexity
  for (let i = 0; i < 10; i++) {
    const seed = 42 + i * 1000;
    const random = seededRandom(seed);

    // Random player position
    const playerX = ROOM.minX + 100 + random() * 200;
    const playerY = ROOM.minY + 100 + random() * (ROOM.maxY - ROOM.minY - 200);

    // Random cursor position (away from player)
    const cursorAngle = random() * Math.PI * 2;
    const cursorDist = 200 + random() * 400;
    const cursorX = Math.max(ROOM.minX + 20, Math.min(ROOM.maxX - 20, playerX + Math.cos(cursorAngle) * cursorDist));
    const cursorY = Math.max(ROOM.minY + 20, Math.min(ROOM.maxY - 20, playerY + Math.sin(cursorAngle) * cursorDist));

    // Generate random surfaces
    const surfaceCount = 3 + Math.floor(random() * 5); // 3 to 7 surfaces
    const surfaces = generateRandomSurfaces(surfaceCount, seed);

    // Select random plan (0 to 3 surfaces)
    const plannedSurfaces = selectRandomPlan(surfaces, 3, seed + 1);

    setups.push({
      name: `gen-random-plan-${i}`,
      description: `Generated: random scene with ${surfaces.length} surfaces and ${plannedSurfaces.length}-surface plan`,
      player: { x: playerX, y: playerY },
      cursor: { x: cursorX, y: cursorY },
      plannedSurfaces,
      allSurfaces: surfaces,
      expected: {},
      tags: ["generated", "random-plan", plannedSurfaces.length > 0 ? "has-plan" : "no-plan"],
    });
  }

  return setups;
}

/**
 * Generate setups with fixed surfaces but random plans.
 */
function generateVariablePlanSetups(): TestSetup[] {
  const setups: TestSetup[] = [];

  // Fixed room with multiple reflective surfaces
  const baseSurfaces = [
    createTestSurface({
      id: "ricochet-left",
      start: { x: 400, y: 150 },
      end: { x: 400, y: 350 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-right",
      start: { x: 800, y: 200 },
      end: { x: 800, y: 400 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-top",
      start: { x: 500, y: 150 },
      end: { x: 700, y: 150 },
      canReflect: true,
    }),
    createTestSurface({
      id: "wall-middle",
      start: { x: 550, y: 400 },
      end: { x: 650, y: 400 },
      canReflect: false,
    }),
  ];

  const reflectiveSurfaces = baseSurfaces.filter((s) => s.canReflect);

  // No plan
  setups.push({
    name: "gen-var-plan-none",
    description: "Generated: multi-surface room with no plan",
    player: { x: 200, y: 300 },
    cursor: { x: 1000, y: 300 },
    plannedSurfaces: [],
    allSurfaces: baseSurfaces,
    expected: {},
    tags: ["generated", "variable-plan", "no-plan"],
  });

  // Single surface plans
  for (let i = 0; i < reflectiveSurfaces.length; i++) {
    setups.push({
      name: `gen-var-plan-single-${i}`,
      description: `Generated: plan with ${reflectiveSurfaces[i]!.id}`,
      player: { x: 200, y: 300 },
      cursor: { x: 1000, y: 300 },
      plannedSurfaces: [reflectiveSurfaces[i]!],
      allSurfaces: baseSurfaces,
      expected: {},
      tags: ["generated", "variable-plan", "single-plan"],
    });
  }

  // Two surface plans
  for (let i = 0; i < reflectiveSurfaces.length; i++) {
    for (let j = i + 1; j < reflectiveSurfaces.length; j++) {
      setups.push({
        name: `gen-var-plan-double-${i}-${j}`,
        description: `Generated: plan with ${reflectiveSurfaces[i]!.id} and ${reflectiveSurfaces[j]!.id}`,
        player: { x: 200, y: 300 },
        cursor: { x: 1000, y: 300 },
        plannedSurfaces: [reflectiveSurfaces[i]!, reflectiveSurfaces[j]!],
        allSurfaces: baseSurfaces,
        expected: {},
        tags: ["generated", "variable-plan", "double-plan"],
      });
    }
  }

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
  ...generateRandomPlanSetups(),
  ...generateVariablePlanSetups(),
];

