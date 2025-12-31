/**
 * Chain Scenes for Invariant Tests
 *
 * Scenes with multiple surfaces forming chains or groups.
 */

import { RicochetSurface } from "@/surfaces/RicochetSurface";
import { type SurfaceChain, createRicochetChain } from "@/trajectory-v2/geometry/SurfaceChain";
import { SCREEN } from "../positions";
import type { Scene } from "../types";

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

  // Scene 10: V-shape at 120 degrees (from demo - exact coords)
  // This is the scene that exhibits the pixel-perfect junction bug
  {
    name: "v-shape-120",
    description: "Two surfaces meeting at 120 degrees (chain1 from demo)",
    allChains: [
      createRicochetChain("chain1", [
        { x: 598.0384757729337, y: 280 },
        { x: 650, y: 250 }, // apex (junction)
        { x: 701.9615242270663, y: 280 },
      ]),
    ],
    plannedSurfaces: [
      new RicochetSurface("chain1-0", {
        start: { x: 598.0384757729337, y: 280 },
        end: { x: 650, y: 250 },
      }),
      new RicochetSurface("chain1-1", {
        start: { x: 650, y: 250 },
        end: { x: 701.9615242270663, y: 280 },
      }),
    ],
  },

  // Scene 11: V-shape at 60 degrees (chain3 from demo - exact coords)
  // This scene has a sorting bug with the junction
  {
    name: "v-shape-60-demo",
    description: "Two surfaces meeting at 60 degrees (chain3 from demo)",
    allChains: [
      createRicochetChain("chain3", [
        { x: 820, y: 301.9615242270663 },
        { x: 850, y: 250 }, // apex (junction)
        { x: 880, y: 301.9615242270663 },
      ]),
    ],
    plannedSurfaces: [
      new RicochetSurface("chain3-0", {
        start: { x: 820, y: 301.9615242270663 },
        end: { x: 850, y: 250 },
      }),
      new RicochetSurface("chain3-1", {
        start: { x: 850, y: 250 },
        end: { x: 880, y: 301.9615242270663 },
      }),
    ],
  },

  // Scene 12: Full demo scene (all surfaces from GameScene)
  // This reproduces the pyramid sorting bug
  {
    name: "full-demo",
    description: "Complete demo scene with all surfaces",
    allChains: createFullDemoChains(),
    plannedSurfaces: [],
  },
];

/**
 * Create all chains from the full demo scene.
 * Matches the exact setup from GameScene.ts.
 */
function createFullDemoChains(): SurfaceChain[] {
  const chains: SurfaceChain[] = [];

  // Ceiling (reflective, facing down)
  chains.push(
    createRicochetChain("ceiling", [
      { x: 0, y: 80 },
      { x: 1280, y: 80 },
    ])
  );

  // Left wall (reflective)
  chains.push(
    createRicochetChain("left-wall", [
      { x: 20, y: 700 },
      { x: 20, y: 80 },
    ])
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

  // Pyramid (inverted - shortest at bottom, longest at top)
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

  // Grid (4x4 array of small surfaces)
  const gridStartX = 900;
  const gridStartY = 200;
  const gridSpacing = 50;
  const gridSurfaceLength = 30;

  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const centerX = gridStartX + col * gridSpacing;
      const centerY = gridStartY + row * gridSpacing;
      const direction = (row * 4 + col) % 8;
      const angle = (direction * Math.PI) / 4;
      const dx = Math.cos(angle) * (gridSurfaceLength / 2);
      const dy = Math.sin(angle) * (gridSurfaceLength / 2);

      chains.push(
        createRicochetChain(`grid-${row}-${col}`, [
          { x: centerX - dx, y: centerY - dy },
          { x: centerX + dx, y: centerY + dy },
        ])
      );
    }
  }

  // V-shape chains (three adjacent, apex pointing up)
  // Chain 1: 120 degrees
  chains.push(
    createRicochetChain("chain1", [
      { x: 598.0384757729337, y: 280 },
      { x: 650, y: 250 },
      { x: 701.9615242270663, y: 280 },
    ])
  );

  // Chain 2: 90 degrees
  chains.push(
    createRicochetChain("chain2", [
      { x: 707.5735931288071, y: 292.42640687119285 },
      { x: 750, y: 250 },
      { x: 792.4264068711929, y: 292.42640687119285 },
    ])
  );

  // Chain 3: 60 degrees
  chains.push(
    createRicochetChain("chain3", [
      { x: 820, y: 301.9615242270663 },
      { x: 850, y: 250 },
      { x: 880, y: 301.9615242270663 },
    ])
  );

  return chains;
}
