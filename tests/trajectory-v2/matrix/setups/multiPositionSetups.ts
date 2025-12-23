/**
 * Multi-Position Test Setups
 *
 * These are "base" setups with player and surfaces, but NO fixed cursor.
 * The cursor position will be generated at many grid positions during testing.
 *
 * Used to test V.5 Light-Divergence Correlation across the entire screen.
 */

import { createTestSurface } from "../MatrixTestRunner";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";

/**
 * Base setup for multi-position testing (no cursor - it's generated).
 */
export interface MultiPositionBaseSetup {
  /** Unique identifier for the setup */
  readonly name: string;

  /** Human-readable description */
  readonly description: string;

  /** Player/arrow starting position */
  readonly player: Vector2;

  /** Surfaces that are part of the aiming plan */
  readonly plannedSurfaces: readonly Surface[];

  /** All surfaces in the scene */
  readonly allSurfaces: readonly Surface[];

  /** Optional tags for filtering */
  readonly tags?: readonly string[];
}

/**
 * Standard room walls used in most setups.
 */
const STANDARD_ROOM_WALLS = [
  createTestSurface({
    id: "floor",
    start: { x: 0, y: 700 },
    end: { x: 1280, y: 700 },
    canReflect: false,
  }),
  createTestSurface({
    id: "ceiling",
    start: { x: 0, y: 80 },
    end: { x: 1280, y: 80 },
    canReflect: false,
  }),
  createTestSurface({
    id: "left-wall",
    start: { x: 20, y: 80 },
    end: { x: 20, y: 700 },
    canReflect: false,
  }),
  createTestSurface({
    id: "right-wall",
    start: { x: 1260, y: 80 },
    end: { x: 1260, y: 700 },
    canReflect: false,
  }),
];

/**
 * User-reported setup with 10 surfaces (from debug log).
 * This is the exact setup that showed V.5 violation.
 */
export const userReportedComplexRoom: MultiPositionBaseSetup = {
  name: "user-reported-complex-room",
  description: "Complex room with platforms and ricochet surfaces (user-reported)",
  player: { x: 475.1, y: 666 },
  plannedSurfaces: [],
  allSurfaces: [
    ...STANDARD_ROOM_WALLS,
    createTestSurface({
      id: "platform-1",
      start: { x: 300, y: 450 },
      end: { x: 500, y: 450 },
      canReflect: false,
    }),
    createTestSurface({
      id: "platform-2",
      start: { x: 550, y: 350 },
      end: { x: 750, y: 350 },
      canReflect: false,
    }),
    createTestSurface({
      id: "ricochet-1",
      start: { x: 800, y: 150 },
      end: { x: 900, y: 250 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-2",
      start: { x: 400, y: 250 },
      end: { x: 550, y: 250 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-3",
      start: { x: 100, y: 200 },
      end: { x: 200, y: 300 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-4",
      start: { x: 850, y: 350 },
      end: { x: 850, y: 500 },
      canReflect: true,
    }),
  ],
  tags: ["complex", "user-reported", "multi-surface"],
};

/**
 * Simple room with just walls - baseline for visibility testing.
 */
export const emptyRoom: MultiPositionBaseSetup = {
  name: "empty-room",
  description: "Empty room with just walls",
  player: { x: 640, y: 400 },
  plannedSurfaces: [],
  allSurfaces: STANDARD_ROOM_WALLS,
  tags: ["simple", "baseline"],
};

/**
 * Room with a single obstacle in the center.
 */
export const singleCentralObstacle: MultiPositionBaseSetup = {
  name: "single-central-obstacle",
  description: "Room with a single horizontal platform in the center",
  player: { x: 200, y: 600 },
  plannedSurfaces: [],
  allSurfaces: [
    ...STANDARD_ROOM_WALLS,
    createTestSurface({
      id: "central-platform",
      start: { x: 400, y: 350 },
      end: { x: 800, y: 350 },
      canReflect: false,
    }),
  ],
  tags: ["simple", "single-obstacle"],
};

/**
 * Room with multiple scattered obstacles.
 */
export const scatteredObstacles: MultiPositionBaseSetup = {
  name: "scattered-obstacles",
  description: "Room with multiple scattered obstacles creating complex shadows",
  player: { x: 640, y: 500 },
  plannedSurfaces: [],
  allSurfaces: [
    ...STANDARD_ROOM_WALLS,
    createTestSurface({
      id: "obstacle-1",
      start: { x: 200, y: 300 },
      end: { x: 350, y: 300 },
      canReflect: false,
    }),
    createTestSurface({
      id: "obstacle-2",
      start: { x: 500, y: 200 },
      end: { x: 700, y: 200 },
      canReflect: false,
    }),
    createTestSurface({
      id: "obstacle-3",
      start: { x: 900, y: 350 },
      end: { x: 1100, y: 350 },
      canReflect: false,
    }),
    createTestSurface({
      id: "obstacle-4",
      start: { x: 300, y: 450 },
      end: { x: 450, y: 450 },
      canReflect: false,
    }),
  ],
  tags: ["complex", "multiple-obstacles"],
};

/**
 * Room with a single reflective surface in the plan.
 */
export const singlePlannedSurface: MultiPositionBaseSetup = {
  name: "single-planned-surface",
  description: "Room with one reflective surface in the plan",
  player: { x: 200, y: 500 },
  plannedSurfaces: [
    createTestSurface({
      id: "ricochet-planned",
      start: { x: 600, y: 250 },
      end: { x: 600, y: 450 },
      canReflect: true,
    }),
  ],
  allSurfaces: [
    ...STANDARD_ROOM_WALLS,
    createTestSurface({
      id: "ricochet-planned",
      start: { x: 600, y: 250 },
      end: { x: 600, y: 450 },
      canReflect: true,
    }),
  ],
  tags: ["planned", "single-surface", "skip-1.16", "skip-2.5"],
};

/**
 * Room with two reflective surfaces in the plan.
 */
export const twoPlannedSurfaces: MultiPositionBaseSetup = {
  name: "two-planned-surfaces",
  description: "Room with two reflective surfaces in the plan",
  player: { x: 200, y: 500 },
  plannedSurfaces: [
    createTestSurface({
      id: "ricochet-1",
      start: { x: 500, y: 300 },
      end: { x: 500, y: 500 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-2",
      start: { x: 900, y: 200 },
      end: { x: 1000, y: 300 },
      canReflect: true,
    }),
  ],
  allSurfaces: [
    ...STANDARD_ROOM_WALLS,
    createTestSurface({
      id: "ricochet-1",
      start: { x: 500, y: 300 },
      end: { x: 500, y: 500 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-2",
      start: { x: 900, y: 200 },
      end: { x: 1000, y: 300 },
      canReflect: true,
    }),
  ],
  tags: ["planned", "two-surfaces"],
};

/**
 * Player in corner with diagonal surfaces.
 */
export const cornerWithDiagonals: MultiPositionBaseSetup = {
  name: "corner-with-diagonals",
  description: "Player in bottom-left corner with diagonal surfaces",
  player: { x: 100, y: 600 },
  plannedSurfaces: [],
  allSurfaces: [
    ...STANDARD_ROOM_WALLS,
    createTestSurface({
      id: "diagonal-1",
      start: { x: 300, y: 200 },
      end: { x: 500, y: 400 },
      canReflect: true,
    }),
    createTestSurface({
      id: "diagonal-2",
      start: { x: 700, y: 150 },
      end: { x: 900, y: 350 },
      canReflect: true,
    }),
  ],
  tags: ["corner", "diagonal"],
};

/**
 * User reported: pixel-perfect light/shade swapping between adjacent triangles (case 1)
 *
 * No planned surfaces, 360° cone, 21 outline vertices.
 * Strange pixel perfect positioning that swaps the light/shade between adjacent triangles.
 */
export const pixelPerfectLightSwap1: MultiPositionBaseSetup = {
  name: "pixel-perfect-light-swap-1",
  description: "User reported: light/shade swaps between adjacent triangles (case 1)",
  player: { x: 390.8704618999992, y: 666 },
  plannedSurfaces: [],
  allSurfaces: [
    createTestSurface({
      id: "floor",
      start: { x: 0, y: 700 },
      end: { x: 1280, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "ceiling",
      start: { x: 0, y: 80 },
      end: { x: 1280, y: 80 },
      canReflect: false,
    }),
    createTestSurface({
      id: "left-wall",
      start: { x: 20, y: 80 },
      end: { x: 20, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "right-wall",
      start: { x: 1260, y: 80 },
      end: { x: 1260, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "platform-1",
      start: { x: 300, y: 450 },
      end: { x: 500, y: 450 },
      canReflect: false,
    }),
    createTestSurface({
      id: "platform-2",
      start: { x: 550, y: 350 },
      end: { x: 750, y: 350 },
      canReflect: false,
    }),
    createTestSurface({
      id: "ricochet-1",
      start: { x: 800, y: 150 },
      end: { x: 900, y: 250 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-2",
      start: { x: 400, y: 250 },
      end: { x: 550, y: 250 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-3",
      start: { x: 100, y: 200 },
      end: { x: 200, y: 300 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-4",
      start: { x: 850, y: 350 },
      end: { x: 850, y: 500 },
      canReflect: true,
    }),
  ],
  // V.5 violations found at some cursor positions - visibility/trajectory edge case
  // V.5 violations found at some cursor positions - visibility/trajectory edge case
  tags: ["user-reported", "visibility-bug", "pixel-perfect", "skip-V.5"],
};

/**
 * User reported: pixel-perfect light/shade swapping between adjacent triangles (case 2)
 *
 * No planned surfaces, 360° cone, 17 outline vertices.
 * Strange pixel perfect positioning that swaps the light/shade between adjacent triangles.
 */
export const pixelPerfectLightSwap2: MultiPositionBaseSetup = {
  name: "pixel-perfect-light-swap-2",
  description: "User reported: light/shade swaps between adjacent triangles (case 2)",
  player: { x: 607.7048269999999, y: 666 },
  plannedSurfaces: [],
  allSurfaces: [
    createTestSurface({
      id: "floor",
      start: { x: 0, y: 700 },
      end: { x: 1280, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "ceiling",
      start: { x: 0, y: 80 },
      end: { x: 1280, y: 80 },
      canReflect: false,
    }),
    createTestSurface({
      id: "left-wall",
      start: { x: 20, y: 80 },
      end: { x: 20, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "right-wall",
      start: { x: 1260, y: 80 },
      end: { x: 1260, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "platform-1",
      start: { x: 300, y: 450 },
      end: { x: 500, y: 450 },
      canReflect: false,
    }),
    createTestSurface({
      id: "platform-2",
      start: { x: 550, y: 350 },
      end: { x: 750, y: 350 },
      canReflect: false,
    }),
    createTestSurface({
      id: "ricochet-1",
      start: { x: 800, y: 150 },
      end: { x: 900, y: 250 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-2",
      start: { x: 400, y: 250 },
      end: { x: 550, y: 250 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-3",
      start: { x: 100, y: 200 },
      end: { x: 200, y: 300 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-4",
      start: { x: 850, y: 350 },
      end: { x: 850, y: 500 },
      canReflect: true,
    }),
  ],
  // V.5 violations found at some cursor positions - visibility/trajectory edge case
  tags: ["user-reported", "visibility-bug", "pixel-perfect", "skip-V.5"],
};

/**
 * User reported: planned surface strange visualization
 *
 * Has planned surface (ricochet-4), narrow 17.9° cone, 12 outline vertices.
 * Visualization issue with planned surfaces.
 */
export const plannedSurfaceVisualizationBug: MultiPositionBaseSetup = {
  name: "planned-surface-visualization-bug",
  description: "User reported: strange visualization with planned surface",
  player: { x: 443.2485515999997, y: 608.494213119999 },
  plannedSurfaces: [
    createTestSurface({
      id: "ricochet-4",
      start: { x: 850, y: 350 },
      end: { x: 850, y: 500 },
      canReflect: true,
    }),
  ],
  allSurfaces: [
    createTestSurface({
      id: "floor",
      start: { x: 0, y: 700 },
      end: { x: 1280, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "ceiling",
      start: { x: 0, y: 80 },
      end: { x: 1280, y: 80 },
      canReflect: false,
    }),
    createTestSurface({
      id: "left-wall",
      start: { x: 20, y: 80 },
      end: { x: 20, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "right-wall",
      start: { x: 1260, y: 80 },
      end: { x: 1260, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "platform-1",
      start: { x: 300, y: 450 },
      end: { x: 500, y: 450 },
      canReflect: false,
    }),
    createTestSurface({
      id: "platform-2",
      start: { x: 550, y: 350 },
      end: { x: 750, y: 350 },
      canReflect: false,
    }),
    createTestSurface({
      id: "ricochet-1",
      start: { x: 800, y: 150 },
      end: { x: 900, y: 250 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-2",
      start: { x: 400, y: 250 },
      end: { x: 550, y: 250 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-3",
      start: { x: 100, y: 200 },
      end: { x: 200, y: 300 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-4",
      start: { x: 850, y: 350 },
      end: { x: 850, y: 500 },
      canReflect: true,
    }),
  ],
  // Many violations found: 1.16 (106), 1.5 (1), 2.5 (40) - needs investigation
  tags: ["user-reported", "visibility-bug", "planned-surface", "skip-1.5", "skip-1.16", "skip-2.5"],
};

/**
 * All multi-position base setups.
 */
export const MULTI_POSITION_SETUPS: readonly MultiPositionBaseSetup[] = [
  userReportedComplexRoom,
  emptyRoom,
  singleCentralObstacle,
  scatteredObstacles,
  singlePlannedSurface,
  twoPlannedSurfaces,
  cornerWithDiagonals,
  pixelPerfectLightSwap1,
  pixelPerfectLightSwap2,
  plannedSurfaceVisualizationBug,
];

