/**
 * Chain Scenes for Invariant Tests
 *
 * Scenes with multiple surfaces forming chains or groups.
 */

import { RicochetSurface } from "@/surfaces/RicochetSurface";
import type { Scene } from "../types";
import { SCREEN } from "../positions";

/**
 * Create a V-shape (two surfaces meeting at a point).
 */
function createVShape(
  idPrefix: string,
  apexX: number,
  apexY: number,
  armLength: number,
  angleDegrees: number // angle between arms
): RicochetSurface[] {
  const halfAngle = (angleDegrees / 2) * (Math.PI / 180);

  // Left arm goes from outer point to apex
  const leftEndX = apexX - Math.sin(halfAngle) * armLength;
  const leftEndY = apexY + Math.cos(halfAngle) * armLength;

  // Right arm goes from apex to outer point
  const rightEndX = apexX + Math.sin(halfAngle) * armLength;
  const rightEndY = apexY + Math.cos(halfAngle) * armLength;

  return [
    new RicochetSurface(`${idPrefix}-left`, {
      start: { x: leftEndX, y: leftEndY },
      end: { x: apexX, y: apexY },
    }),
    new RicochetSurface(`${idPrefix}-right`, {
      start: { x: apexX, y: apexY },
      end: { x: rightEndX, y: rightEndY },
    }),
  ];
}

/**
 * Create parallel facing mirrors.
 */
function createParallelMirrors(
  leftX: number,
  rightX: number,
  topY: number,
  bottomY: number
): RicochetSurface[] {
  return [
    // Left mirror facing right (bottom to top)
    new RicochetSurface("mirror-left", {
      start: { x: leftX, y: bottomY },
      end: { x: leftX, y: topY },
    }),
    // Right mirror facing left (top to bottom)
    new RicochetSurface("mirror-right", {
      start: { x: rightX, y: topY },
      end: { x: rightX, y: bottomY },
    }),
  ];
}

/**
 * Create stacked horizontal surfaces (pyramid pattern).
 */
function createPyramid(
  centerX: number,
  baseY: number,
  spacing: number,
  layers: number
): RicochetSurface[] {
  const surfaces: RicochetSurface[] = [];
  const baseWidth = 40;
  const widthIncrease = 30;

  for (let i = 0; i < layers; i++) {
    const width = baseWidth + i * widthIncrease;
    const y = baseY - i * spacing;
    // Facing down: left to right
    surfaces.push(
      new RicochetSurface(`pyramid-${i + 1}`, {
        start: { x: centerX - width / 2, y },
        end: { x: centerX + width / 2, y },
      })
    );
  }

  return surfaces;
}

/**
 * Chain scenes: multiple surfaces in various configurations.
 */
export const CHAIN_SCENES: Scene[] = [
  // Scene 6: Parallel mirrors facing each other
  {
    name: "parallel-mirrors",
    description: "Two vertical surfaces facing each other",
    allSurfaces: createParallelMirrors(300, 600, 200, 500),
    plannedSurfaces: createParallelMirrors(300, 600, 200, 500),
  },

  // Scene 7: V-shape at 90 degrees
  {
    name: "v-shape-90",
    description: "Two surfaces meeting at 90 degrees",
    allSurfaces: createVShape("v90", SCREEN.width / 2, 250, 80, 90),
    plannedSurfaces: createVShape("v90", SCREEN.width / 2, 250, 80, 90),
  },

  // Scene 8: V-shape at 60 degrees (tighter angle)
  {
    name: "v-shape-60",
    description: "Two surfaces meeting at 60 degrees",
    allSurfaces: createVShape("v60", SCREEN.width / 2, 250, 80, 60),
    plannedSurfaces: createVShape("v60", SCREEN.width / 2, 250, 80, 60),
  },

  // Scene 9: Pyramid (4 stacked horizontal surfaces)
  {
    name: "pyramid",
    description: "Four stacked horizontal surfaces (inverted pyramid)",
    allSurfaces: createPyramid(SCREEN.width / 2, 500, 40, 4),
    plannedSurfaces: createPyramid(SCREEN.width / 2, 500, 40, 4),
  },
];

