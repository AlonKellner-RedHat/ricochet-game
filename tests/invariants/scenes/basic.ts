/**
 * Basic Scenes for Invariant Tests
 *
 * Simple scenes with 0-2 surfaces.
 */

import { RicochetSurface } from "@/surfaces/RicochetSurface";
import {
  type SurfaceChain,
  createRicochetChain,
  createWallChain,
} from "@/trajectory-v2/geometry/SurfaceChain";
import type { Scene, PlannedSequence } from "../types";
import { SCREEN } from "../positions";

/**
 * Create a horizontal reflective chain.
 */
function horizontalChain(
  id: string,
  centerX: number,
  y: number,
  width: number,
  facingDown: boolean
): SurfaceChain {
  const halfWidth = width / 2;
  // Normal points left when going from start to end
  // For facing down: go left-to-right, normal points down
  // For facing up: go right-to-left, normal points up
  const start = facingDown
    ? { x: centerX - halfWidth, y }
    : { x: centerX + halfWidth, y };
  const end = facingDown
    ? { x: centerX + halfWidth, y }
    : { x: centerX - halfWidth, y };
  return createRicochetChain(id, [start, end]);
}

/**
 * Create a vertical reflective chain.
 */
function verticalChain(
  id: string,
  x: number,
  centerY: number,
  height: number,
  facingRight: boolean
): SurfaceChain {
  const halfHeight = height / 2;
  // For facing right: go bottom-to-top
  // For facing left: go top-to-bottom
  const start = facingRight
    ? { x, y: centerY + halfHeight }
    : { x, y: centerY - halfHeight };
  const end = facingRight
    ? { x, y: centerY - halfHeight }
    : { x, y: centerY + halfHeight };
  return createRicochetChain(id, [start, end]);
}

/**
 * Create a diagonal reflective chain.
 */
function diagonalChain(
  id: string,
  centerX: number,
  centerY: number,
  length: number,
  angle: number // degrees from horizontal
): SurfaceChain {
  const rad = (angle * Math.PI) / 180;
  const dx = (Math.cos(rad) * length) / 2;
  const dy = (Math.sin(rad) * length) / 2;
  return createRicochetChain(id, [
    { x: centerX - dx, y: centerY - dy },
    { x: centerX + dx, y: centerY + dy },
  ]);
}

/**
 * Helper to create a RicochetSurface for plannedSurfaces (needs actual Surface objects).
 */
function horizontalSurface(
  id: string,
  centerX: number,
  y: number,
  width: number,
  facingDown: boolean
): RicochetSurface {
  const halfWidth = width / 2;
  return new RicochetSurface(id, {
    start: facingDown ? { x: centerX - halfWidth, y } : { x: centerX + halfWidth, y },
    end: facingDown ? { x: centerX + halfWidth, y } : { x: centerX - halfWidth, y },
  });
}

function verticalSurface(
  id: string,
  x: number,
  centerY: number,
  height: number,
  facingRight: boolean
): RicochetSurface {
  const halfHeight = height / 2;
  return new RicochetSurface(id, {
    start: facingRight ? { x, y: centerY + halfHeight } : { x, y: centerY - halfHeight },
    end: facingRight ? { x, y: centerY - halfHeight } : { x, y: centerY + halfHeight },
  });
}

function diagonalSurface(
  id: string,
  centerX: number,
  centerY: number,
  length: number,
  angle: number
): RicochetSurface {
  const rad = (angle * Math.PI) / 180;
  const dx = (Math.cos(rad) * length) / 2;
  const dy = (Math.sin(rad) * length) / 2;
  return new RicochetSurface(id, {
    start: { x: centerX - dx, y: centerY - dy },
    end: { x: centerX + dx, y: centerY + dy },
  });
}

/** Empty sequence baseline */
const EMPTY_SEQUENCE: PlannedSequence = { name: "empty", surfaces: [] };

/**
 * Basic scenes: empty, single surfaces.
 */
export const BASIC_SCENES: Scene[] = [
  // Scene 1: Empty - no surfaces
  {
    name: "empty",
    description: "No surfaces - baseline test",
    allChains: [],
    plannedSurfaces: [],
    plannedSequences: [EMPTY_SEQUENCE],
  },

  // Scene 2: Single horizontal surface (facing down)
  {
    name: "single-horizontal",
    description: "One horizontal surface facing down",
    allChains: [
      horizontalChain("h1", SCREEN.width / 2, 300, 200, true),
    ],
    plannedSurfaces: [
      horizontalSurface("h1-0", SCREEN.width / 2, 300, 200, true),
    ],
    plannedSequences: [
      EMPTY_SEQUENCE,
      { name: "h1-0", surfaces: [horizontalSurface("h1-0", SCREEN.width / 2, 300, 200, true)] },
    ],
  },

  // Scene 3: Single vertical surface (facing right)
  {
    name: "single-vertical",
    description: "One vertical surface facing right",
    allChains: [
      verticalChain("v1", 400, SCREEN.height / 2, 200, true),
    ],
    plannedSurfaces: [
      verticalSurface("v1-0", 400, SCREEN.height / 2, 200, true),
    ],
    plannedSequences: [
      EMPTY_SEQUENCE,
      { name: "v1-0", surfaces: [verticalSurface("v1-0", 400, SCREEN.height / 2, 200, true)] },
    ],
  },

  // Scene 4: Single diagonal surface (45 degrees)
  {
    name: "single-diagonal",
    description: "One diagonal surface at 45 degrees",
    allChains: [
      diagonalChain("d1", SCREEN.width / 2, SCREEN.height / 2, 200, 45),
    ],
    plannedSurfaces: [
      diagonalSurface("d1-0", SCREEN.width / 2, SCREEN.height / 2, 200, 45),
    ],
    plannedSequences: [
      EMPTY_SEQUENCE,
      { name: "d1-0", surfaces: [diagonalSurface("d1-0", SCREEN.width / 2, SCREEN.height / 2, 200, 45)] },
    ],
  },

  // Scene 5: Wall obstacle (non-reflective)
  {
    name: "wall-obstacle",
    description: "One planned surface with a wall obstacle",
    allChains: [
      horizontalChain("h1", SCREEN.width / 2, 300, 200, true),
      createWallChain("wall1", [
        { x: 300, y: 450 },
        { x: 500, y: 450 },
      ]),
    ],
    plannedSurfaces: [
      horizontalSurface("h1-0", SCREEN.width / 2, 300, 200, true),
    ],
    plannedSequences: [
      EMPTY_SEQUENCE,
      { name: "h1-0", surfaces: [horizontalSurface("h1-0", SCREEN.width / 2, 300, 200, true)] },
    ],
  },
];
