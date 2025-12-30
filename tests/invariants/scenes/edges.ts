/**
 * Edge Case Scenes for Invariant Tests
 *
 * Scenes that test edge cases and numerical stability.
 */

import { RicochetSurface } from "@/surfaces/RicochetSurface";
import { WallSurface } from "@/surfaces/WallSurface";
import type { Scene } from "../types";
import { SCREEN } from "../positions";

/**
 * Edge case scenes.
 */
export const EDGE_SCENES: Scene[] = [
  // Scene 10: Surface behind surface (bypass scenario)
  {
    name: "surface-behind-surface",
    description: "One surface directly behind another (bypass test)",
    allSurfaces: [
      // Front surface
      new RicochetSurface("front", {
        start: { x: 500, y: 350 },
        end: { x: 700, y: 350 },
      }),
      // Back surface (behind front, same orientation)
      new RicochetSurface("back", {
        start: { x: 520, y: 250 },
        end: { x: 680, y: 250 },
      }),
    ],
    plannedSurfaces: [
      // Only the back surface is planned - front might cause bypass
      new RicochetSurface("back", {
        start: { x: 520, y: 250 },
        end: { x: 680, y: 250 },
      }),
    ],
  },

  // Scene 11: Collinear endpoints (two surfaces sharing an endpoint)
  {
    name: "collinear-endpoints",
    description: "Two surfaces sharing an endpoint",
    allSurfaces: [
      new RicochetSurface("s1", {
        start: { x: 400, y: 300 },
        end: { x: 600, y: 300 },
      }),
      new RicochetSurface("s2", {
        start: { x: 600, y: 300 },
        end: { x: 600, y: 500 },
      }),
    ],
    plannedSurfaces: [
      new RicochetSurface("s1", {
        start: { x: 400, y: 300 },
        end: { x: 600, y: 300 },
      }),
      new RicochetSurface("s2", {
        start: { x: 600, y: 300 },
        end: { x: 600, y: 500 },
      }),
    ],
  },

  // Scene 12: Near-parallel surfaces (numerical stability test)
  {
    name: "near-parallel",
    description: "Two almost parallel surfaces",
    allSurfaces: [
      new RicochetSurface("p1", {
        start: { x: 400, y: 300 },
        end: { x: 600, y: 300 },
      }),
      new RicochetSurface("p2", {
        start: { x: 400, y: 302 }, // 2 pixels apart, nearly parallel
        end: { x: 600, y: 298 },
      }),
    ],
    plannedSurfaces: [
      new RicochetSurface("p1", {
        start: { x: 400, y: 300 },
        end: { x: 600, y: 300 },
      }),
    ],
  },

  // Scene 13: Wall with gap (partial visibility)
  {
    name: "wall-with-gap",
    description: "Surface with wall obstacle that has a gap",
    allSurfaces: [
      new RicochetSurface("target", {
        start: { x: 500, y: 200 },
        end: { x: 700, y: 200 },
      }),
      // Wall with gap in the middle
      new WallSurface("wall-left", {
        start: { x: 300, y: 400 },
        end: { x: 550, y: 400 },
      }),
      new WallSurface("wall-right", {
        start: { x: 650, y: 400 },
        end: { x: 900, y: 400 },
      }),
    ],
    plannedSurfaces: [
      new RicochetSurface("target", {
        start: { x: 500, y: 200 },
        end: { x: 700, y: 200 },
      }),
    ],
  },
];

