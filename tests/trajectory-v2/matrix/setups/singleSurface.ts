/**
 * Single Surface Test Setups
 *
 * Category 2: Scenes with one reflective surface
 */

import {
  createAngledSurface,
  createHorizontalSurface,
  createVerticalSurface,
} from "../MatrixTestRunner";
import type { TestSetup } from "../types";

/**
 * Single vertical ricochet surface ahead.
 */
export const singleRicochetVertical: TestSetup = {
  name: "single-ricochet-vertical",
  description: "Vertical reflective surface ahead",
  player: { x: 100, y: 300 },
  cursor: { x: 500, y: 300 },
  plannedSurfaces: [],
  allSurfaces: [createVerticalSurface("ricochet1", 300, 200, 400)],
  expected: {
    reachesCursor: false, // Surface blocks direct path
  },
  tags: ["single-surface", "ricochet", "vertical"],
};

/**
 * Single horizontal ricochet surface.
 */
export const singleRicochetHorizontal: TestSetup = {
  name: "single-ricochet-horizontal",
  description: "Horizontal reflective surface",
  player: { x: 300, y: 100 },
  cursor: { x: 300, y: 500 },
  plannedSurfaces: [],
  allSurfaces: [createHorizontalSurface("ricochet1", 300, 200, 400)],
  expected: {
    reachesCursor: false,
  },
  tags: ["single-surface", "ricochet", "horizontal"],
};

/**
 * Single 45-degree angled ricochet surface.
 */
export const singleRicochetAngled: TestSetup = {
  name: "single-ricochet-angled",
  description: "45-degree angled reflective surface",
  player: { x: 100, y: 300 },
  cursor: { x: 400, y: 300 },
  plannedSurfaces: [],
  allSurfaces: [createAngledSurface("ricochet1", { x: 250, y: 300 }, 200, 45)],
  expected: {
    reachesCursor: false,
  },
  tags: ["single-surface", "ricochet", "angled"],
};

/**
 * Cursor between player and reflective surface.
 */
export const cursorBeforeSurface: TestSetup = {
  name: "cursor-before-surface",
  description: "Cursor is between player and reflective surface",
  player: { x: 100, y: 300 },
  cursor: { x: 250, y: 300 },
  plannedSurfaces: [],
  allSurfaces: [createVerticalSurface("ricochet1", 400, 200, 400)],
  expected: {
    reachesCursor: true,
    isAligned: true,
  },
  tags: ["single-surface", "cursor-position"],
};

/**
 * Cursor after the reflective surface (reflection needed).
 */
export const cursorAfterSurface: TestSetup = {
  name: "cursor-after-surface",
  description: "Cursor is past the reflective surface (requires reflection)",
  player: { x: 100, y: 300 },
  cursor: { x: 500, y: 100 },
  plannedSurfaces: [createVerticalSurface("ricochet1", 300, 100, 400)],
  allSurfaces: [createVerticalSurface("ricochet1", 300, 100, 400)],
  expected: {
    // Depends on exact geometry
  },
  tags: ["single-surface", "reflection-required"],
};

/**
 * Surface planned but cursor on wrong side.
 */
export const cursorWrongSide: TestSetup = {
  name: "cursor-wrong-side",
  description: "Surface planned but cursor is on the wrong side",
  player: { x: 100, y: 300 },
  cursor: { x: 200, y: 300 },
  plannedSurfaces: [createVerticalSurface("ricochet1", 400, 200, 400)],
  allSurfaces: [createVerticalSurface("ricochet1", 400, 200, 400)],
  expected: {
    // Cursor is before surface, so path should reach cursor directly
    reachesCursor: true,
  },
  tags: ["single-surface", "wrong-side"],
};

/**
 * Single planned surface with on-segment reflection.
 * 
 * First Principle: When reflecting off a PLANNED surface with an on-segment hit,
 * the entire path should be green (aligned), and dashed yellow projection.
 * There should be NO red.
 */
export const plannedSurfaceOnSegment: TestSetup = {
  name: "planned-surface-on-segment",
  description: "Single planned surface, reflection point is on segment - should be fully green",
  player: { x: 100, y: 300 },
  cursor: { x: 100, y: 100 }, // Cursor positioned to be reached after reflection
  plannedSurfaces: [createVerticalSurface("ricochet1", 200, 100, 400)], // Surface in plan
  allSurfaces: [createVerticalSurface("ricochet1", 200, 100, 400)],
  expected: {
    isAligned: true, // Reflecting off planned surface = aligned
    reachesCursor: true,
  },
  tags: ["single-surface", "planned", "on-segment", "first-principle-6.9"],
};

/**
 * Single planned surface with off-segment reflection.
 * 
 * When the reflection point is off the segment, the paths diverge.
 * Solid green to divergence, solid red to cursor.
 */
export const plannedSurfaceOffSegment: TestSetup = {
  name: "planned-surface-off-segment",
  description: "Single planned surface, but reflection point is off segment - divergence",
  player: { x: 100, y: 300 },
  cursor: { x: 100, y: 500 }, // Cursor below player, reflection would be off segment
  plannedSurfaces: [createVerticalSurface("ricochet1", 200, 100, 200)], // Short segment
  allSurfaces: [createVerticalSurface("ricochet1", 200, 100, 200)],
  expected: {
    isAligned: false, // Off-segment reflection = divergence
  },
  tags: ["single-surface", "planned", "off-segment"],
};

/**
 * Planned surface on-segment, projection hits another reflective surface.
 * 
 * First Principle: When plan is completed successfully (all planned surfaces
 * hit on-segment before cursor), the projection after cursor should be
 * dashed YELLOW, even if it hits and reflects off other surfaces.
 * No red should appear after successful plan completion.
 */
export const plannedThenProjectionHitsOther: TestSetup = {
  name: "planned-then-projection-hits-other",
  description: "Plan completed, projection hits unplanned surface - should stay yellow",
  player: { x: 100, y: 300 },
  cursor: { x: 100, y: 200 }, // Cursor between player and planned surface reflection point
  plannedSurfaces: [createVerticalSurface("planned1", 200, 100, 400)], // Planned surface
  allSurfaces: [
    createVerticalSurface("planned1", 200, 100, 400), // Planned surface
    createVerticalSurface("other1", 50, 100, 400),    // Another surface to the left
  ],
  expected: {
    isAligned: true, // Plan completed successfully
    reachesCursor: true,
  },
  tags: ["single-surface", "planned", "projection-reflection", "first-principle-1.7"],
};

/**
 * Off-segment reflection: cursor NOT vertically aligned with player.
 *
 * First Principle: When a surface is planned but the reflection point
 * is off the segment edges, the path must still reflect off the extended line.
 * The aligned sections should be green.
 * 
 * Geometry:
 * - Player at (100, 400), cursor at (100, 500) - both on reflective side
 * - Vertical surface at x=200, segment from y=150 to y=250
 * - Cursor image at (300, 500), ray hits x=200 at y=450 (OFF segment)
 * 
 * Note: Legacy calculateAlignment considers off-segment as divergence,
 * but the new unified path considers it aligned. The actual path
 * physically goes straight (doesn't hit segment), while planned reflects.
 */
export const offSegmentReflectionNotAligned: TestSetup = {
  name: "off-segment-reflection-not-aligned",
  description: "Planned surface, off-segment reflection, cursor Y != player Y - should still reflect",
  player: { x: 100, y: 400 },
  cursor: { x: 100, y: 500 }, // Different Y, same reflective side
  plannedSurfaces: [
    // Short vertical surface - reflection point will be off-segment
    createVerticalSurface("planned1", 200, 150, 250), // Only covers y=150 to y=250
  ],
  allSurfaces: [
    createVerticalSurface("planned1", 200, 150, 250),
  ],
  expected: {
    // Off-segment: planned reflects, actual goes straight - they diverge in legacy model
    // But visually, first segment to extended line should be green (aligned)
  },
  tags: ["single-surface", "off-segment", "not-aligned", "first-principle-off-segment"],
};

/**
 * Off-segment reflection: cursor vertically aligned with player.
 *
 * Geometry:
 * - Player at (100, 400), cursor at (100, 400) - same position (aligned)
 * - Vertical surface at x=200, segment from y=150 to y=250
 * - Cursor image at (300, 400), ray hits x=200 at y=400 (OFF segment)
 * 
 * Note: Legacy calculateAlignment considers off-segment as divergence.
 */
export const offSegmentReflectionAligned: TestSetup = {
  name: "off-segment-reflection-aligned",
  description: "Planned surface, off-segment reflection, cursor Y = player Y",
  player: { x: 100, y: 400 },
  cursor: { x: 100, y: 400 }, // Same Y as player
  plannedSurfaces: [
    createVerticalSurface("planned1", 200, 150, 250), // Doesn't cover y=400
  ],
  allSurfaces: [
    createVerticalSurface("planned1", 200, 150, 250),
  ],
  expected: {
    // Off-segment: divergence in legacy model
    // Visually, first segment should still be green
  },
  tags: ["single-surface", "off-segment", "aligned", "first-principle-off-segment"],
};

/**
 * Empty plan with unplanned reflective surface between player and cursor.
 * Surface is facing the player (can reflect).
 *
 * First Principles:
 * - Actual path must always be visualized (solid-green + dashed-yellow)
 * - Planned path must always be visualized (solid-red + dashed-red)
 * - All reflection points must have both ingoing and outgoing paths
 *
 * Expected:
 * - Solid-green from player to reflection point
 * - Dashed-yellow from reflection point forward (physical simulation)
 * - Solid-red from divergence point to cursor
 * - Dashed-red from cursor forward (physical simulation of red path)
 *
 * Violation this setup catches:
 * - Missing dashed-yellow outgoing path from reflection
 * - Missing dashed-red forward simulation after cursor
 */
export const emptyPlanReflectiveSurfaceFacingPlayer: TestSetup = {
  name: "empty-plan-reflective-surface-facing-player",
  description: "Empty plan, reflective surface between player and cursor, facing player",
  player: { x: 100, y: 300 },
  cursor: { x: 400, y: 300 },
  plannedSurfaces: [], // Empty plan
  allSurfaces: [
    // Vertical surface at x=250, facing left (toward player)
    // Normal points left so canReflectFrom returns true for rays from left
    createVerticalSurface("ricochet1", 250, 100, 500),
  ],
  expected: {
    reachesCursor: false, // Actual path reflects off surface, doesn't reach cursor directly
    isAligned: false, // Actual reflects, planned goes straight to cursor -> divergence
  },
  tags: ["single-surface", "empty-plan", "reflection-visualization", "forward-projection"],
};

/**
 * All single surface setups.
 */
export const singleSurfaceSetups: readonly TestSetup[] = [
  singleRicochetVertical,
  singleRicochetHorizontal,
  singleRicochetAngled,
  cursorBeforeSurface,
  cursorAfterSurface,
  cursorWrongSide,
  plannedSurfaceOnSegment,
  plannedSurfaceOffSegment,
  plannedThenProjectionHitsOther,
  offSegmentReflectionNotAligned,
  offSegmentReflectionAligned,
  emptyPlanReflectiveSurfaceFacingPlayer,
];

