/**
 * Chain Scenes for Invariant Tests
 *
 * Scenes with multiple surfaces forming chains or groups.
 */

import { RicochetSurface } from "@/surfaces/RicochetSurface";
import {
  type SurfaceChain,
  createRicochetChain,
} from "@/trajectory-v2/geometry/SurfaceChain";
import type { Scene } from "../types";
import { SCREEN } from "../positions";

/**
 * Create a V-shape chain (apex is a JunctionPoint - no continuation rays).
 * Returns a single SurfaceChain with 3 vertices.
 */
function createVShapeChain(
  id: string,
  apexX: number,
  apexY: number,
  armLength: number,
  angleDegrees: number // angle between arms
): SurfaceChain {
  const halfAngle = (angleDegrees / 2) * (Math.PI / 180);

  // Left arm outer end
  const leftEndX = apexX - Math.sin(halfAngle) * armLength;
  const leftEndY = apexY + Math.cos(halfAngle) * armLength;

  // Right arm outer end
  const rightEndX = apexX + Math.sin(halfAngle) * armLength;
  const rightEndY = apexY + Math.cos(halfAngle) * armLength;

  // Chain: left outer -> apex (junction) -> right outer
  return createRicochetChain(id, [
    { x: leftEndX, y: leftEndY },
    { x: apexX, y: apexY },
    { x: rightEndX, y: rightEndY },
  ]);
}

/**
 * Create V-shape surfaces for plannedSurfaces.
 */
function createVShapeSurfaces(
  idPrefix: string,
  apexX: number,
  apexY: number,
  armLength: number,
  angleDegrees: number
): RicochetSurface[] {
  const halfAngle = (angleDegrees / 2) * (Math.PI / 180);

  const leftEndX = apexX - Math.sin(halfAngle) * armLength;
  const leftEndY = apexY + Math.cos(halfAngle) * armLength;
  const rightEndX = apexX + Math.sin(halfAngle) * armLength;
  const rightEndY = apexY + Math.cos(halfAngle) * armLength;

  return [
    new RicochetSurface(`${idPrefix}-0`, {
      start: { x: leftEndX, y: leftEndY },
      end: { x: apexX, y: apexY },
    }),
    new RicochetSurface(`${idPrefix}-1`, {
      start: { x: apexX, y: apexY },
      end: { x: rightEndX, y: rightEndY },
    }),
  ];
}

/**
 * Create parallel facing mirror chains.
 */
function createParallelMirrorChains(
  leftX: number,
  rightX: number,
  topY: number,
  bottomY: number
): SurfaceChain[] {
  return [
    // Left mirror facing right (bottom to top)
    createRicochetChain("mirror-left", [
      { x: leftX, y: bottomY },
      { x: leftX, y: topY },
    ]),
    // Right mirror facing left (top to bottom)
    createRicochetChain("mirror-right", [
      { x: rightX, y: topY },
      { x: rightX, y: bottomY },
    ]),
  ];
}

/**
 * Create parallel mirror surfaces for plannedSurfaces.
 */
function createParallelMirrorSurfaces(
  leftX: number,
  rightX: number,
  topY: number,
  bottomY: number
): RicochetSurface[] {
  return [
    new RicochetSurface("mirror-left-0", {
      start: { x: leftX, y: bottomY },
      end: { x: leftX, y: topY },
    }),
    new RicochetSurface("mirror-right-0", {
      start: { x: rightX, y: topY },
      end: { x: rightX, y: bottomY },
    }),
  ];
}

/**
 * Create stacked horizontal surface chains (pyramid pattern).
 */
function createPyramidChains(
  centerX: number,
  baseY: number,
  spacing: number,
  layers: number
): SurfaceChain[] {
  const chains: SurfaceChain[] = [];
  const baseWidth = 40;
  const widthIncrease = 30;

  for (let i = 0; i < layers; i++) {
    const width = baseWidth + i * widthIncrease;
    const y = baseY - i * spacing;
    chains.push(
      createRicochetChain(`pyramid-${i + 1}`, [
        { x: centerX - width / 2, y },
        { x: centerX + width / 2, y },
      ])
    );
  }

  return chains;
}

/**
 * Create pyramid surfaces for plannedSurfaces.
 */
function createPyramidSurfaces(
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
    surfaces.push(
      new RicochetSurface(`pyramid-${i + 1}-0`, {
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
    allChains: createParallelMirrorChains(300, 600, 200, 500),
    plannedSurfaces: createParallelMirrorSurfaces(300, 600, 200, 500),
  },

  // Scene 7: V-shape at 90 degrees (TRUE chain - apex is JunctionPoint)
  {
    name: "v-shape-90",
    description: "Two surfaces meeting at 90 degrees (as a chain)",
    allChains: [createVShapeChain("v90", SCREEN.width / 2, 250, 80, 90)],
    plannedSurfaces: createVShapeSurfaces("v90", SCREEN.width / 2, 250, 80, 90),
  },

  // Scene 8: V-shape at 60 degrees (TRUE chain - apex is JunctionPoint)
  {
    name: "v-shape-60",
    description: "Two surfaces meeting at 60 degrees (as a chain)",
    allChains: [createVShapeChain("v60", SCREEN.width / 2, 250, 80, 60)],
    plannedSurfaces: createVShapeSurfaces("v60", SCREEN.width / 2, 250, 80, 60),
  },

  // Scene 9: Pyramid (4 stacked horizontal surfaces - separate chains)
  {
    name: "pyramid",
    description: "Four stacked horizontal surfaces (inverted pyramid)",
    allChains: createPyramidChains(SCREEN.width / 2, 500, 40, 4),
    plannedSurfaces: createPyramidSurfaces(SCREEN.width / 2, 500, 40, 4),
  },
];
