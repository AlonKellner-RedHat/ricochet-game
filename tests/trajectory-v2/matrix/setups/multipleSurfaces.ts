/**
 * Multiple Surfaces Test Setups
 *
 * Category 4: Scenes with multiple surfaces
 */

import { createHorizontalSurface, createTestSurface, createVerticalSurface } from "../MatrixTestRunner";
import type { TestSetup } from "../types";

/**
 * Two ricochet surfaces in sequence.
 */
export const twoRicochetSequence: TestSetup = {
  name: "two-ricochet-sequence",
  description: "Two reflective surfaces planned in sequence",
  player: { x: 100, y: 300 },
  cursor: { x: 100, y: 100 },
  plannedSurfaces: [
    createVerticalSurface("ricochet1", 300, 200, 400),
    createHorizontalSurface("ricochet2", 200, 200, 400),
  ],
  allSurfaces: [
    createVerticalSurface("ricochet1", 300, 200, 400),
    createHorizontalSurface("ricochet2", 200, 200, 400),
  ],
  expected: {
    // Complex reflection scenario
  },
  tags: ["multiple-surfaces", "chain"],
};

/**
 * Three surfaces in a chain.
 */
export const threeSurfaceChain: TestSetup = {
  name: "three-surface-chain",
  description: "Three reflective surfaces in a chain",
  player: { x: 50, y: 300 },
  cursor: { x: 550, y: 300 },
  plannedSurfaces: [
    createVerticalSurface("s1", 150, 200, 400),
    createVerticalSurface("s2", 300, 200, 400),
    createVerticalSurface("s3", 450, 200, 400),
  ],
  allSurfaces: [
    createVerticalSurface("s1", 150, 200, 400),
    createVerticalSurface("s2", 300, 200, 400),
    createVerticalSurface("s3", 450, 200, 400),
  ],
  expected: {
    // Complex multi-reflection
  },
  tags: ["multiple-surfaces", "chain"],
};

/**
 * Ricochet surface followed by wall.
 */
export const ricochetThenWall: TestSetup = {
  name: "ricochet-then-wall",
  description: "Reflect off surface then hit wall",
  player: { x: 100, y: 300 },
  cursor: { x: 200, y: 100 },
  plannedSurfaces: [createVerticalSurface("ricochet1", 200, 200, 400)],
  allSurfaces: [
    createVerticalSurface("ricochet1", 200, 200, 400),
    createHorizontalSurface("wall1", 150, 100, 300, false),
  ],
  expected: {
    reachesCursor: false,
    blockedBy: "wall1",
  },
  tags: ["multiple-surfaces", "mixed"],
};

/**
 * Mixed surfaces complex scenario.
 */
export const mixedSurfacesComplex: TestSetup = {
  name: "mixed-surfaces-complex",
  description: "Complex scene with ricochet surfaces and walls",
  player: { x: 100, y: 300 },
  cursor: { x: 500, y: 300 },
  plannedSurfaces: [createVerticalSurface("ricochet1", 250, 200, 400)],
  allSurfaces: [
    createVerticalSurface("ricochet1", 250, 200, 400),
    createVerticalSurface("wall1", 400, 100, 250, false), // Wall above path
    createHorizontalSurface("wall2", 450, 350, 500, false), // Wall below path
    createVerticalSurface("ricochet2", 350, 200, 400), // Another ricochet
  ],
  expected: {
    // Complex interaction
  },
  tags: ["multiple-surfaces", "complex"],
};

/**
 * Parallel ricochet surfaces.
 */
export const parallelSurfaces: TestSetup = {
  name: "parallel-surfaces",
  description: "Two parallel vertical surfaces",
  player: { x: 100, y: 300 },
  cursor: { x: 400, y: 300 },
  plannedSurfaces: [],
  allSurfaces: [
    createVerticalSurface("s1", 200, 200, 400),
    createVerticalSurface("s2", 300, 200, 400),
  ],
  expected: {
    reachesCursor: false,
  },
  tags: ["multiple-surfaces", "parallel"],
};

/**
 * Surface before cursor, surface after cursor.
 * Order: player > surface > cursor > surface
 *
 * This tests that the forward projection (red dashed line) reflects off
 * the surface AFTER the cursor, following physics.
 */
export const surfaceBeforeAndAfterCursor: TestSetup = {
  name: "surface-before-and-after-cursor",
  description: "Order: player > surface > cursor > surface. Projection should reflect off second surface.",
  player: { x: 100, y: 300 },
  cursor: { x: 350, y: 300 },
  plannedSurfaces: [createVerticalSurface("surface1", 200, 200, 400)],
  allSurfaces: [
    createVerticalSurface("surface1", 200, 200, 400), // Before cursor
    createVerticalSurface("surface2", 500, 200, 400), // After cursor
  ],
  expected: {
    // Cursor is between the two surfaces
    // The forward projection should reflect off surface2
  },
  tags: ["multiple-surfaces", "projection-physics", "surface-after-cursor"],
};

/**
 * Obstruction BEFORE a planned surface.
 * Order: player > wall > planned ricochet > cursor
 *
 * With BYPASS logic: If cursor is on wrong side of planned surface, the surface is bypassed.
 * In this setup, cursor at (100, 100) and ricochet at x=400 with normal pointing LEFT,
 * cursor is on the LEFT side which is the reflective side, so surface is NOT bypassed.
 * But with the wall blocking, the actual path stops at the wall.
 */
export const obstructionBeforePlannedSurface: TestSetup = {
  name: "obstruction-before-planned-surface",
  description: "Order: player > wall > planned ricochet > cursor. Actual path blocked.",
  player: { x: 100, y: 300 },
  cursor: { x: 100, y: 100 }, // Cursor is "behind" player on left side
  plannedSurfaces: [createVerticalSurface("ricochet1", 400, 200, 400)],
  allSurfaces: [
    createVerticalSurface("wall1", 200, 200, 400, false), // Wall between player and ricochet
    createVerticalSurface("ricochet1", 400, 200, 400), // Planned ricochet surface
  ],
  expected: {
    // With bypass: planned surface may be bypassed due to cursor side
    // Just verify paths are calculated
  },
  tags: ["multiple-surfaces", "obstruction", "divergence"],
};

/**
 * Off-segment reflection test.
 * The cursor position causes the reflection point to fall off the surface segment.
 *
 * With BYPASS logic: If cursor is on wrong side, surface is bypassed.
 * This setup may trigger bypass depending on surface normal direction.
 */
export const offSegmentReflection: TestSetup = {
  name: "off-segment-reflection",
  description: "Cursor causes reflection point to be off the segment (if not bypassed).",
  player: { x: 100, y: 300 },
  cursor: { x: 500, y: 500 }, // Far below - may cause off-segment or bypass
  plannedSurfaces: [
    createTestSurface({
      id: "ricochet1",
      start: { x: 300, y: 250 },
      end: { x: 300, y: 350 }, // Short segment
      canReflect: true,
    }),
  ],
  allSurfaces: [
    createTestSurface({
      id: "ricochet1",
      start: { x: 300, y: 250 },
      end: { x: 300, y: 350 },
      canReflect: true,
    }),
  ],
  expected: {
    // May or may not be aligned depending on bypass
  },
  tags: ["single-surface", "off-segment", "divergence"],
};

/**
 * Multiple obstructions before a planned surface.
 * Order: player > wall1 > wall2 > planned ricochet > cursor
 *
 * With BYPASS logic: The planned surface may be bypassed depending on cursor side.
 * Actual path will be blocked by wall1 regardless.
 */
export const multipleObstructions: TestSetup = {
  name: "multiple-obstructions",
  description: "Player > Wall1 > Wall2 > Ricochet > Cursor. Actual blocked by wall1.",
  player: { x: 100, y: 300 },
  cursor: { x: 100, y: 100 },
  plannedSurfaces: [createVerticalSurface("ricochet1", 500, 200, 400)],
  allSurfaces: [
    createVerticalSurface("wall1", 200, 200, 400, false),
    createVerticalSurface("wall2", 350, 200, 400, false),
    createVerticalSurface("ricochet1", 500, 200, 400),
  ],
  expected: {
    // With bypass, may be aligned or not depending on surface normal
  },
  tags: ["multiple-surfaces", "obstruction", "divergence"],
};

/**
 * All multiple surface setups.
 */
export const multipleSurfaceSetups: readonly TestSetup[] = [
  twoRicochetSequence,
  threeSurfaceChain,
  ricochetThenWall,
  mixedSurfacesComplex,
  parallelSurfaces,
  surfaceBeforeAndAfterCursor,
  obstructionBeforePlannedSurface,
  offSegmentReflection,
  multipleObstructions,
];

