/**
 * Edge Case Scenes for Invariant Tests
 *
 * Scenes that test edge cases and numerical stability.
 */

import { RicochetSurface } from "@/surfaces/RicochetSurface";
import {
  type SurfaceChain,
  createRicochetChain,
  createWallChain,
  createMixedChain,
} from "@/trajectory-v2/geometry/SurfaceChain";
import type { Scene, PlannedSequence } from "../types";
import { SCREEN } from "../positions";

/** Empty sequence baseline */
const EMPTY_SEQUENCE: PlannedSequence = { name: "empty", surfaces: [] };

/**
 * Edge case scenes.
 */
export const EDGE_SCENES: Scene[] = [
  // Scene 10: Surface behind surface (bypass scenario)
  {
    name: "surface-behind-surface",
    description: "One surface directly behind another (bypass test)",
    allChains: [
      // Front surface
      createRicochetChain("front", [
        { x: 500, y: 350 },
        { x: 700, y: 350 },
      ]),
      // Back surface (behind front, same orientation)
      createRicochetChain("back", [
        { x: 520, y: 250 },
        { x: 680, y: 250 },
      ]),
    ],
    plannedSurfaces: [
      // Only the back surface is planned - front might cause bypass
      new RicochetSurface("back-0", {
        start: { x: 520, y: 250 },
        end: { x: 680, y: 250 },
      }),
    ],
    plannedSequences: [
      EMPTY_SEQUENCE,
      {
        name: "back-only",
        surfaces: [
          new RicochetSurface("back-0", {
            start: { x: 520, y: 250 },
            end: { x: 680, y: 250 },
          }),
        ],
      },
    ],
  },

  // Scene 11: Collinear endpoints - NOW A TRUE CHAIN (shared endpoint = JunctionPoint)
  {
    name: "collinear-endpoints",
    description: "Two surfaces sharing an endpoint (as a chain)",
    allChains: [
      // TRUE chain: s1 -> shared endpoint -> s2
      createRicochetChain("L-shape", [
        { x: 400, y: 300 },
        { x: 600, y: 300 }, // Shared endpoint = JunctionPoint
        { x: 600, y: 500 },
      ]),
    ],
    plannedSurfaces: [
      new RicochetSurface("L-shape-0", {
        start: { x: 400, y: 300 },
        end: { x: 600, y: 300 },
      }),
      new RicochetSurface("L-shape-1", {
        start: { x: 600, y: 300 },
        end: { x: 600, y: 500 },
      }),
    ],
    plannedSequences: [
      EMPTY_SEQUENCE,
      {
        name: "L-shape-first",
        surfaces: [
          new RicochetSurface("L-shape-0", {
            start: { x: 400, y: 300 },
            end: { x: 600, y: 300 },
          }),
        ],
      },
      {
        name: "L-shape-second",
        surfaces: [
          new RicochetSurface("L-shape-1", {
            start: { x: 600, y: 300 },
            end: { x: 600, y: 500 },
          }),
        ],
      },
    ],
  },

  // Scene 12: Near-parallel surfaces (numerical stability test)
  {
    name: "near-parallel",
    description: "Two almost parallel surfaces (p2 is 2px below p1)",
    allChains: [
      createRicochetChain("p1", [
        { x: 400, y: 300 },
        { x: 600, y: 300 },
      ]),
      createRicochetChain("p2", [
        { x: 400, y: 302 }, // 2 pixels below p1, truly parallel
        { x: 600, y: 302 },
      ]),
    ],
    plannedSurfaces: [
      new RicochetSurface("p1-0", {
        start: { x: 400, y: 300 },
        end: { x: 600, y: 300 },
      }),
    ],
    plannedSequences: [
      EMPTY_SEQUENCE,
      {
        name: "p1-only",
        surfaces: [
          new RicochetSurface("p1-0", {
            start: { x: 400, y: 300 },
            end: { x: 600, y: 300 },
          }),
        ],
      },
    ],
  },

  // Scene 13: Wall with gap (partial visibility)
  {
    name: "wall-with-gap",
    description: "Surface with wall obstacle that has a gap",
    allChains: [
      createRicochetChain("target", [
        { x: 500, y: 200 },
        { x: 700, y: 200 },
      ]),
      // Wall with gap in the middle (two separate chains)
      createWallChain("wall-left", [
        { x: 300, y: 400 },
        { x: 550, y: 400 },
      ]),
      createWallChain("wall-right", [
        { x: 650, y: 400 },
        { x: 900, y: 400 },
      ]),
    ],
    plannedSurfaces: [
      new RicochetSurface("target-0", {
        start: { x: 500, y: 200 },
        end: { x: 700, y: 200 },
      }),
    ],
    plannedSequences: [
      EMPTY_SEQUENCE,
      {
        name: "target-only",
        surfaces: [
          new RicochetSurface("target-0", {
            start: { x: 500, y: 200 },
            end: { x: 700, y: 200 },
          }),
        ],
      },
    ],
  },
];
