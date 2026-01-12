/**
 * Debug Scene Configurations
 *
 * Configurable scene definitions for the Invariant Debug Renderer.
 * Supports URL parameter parsing for easy scene switching.
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import {
  type SurfaceChain,
  createRicochetChain,
  createWallChain,
  createMixedChain,
} from "@/trajectory-v2/geometry/SurfaceChain";

/**
 * Screen bounds for the debug renderer.
 */
export const SCREEN_BOUNDS = {
  width: 1280,
  height: 720,
  minX: 0,
  minY: 0,
  maxX: 1280,
  maxY: 720,
};

/**
 * A debug scene configuration.
 */
export interface DebugScene {
  /** Unique identifier for URL parameters */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Description of what this scene tests */
  readonly description: string;

  /** Default player position for this scene */
  readonly defaultPlayerPosition: Vector2;

  /** Surface chains in the scene (NOT including screen boundaries) */
  readonly chains: SurfaceChain[];
}

/**
 * Wall-with-gap scene - the primary investigation scene.
 *
 * Player at (581, 81) looking toward surfaces below.
 * Target surface at y=200, wall with gap at y=400.
 *
 * This scene exhibits the "outward spike" bug where continuation rays
 * extend to screen boundaries without return vertices.
 */
const WALL_WITH_GAP: DebugScene = {
  id: "wall-with-gap",
  name: "Wall with Gap",
  description: "Surface with wall obstacle that has a gap - exhibits continuation spike bug",
  defaultPlayerPosition: { x: 581, y: 81 },
  chains: [
    createRicochetChain("target", [
      { x: 500, y: 200 },
      { x: 700, y: 200 },
    ]),
    createWallChain("wall-left", [
      { x: 300, y: 400 },
      { x: 550, y: 400 },
    ]),
    createWallChain("wall-right", [
      { x: 650, y: 400 },
      { x: 900, y: 400 },
    ]),
  ],
};

/**
 * Near-parallel scene - numerical stability test.
 */
const NEAR_PARALLEL: DebugScene = {
  id: "near-parallel",
  name: "Near Parallel",
  description: "Two almost parallel surfaces (2px apart)",
  defaultPlayerPosition: { x: 668.19, y: 573.89 },
  chains: [
    createRicochetChain("p1", [
      { x: 400, y: 300 },
      { x: 600, y: 300 },
    ]),
    createRicochetChain("p2", [
      { x: 400, y: 302 },
      { x: 600, y: 302 },
    ]),
  ],
};

/**
 * V-shape 120 degrees - chain junction test.
 */
const V_SHAPE_120: DebugScene = {
  id: "v-shape-120",
  name: "V-Shape 120°",
  description: "Two surfaces meeting at 120 degrees with junction",
  defaultPlayerPosition: { x: 640, y: 500 },
  chains: [
    createRicochetChain("v120", [
      { x: 598.0384757729337, y: 280 },
      { x: 650, y: 250 },
      { x: 701.9615242270663, y: 280 },
    ]),
  ],
};

/**
 * Parallel mirrors scene.
 */
const PARALLEL_MIRRORS: DebugScene = {
  id: "parallel-mirrors",
  name: "Parallel Mirrors",
  description: "Two vertical surfaces facing each other",
  defaultPlayerPosition: { x: 450, y: 350 },
  chains: [
    createRicochetChain("mirror-left", [
      { x: 300, y: 500 },
      { x: 300, y: 200 },
    ]),
    createRicochetChain("mirror-right", [
      { x: 600, y: 200 },
      { x: 600, y: 500 },
    ]),
  ],
};

/**
 * Full demo scene with all surfaces.
 */
const FULL_DEMO: DebugScene = {
  id: "full-demo",
  name: "Full Demo",
  description: "Complete demo scene with all surfaces",
  defaultPlayerPosition: { x: 640, y: 600 },
  chains: createFullDemoChains(),
};

/**
 * Create all chains from the full demo scene.
 */
function createFullDemoChains(): SurfaceChain[] {
  const chains: SurfaceChain[] = [];

  // Room boundary: single closed chain with mixed reflectivity
  chains.push(
    createMixedChain(
      "room",
      [
        { x: 20, y: 80 },
        { x: 1260, y: 80 },
        { x: 1260, y: 700 },
        { x: 20, y: 700 },
      ],
      [true, false, false, true],
      true
    )
  );

  // Parallel mirrors
  chains.push(
    createRicochetChain("mirror-left", [
      { x: 250, y: 550 },
      { x: 250, y: 150 },
    ])
  );
  chains.push(
    createRicochetChain("mirror-right", [
      { x: 550, y: 150 },
      { x: 550, y: 550 },
    ])
  );

  // Pyramid
  const pyramidCenterX = 1050;
  const pyramidBaseY = 500;
  const pyramidSpacing = 40;

  chains.push(
    createRicochetChain("pyramid-1", [
      { x: pyramidCenterX - 20, y: pyramidBaseY },
      { x: pyramidCenterX + 20, y: pyramidBaseY },
    ])
  );
  chains.push(
    createRicochetChain("pyramid-2", [
      { x: pyramidCenterX - 35, y: pyramidBaseY - pyramidSpacing },
      { x: pyramidCenterX + 35, y: pyramidBaseY - pyramidSpacing },
    ])
  );
  chains.push(
    createRicochetChain("pyramid-3", [
      { x: pyramidCenterX - 50, y: pyramidBaseY - pyramidSpacing * 2 },
      { x: pyramidCenterX + 50, y: pyramidBaseY - pyramidSpacing * 2 },
    ])
  );
  chains.push(
    createRicochetChain("pyramid-4", [
      { x: pyramidCenterX - 65, y: pyramidBaseY - pyramidSpacing * 3 },
      { x: pyramidCenterX + 65, y: pyramidBaseY - pyramidSpacing * 3 },
    ])
  );

  // V-shape chains
  chains.push(
    createRicochetChain("chain1", [
      { x: 598.0384757729337, y: 280 },
      { x: 650, y: 250 },
      { x: 701.9615242270663, y: 280 },
    ])
  );
  chains.push(
    createRicochetChain("chain2", [
      { x: 707.5735931288071, y: 292.42640687119285 },
      { x: 750, y: 250 },
      { x: 792.4264068711929, y: 292.42640687119285 },
    ])
  );
  chains.push(
    createRicochetChain("chain3", [
      { x: 820, y: 301.9615242270663 },
      { x: 850, y: 250 },
      { x: 880, y: 301.9615242270663 },
    ])
  );

  return chains;
}

/**
 * Empty scene - just screen boundaries.
 */
const EMPTY: DebugScene = {
  id: "empty",
  name: "Empty",
  description: "No surfaces - baseline test",
  defaultPlayerPosition: { x: 640, y: 360 },
  chains: [],
};

/**
 * All available debug scenes.
 */
export const DEBUG_SCENES: DebugScene[] = [
  WALL_WITH_GAP,
  NEAR_PARALLEL,
  V_SHAPE_120,
  PARALLEL_MIRRORS,
  FULL_DEMO,
  EMPTY,
];

/**
 * Get scene by ID.
 */
export function getSceneById(id: string): DebugScene | undefined {
  return DEBUG_SCENES.find((scene) => scene.id === id);
}

/**
 * Parse URL parameters for debug configuration.
 *
 * Supported parameters:
 * - scene: Scene ID (default: "wall-with-gap")
 * - x: Player X position (default: scene default)
 * - y: Player Y position (default: scene default)
 *
 * Example: ?debug=invariant&scene=wall-with-gap&x=581&y=81
 */
export function parseDebugParams(): {
  scene: DebugScene;
  playerPosition: Vector2;
} {
  const params = new URLSearchParams(window.location.search);

  // Get scene
  const sceneId = params.get("scene") ?? "wall-with-gap";
  const scene = getSceneById(sceneId) ?? WALL_WITH_GAP;

  // Get player position (override from URL or use scene default)
  const x = params.get("x") ? parseFloat(params.get("x")!) : scene.defaultPlayerPosition.x;
  const y = params.get("y") ? parseFloat(params.get("y")!) : scene.defaultPlayerPosition.y;

  return {
    scene,
    playerPosition: { x, y },
  };
}
