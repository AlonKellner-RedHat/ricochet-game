/**
 * Basic Scenes for Invariant Tests
 *
 * Simple scenes with 0-2 surfaces.
 */

import { RicochetSurface } from "@/surfaces/RicochetSurface";
import { WallSurface } from "@/surfaces/WallSurface";
import type { Scene } from "../types";
import { SCREEN } from "../positions";

/**
 * Create a horizontal reflective surface.
 */
function horizontalSurface(
  id: string,
  centerX: number,
  y: number,
  width: number,
  facingDown: boolean
): RicochetSurface {
  const halfWidth = width / 2;
  // Normal points left when going from start to end
  // For facing down: go left-to-right, normal points down
  // For facing up: go right-to-left, normal points up
  return new RicochetSurface(id, {
    start: facingDown ? { x: centerX - halfWidth, y } : { x: centerX + halfWidth, y },
    end: facingDown ? { x: centerX + halfWidth, y } : { x: centerX - halfWidth, y },
  });
}

/**
 * Create a vertical reflective surface.
 */
function verticalSurface(
  id: string,
  x: number,
  centerY: number,
  height: number,
  facingRight: boolean
): RicochetSurface {
  const halfHeight = height / 2;
  // For facing right: go bottom-to-top
  // For facing left: go top-to-bottom
  return new RicochetSurface(id, {
    start: facingRight ? { x, y: centerY + halfHeight } : { x, y: centerY - halfHeight },
    end: facingRight ? { x, y: centerY - halfHeight } : { x, y: centerY + halfHeight },
  });
}

/**
 * Create a diagonal reflective surface.
 */
function diagonalSurface(
  id: string,
  centerX: number,
  centerY: number,
  length: number,
  angle: number // degrees from horizontal
): RicochetSurface {
  const rad = (angle * Math.PI) / 180;
  const dx = (Math.cos(rad) * length) / 2;
  const dy = (Math.sin(rad) * length) / 2;
  return new RicochetSurface(id, {
    start: { x: centerX - dx, y: centerY - dy },
    end: { x: centerX + dx, y: centerY + dy },
  });
}

/**
 * Basic scenes: empty, single surfaces.
 */
export const BASIC_SCENES: Scene[] = [
  // Scene 1: Empty - no surfaces
  {
    name: "empty",
    description: "No surfaces - baseline test",
    allSurfaces: [],
    plannedSurfaces: [],
  },

  // Scene 2: Single horizontal surface (facing down)
  {
    name: "single-horizontal",
    description: "One horizontal surface facing down",
    allSurfaces: [
      horizontalSurface("h1", SCREEN.width / 2, 300, 200, true),
    ],
    plannedSurfaces: [
      horizontalSurface("h1", SCREEN.width / 2, 300, 200, true),
    ],
  },

  // Scene 3: Single vertical surface (facing right)
  {
    name: "single-vertical",
    description: "One vertical surface facing right",
    allSurfaces: [
      verticalSurface("v1", 400, SCREEN.height / 2, 200, true),
    ],
    plannedSurfaces: [
      verticalSurface("v1", 400, SCREEN.height / 2, 200, true),
    ],
  },

  // Scene 4: Single diagonal surface (45 degrees)
  {
    name: "single-diagonal",
    description: "One diagonal surface at 45 degrees",
    allSurfaces: [
      diagonalSurface("d1", SCREEN.width / 2, SCREEN.height / 2, 200, 45),
    ],
    plannedSurfaces: [
      diagonalSurface("d1", SCREEN.width / 2, SCREEN.height / 2, 200, 45),
    ],
  },

  // Scene 5: Wall obstacle (non-reflective)
  {
    name: "wall-obstacle",
    description: "One planned surface with a wall obstacle",
    allSurfaces: [
      horizontalSurface("h1", SCREEN.width / 2, 300, 200, true),
      new WallSurface("wall1", {
        start: { x: 300, y: 450 },
        end: { x: 500, y: 450 },
      }),
    ],
    plannedSurfaces: [
      horizontalSurface("h1", SCREEN.width / 2, 300, 200, true),
    ],
  },
];

