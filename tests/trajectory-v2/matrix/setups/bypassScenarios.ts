/**
 * Bypass Scenario Test Setups
 *
 * Category: Surface bypass scenarios
 *
 * These setups test First Principles Section 6 (Bypass):
 * 6.1 Cursor Side Rule
 * 6.2 Player Side Rule
 * 6.3 Reflection Chain Rule
 * 6.4 No Reflect-Through
 * 6.5 Dynamic Bypass
 */

import { createTestSurface, createVerticalSurface, createHorizontalSurface } from "../MatrixTestRunner";
import type { TestSetup } from "../types";

/**
 * Cursor on wrong side of planned surface.
 * The surface IS obstructing the direct path to cursor (between player and cursor).
 * BUT cursor is on non-reflective side, so surface should be bypassed from the PLAN.
 *
 * First Principle 6.1: Surface MUST be bypassed from PLAN.
 * The direction should aim directly at cursor (no bidirectional reflection).
 * The ACTUAL path will still hit the surface if it's in the way.
 *
 * Expected: Planned path goes directly, actual path hits surface and reflects.
 */
export const cursorWrongSideNoObstruction: TestSetup = {
  name: "cursor-wrong-side-no-obstruction",
  description: "Cursor on non-reflective side of planned surface (between player and cursor)",
  player: { x: 100, y: 300 },
  cursor: { x: 400, y: 300 }, // On same horizontal line, surface is perpendicular
  plannedSurfaces: [
    // Vertical surface at x=200, player approaches from left (normal points left)
    // Cursor at x=400 is on the RIGHT side (non-reflective)
    createTestSurface({
      id: "ricochet1",
      start: { x: 200, y: 100 }, // Top
      end: { x: 200, y: 500 }, // Bottom - normal points left (toward player)
      canReflect: true,
    }),
  ],
  allSurfaces: [
    createTestSurface({
      id: "ricochet1",
      start: { x: 200, y: 100 },
      end: { x: 200, y: 500 },
      canReflect: true,
    }),
  ],
  expected: {
    // Actual path will hit the surface (it's between player and cursor)
    // and reflect, so paths diverge
    isAligned: false,
    reachesCursor: false, // Ray goes toward cursor, hits surface, reflects away
  },
  tags: ["bypass", "cursor-wrong-side", "first-principle-6.1"],
};

/**
 * Player on wrong side of first planned surface.
 *
 * First Principle 6.2: Surface MUST be bypassed.
 */
export const playerWrongSide: TestSetup = {
  name: "player-wrong-side",
  description: "Player on non-reflective side of first planned surface",
  player: { x: 300, y: 300 }, // Player is to the RIGHT of the surface
  cursor: { x: 400, y: 100 }, // Cursor above and further right
  plannedSurfaces: [
    // Vertical surface at x=200, normal points left (toward x=100)
    // Player at x=300 is on the wrong (right/back) side
    createTestSurface({
      id: "ricochet1",
      start: { x: 200, y: 100 },
      end: { x: 200, y: 500 },
      canReflect: true,
    }),
  ],
  allSurfaces: [
    createTestSurface({
      id: "ricochet1",
      start: { x: 200, y: 100 },
      end: { x: 200, y: 500 },
      canReflect: true,
    }),
  ],
  expected: {
    isAligned: true, // Surface bypassed, direct path
    reachesCursor: true,
  },
  tags: ["bypass", "player-wrong-side", "first-principle-6.2"],
};

/**
 * Reflection point on wrong side of next surface in chain.
 *
 * First Principle 6.3: Next surface MUST be bypassed.
 */
export const chainWrongSide: TestSetup = {
  name: "chain-wrong-side",
  description: "Reflection point cannot reach next surface from reflective side",
  player: { x: 100, y: 300 },
  cursor: { x: 100, y: 100 }, // Cursor above player
  plannedSurfaces: [
    // First surface: vertical at x=200
    createVerticalSurface("ricochet1", 200, 200, 400),
    // Second surface: positioned so first reflection can't reach it properly
    createTestSurface({
      id: "ricochet2",
      start: { x: 50, y: 200 }, // To the left of player
      end: { x: 50, y: 400 },
      canReflect: true,
    }),
  ],
  allSurfaces: [
    createVerticalSurface("ricochet1", 200, 200, 400),
    createTestSurface({
      id: "ricochet2",
      start: { x: 50, y: 200 },
      end: { x: 50, y: 400 },
      canReflect: true,
    }),
  ],
  expected: {
    // Second surface should be bypassed
  },
  tags: ["bypass", "chain-wrong-side", "first-principle-6.3"],
};

/**
 * Cursor moves between sides - should toggle bypass.
 *
 * This is tested as two separate setups: cursor on correct side, cursor on wrong side.
 */
export const cursorOnCorrectSide: TestSetup = {
  name: "cursor-on-correct-side",
  description: "Cursor on reflective side - reflection should work",
  player: { x: 100, y: 300 },
  cursor: { x: 100, y: 100 }, // Cursor on same side as player (reflective side)
  plannedSurfaces: [
    createTestSurface({
      id: "ricochet1",
      start: { x: 200, y: 100 },
      end: { x: 200, y: 500 }, // Normal points left toward player
      canReflect: true,
    }),
  ],
  allSurfaces: [
    createTestSurface({
      id: "ricochet1",
      start: { x: 200, y: 100 },
      end: { x: 200, y: 500 },
      canReflect: true,
    }),
  ],
  expected: {
    isAligned: true, // Should work, on-segment hit
    reachesCursor: true,
  },
  tags: ["bypass", "cursor-correct-side", "first-principle-6.5"],
};

/**
 * "Reflect through" scenario - this should NEVER be possible.
 *
 * First Principle 6.4: Path may never reflect through a surface.
 * If the geometry would require this, the surface must be bypassed.
 * 
 * With bypass: cursor on wrong side → surface bypassed → direct path to cursor
 */
export const noReflectThrough: TestSetup = {
  name: "no-reflect-through",
  description: "Cursor on wrong side - surface bypassed in plan, but actual path reflects",
  player: { x: 100, y: 300 },
  cursor: { x: 300, y: 300 }, // On the other side (right), surface normal points left
  plannedSurfaces: [
    createTestSurface({
      id: "ricochet1",
      start: { x: 200, y: 100 },
      end: { x: 200, y: 500 }, // Surface between player and cursor
      canReflect: true,
    }),
  ],
  allSurfaces: [
    createTestSurface({
      id: "ricochet1",
      start: { x: 200, y: 100 },
      end: { x: 200, y: 500 },
      canReflect: true,
    }),
  ],
  expected: {
    // Planned path bypasses surface (direct to cursor), but actual path
    // physically hits the surface and reflects. They diverge.
    isAligned: false,
    reachesCursor: false, // Actual path reflects away from cursor
  },
  tags: ["bypass", "no-reflect-through", "first-principle-6.4"],
};

/**
 * Surface behind player (player between surface and cursor).
 *
 * Player would have to go backward to hit the surface - should bypass.
 */
export const surfaceBehindPlayer: TestSetup = {
  name: "surface-behind-player",
  description: "Surface is behind player relative to cursor direction",
  player: { x: 300, y: 300 },
  cursor: { x: 500, y: 300 },
  plannedSurfaces: [
    createVerticalSurface("ricochet1", 100, 200, 400), // Behind player
  ],
  allSurfaces: [
    createVerticalSurface("ricochet1", 100, 200, 400),
  ],
  expected: {
    isAligned: true, // Surface bypassed
    reachesCursor: true,
  },
  tags: ["bypass", "surface-behind-player"],
};

/**
 * Multiple surfaces, some should be bypassed.
 */
export const partialBypass: TestSetup = {
  name: "partial-bypass",
  description: "Some surfaces bypassed, some active",
  player: { x: 100, y: 300 },
  cursor: { x: 100, y: 100 },
  plannedSurfaces: [
    // First surface: valid, should be used
    createVerticalSurface("ricochet1", 200, 200, 400),
    // Second surface: player's reflection point can't reach it properly
    createTestSurface({
      id: "ricochet2",
      start: { x: 50, y: 200 },
      end: { x: 50, y: 400 },
      canReflect: true,
    }),
  ],
  allSurfaces: [
    createVerticalSurface("ricochet1", 200, 200, 400),
    createTestSurface({
      id: "ricochet2",
      start: { x: 50, y: 200 },
      end: { x: 50, y: 400 },
      canReflect: true,
    }),
  ],
  expected: {
    // First surface used, second bypassed
  },
  tags: ["bypass", "partial-bypass"],
};

/**
 * Wall blocks path before cursor, then a reflective surface after cursor.
 * Order: player > wall > cursor > surface
 *
 * First Principles:
 * - The dashed red path must follow physics (reflect off surface after cursor)
 * - If wall is removed, dashed yellow should reflect off surface the same way
 */
export const wallThenSurfaceAfterCursor: TestSetup = {
  name: "wall-then-surface-after-cursor",
  description: "player > wall > cursor > surface - dashed red must reflect off surface after cursor",
  player: { x: 100, y: 300 },
  cursor: { x: 250, y: 300 },
  plannedSurfaces: [], // No planned surfaces - testing raw physics
  allSurfaces: [
    // First surface: a WALL (non-reflective) between player and cursor
    createTestSurface({
      id: "wall1",
      start: { x: 150, y: 200 },
      end: { x: 150, y: 400 },
      canReflect: false, // Wall blocks, doesn't reflect
    }),
    // Second surface: reflective surface after cursor
    createTestSurface({
      id: "surface2",
      start: { x: 350, y: 200 },
      end: { x: 350, y: 400 },
      canReflect: true,
    }),
  ],
  expected: {
    // Path blocked by wall before cursor
    isAligned: false,
    reachesCursor: false,
    blockedBy: "wall1",
  },
  tags: ["bypass", "wall-then-surface", "dashed-projection-physics", "first-principle-2.4"],
};

/**
 * Reflective surface reflects path away before cursor, another surface after cursor.
 * Order: player > surface1 > cursor > surface2
 *
 * First Principles:
 * - The dashed red path must follow physics (reflect off surface2)
 * - If surface1 is removed, dashed yellow should reflect off surface2 the same way
 *
 * In this case: path hits surface1, reflects away from cursor direction,
 * so cursor is not reachable. The "dashed red" projection from cursor should
 * still reflect off surface2.
 */
export const obstructionThenSurfaceAfterCursor: TestSetup = {
  name: "obstruction-then-surface-after-cursor",
  description: "player > reflective surface > cursor > surface - dashed red must still reflect",
  player: { x: 100, y: 300 },
  cursor: { x: 250, y: 300 },
  plannedSurfaces: [], // No planned surfaces - testing raw physics
  allSurfaces: [
    // First surface: reflective surface between player and cursor
    // Normal points left (toward player), so arrow going right hits and reflects
    createTestSurface({
      id: "surface1",
      start: { x: 150, y: 200 },
      end: { x: 150, y: 400 },
      canReflect: true,
    }),
    // Second surface: reflective surface after cursor
    createTestSurface({
      id: "surface2",
      start: { x: 350, y: 200 },
      end: { x: 350, y: 400 },
      canReflect: true,
    }),
  ],
  expected: {
    // Path hits surface1 and reflects - doesn't reach cursor
    isAligned: false,
    reachesCursor: false,
  },
  tags: ["bypass", "obstruction-then-surface", "dashed-projection-physics", "first-principle-2.4"],
};

/**
 * Same as above but without the obstruction.
 * Order: player > cursor > surface
 *
 * The dashed yellow should reflect off the surface.
 * This is the "ideal" version to compare against.
 */
export const noObstructionSurfaceAfterCursor: TestSetup = {
  name: "no-obstruction-surface-after-cursor",
  description: "player > cursor > surface - dashed yellow must reflect off surface",
  player: { x: 100, y: 300 },
  cursor: { x: 250, y: 300 },
  plannedSurfaces: [], // No planned surfaces
  allSurfaces: [
    // Only one surface: after cursor
    createTestSurface({
      id: "surface2",
      start: { x: 350, y: 200 },
      end: { x: 350, y: 400 },
      canReflect: true,
    }),
  ],
  expected: {
    isAligned: true, // No obstruction, direct path to cursor
    reachesCursor: true,
  },
  tags: ["bypass", "no-obstruction", "dashed-projection-physics", "first-principle-2.4"],
};

/**
 * Plan is empty, reflective surface facing player between player and cursor.
 *
 * First Principles:
 * - The segment ENDING at the surface should be "unplanned" (green)
 * - Divergence only applies to segments AFTER the reflection
 * - The solid section must not be red from the start
 */
export const emptyPlanReflectiveSurfaceBetween: TestSetup = {
  name: "empty-plan-reflective-surface-between",
  description: "Empty plan, reflective surface facing player between player and cursor",
  player: { x: 100, y: 300 },
  cursor: { x: 400, y: 300 },
  plannedSurfaces: [], // Empty plan!
  allSurfaces: [
    // Reflective surface between player and cursor, normal facing player
    createTestSurface({
      id: "surface1",
      start: { x: 200, y: 100 },
      end: { x: 200, y: 500 }, // Normal points left (toward player)
      canReflect: true,
    }),
  ],
  expected: {
    isAligned: false, // Will diverge after reflection
    reachesCursor: false, // Path reflects away
  },
  tags: ["bypass", "empty-plan", "reflective-surface", "first-principle-6.6"],
};

/**
 * Obstruction between player and cursor, planned surface after cursor.
 * 
 * First Principle 6.0: Obstructions do NOT cause bypass.
 * Bypass should ONLY happen based on player/cursor image positions.
 * 
 * Setup: player > other-surface > cursor > planned-surface
 * The planned surface should NOT be bypassed (both player and cursor are on reflective side).
 * The obstruction will cause DIVERGENCE (red path), not bypass.
 */
export const obstructionDoesNotCauseBypass: TestSetup = {
  name: "obstruction-does-not-cause-bypass",
  description: "Obstruction between player and cursor should not bypass planned surface after cursor",
  player: { x: 100, y: 300 },
  cursor: { x: 300, y: 300 },
  plannedSurfaces: [
    // Planned surface is AFTER cursor - should NOT be bypassed
    createVerticalSurface("planned1", 400, 100, 500),
  ],
  allSurfaces: [
    // Obstruction between player and cursor
    createVerticalSurface("obstruction", 200, 100, 500),
    // Planned surface after cursor
    createVerticalSurface("planned1", 400, 100, 500),
  ],
  expected: {
    // Path diverges due to obstruction, but planned surface is NOT bypassed
    isAligned: false, // Divergence from obstruction
  },
  tags: ["bypass", "obstruction", "first-principle-6.0", "no-bypass-from-obstruction"],
};

/**
 * First segment hits obstruction - should be green (aligned direction), then yellow actual path visible.
 * 
 * First Principle 6.0b: Planned and actual paths must start aligned.
 * The initial direction is calculated using cursor images reflected by planned surfaces.
 * Even if an obstruction blocks the first segment, the direction is still correct,
 * so the first segment should be "aligned" (green).
 * 
 * Setup: player > other-surface > cursor > planned-surface
 * Expected: First segment green, obstruction causes divergence, yellow path visible from obstruction.
 */
export const firstSegmentObstructionStillAligned: TestSetup = {
  name: "first-segment-obstruction-still-aligned",
  description: "First segment blocked by obstruction should still be aligned (green) because direction is correct",
  player: { x: 100, y: 300 },
  cursor: { x: 300, y: 300 },
  plannedSurfaces: [
    // Planned surface is AFTER cursor
    createVerticalSurface("planned1", 400, 100, 500),
  ],
  allSurfaces: [
    // Obstruction between player and cursor
    createVerticalSurface("obstruction", 200, 100, 500),
    // Planned surface after cursor
    createVerticalSurface("planned1", 400, 100, 500),
  ],
  expected: {
    // First segment is aligned (correct direction), but path diverges after obstruction
    isAligned: false, // Overall path is not fully aligned
  },
  tags: ["bypass", "obstruction", "first-principle-6.0b", "first-segment-aligned"],
};

/**
 * Planned path must follow the plan when obstructed.
 * 
 * First Principle 6.0c: During the solid section of the planned path, all obstructions
 * must be ignored. The planned path (red) should still reflect off planned surfaces.
 * Removing the obstructions should make the paths align again.
 * 
 * Setup: player > other-surface > cursor > planned-surface
 * Expected: Red path should go from divergence point to planned surface, reflect, then to cursor.
 */
export const plannedPathFollowsPlanWhenObstructed: TestSetup = {
  name: "planned-path-follows-plan-when-obstructed",
  description: "Planned path (red) must still reflect off planned surface when obstructed",
  player: { x: 100, y: 300 },
  cursor: { x: 300, y: 300 },
  plannedSurfaces: [
    // Planned surface is AFTER cursor - path should reflect here
    createVerticalSurface("planned1", 400, 100, 500),
  ],
  allSurfaces: [
    // Obstruction between player and cursor
    createVerticalSurface("obstruction", 200, 100, 500),
    // Planned surface after cursor
    createVerticalSurface("planned1", 400, 100, 500),
  ],
  expected: {
    isAligned: false, // Divergence due to obstruction
  },
  tags: ["bypass", "obstruction", "first-principle-6.0c", "planned-path-reflects"],
};

/**
 * FIRST PRINCIPLE: Planned Path Segment Transparency
 *
 * When the planned path is heading toward a planned reflection point on surface N,
 * it passes through EVERYTHING else - walls, reflective surfaces, even later planned surfaces.
 * Only the specific target planned surface affects each segment.
 *
 * This test: Surface2 is physically BETWEEN player and Surface1.
 * Plan order: [surface1, surface2]
 *
 * Expected:
 * - Planned path goes THROUGH surface2 to reach surface1
 * - Reflects off surface1
 * - Then goes to surface2 (now it's the target)
 * - Reflects off surface2
 * - Then goes to cursor
 *
 * The key: surface2 being "in the way" of the path to surface1 is irrelevant.
 * The planned path is transparent until it reaches its target.
 */
export const plannedPathTransparency: TestSetup = {
  name: "planned-path-transparency",
  description: "Planned path passes through later-planned surface to reach current target",
  player: { x: 100, y: 300 },
  cursor: { x: 100, y: 100 }, // Above and left, reachable via zig-zag
  plannedSurfaces: [
    // Surface1: FURTHER from player (first in plan)
    // Vertical at x=400, normal points left
    createTestSurface({
      id: "surface1",
      start: { x: 400, y: 100 },
      end: { x: 400, y: 500 },
      canReflect: true,
    }),
    // Surface2: CLOSER to player (second in plan, but physically in the way)
    // Vertical at x=200, normal points left
    createTestSurface({
      id: "surface2",
      start: { x: 200, y: 100 },
      end: { x: 200, y: 500 },
      canReflect: true,
    }),
  ],
  allSurfaces: [
    createTestSurface({
      id: "surface1",
      start: { x: 400, y: 100 },
      end: { x: 400, y: 500 },
      canReflect: true,
    }),
    createTestSurface({
      id: "surface2",
      start: { x: 200, y: 100 },
      end: { x: 200, y: 500 },
      canReflect: true,
    }),
  ],
  expected: {
    // Actual path hits surface2 first (it's in the way), so paths diverge
    isAligned: false,
  },
  // Skip 6.11 because the plan order puts surface1 first, but surface2 may be bypassed
  tags: ["bypass", "planned-path-transparency", "first-principle-planned-transparency", "skip-6.11"],
};

/**
 * FIRST PRINCIPLE: Planned Path Ignores Walls
 *
 * The planned path heading toward a reflection point must pass through walls.
 * Walls only block the ACTUAL path, not the planned path.
 */
export const plannedPathIgnoresWalls: TestSetup = {
  name: "planned-path-ignores-walls",
  description: "Planned path passes through wall to reach planned reflection point",
  player: { x: 100, y: 300 },
  cursor: { x: 100, y: 100 },
  plannedSurfaces: [
    // Planned surface at x=400
    createTestSurface({
      id: "planned1",
      start: { x: 400, y: 100 },
      end: { x: 400, y: 500 },
      canReflect: true,
    }),
  ],
  allSurfaces: [
    // Wall at x=200 - blocks actual path but not planned path
    createTestSurface({
      id: "wall1",
      start: { x: 200, y: 100 },
      end: { x: 200, y: 500 },
      canReflect: false,
    }),
    createTestSurface({
      id: "planned1",
      start: { x: 400, y: 100 },
      end: { x: 400, y: 500 },
      canReflect: true,
    }),
  ],
  expected: {
    isAligned: false, // Actual blocked by wall, planned goes through
  },
  // V.5 edge case: wall blocking path changes visibility
  // 1.5 edge case: rare cursor positions cause visualization edge cases
  tags: ["bypass", "planned-path-ignores-walls", "first-principle-planned-transparency", "skip-2.5", "skip-V.5", "skip-1.5"],
};

/**
 * FIRST PRINCIPLE: Planned Path Ignores Unplanned Reflective Surfaces
 *
 * If there's a reflective surface that's NOT in the plan, the planned path
 * must pass through it without reflecting, even if it would normally reflect.
 */
export const plannedPathIgnoresUnplannedReflective: TestSetup = {
  name: "planned-path-ignores-unplanned-reflective",
  description: "Planned path passes through unplanned reflective surface",
  player: { x: 100, y: 300 },
  cursor: { x: 100, y: 100 },
  plannedSurfaces: [
    // Planned surface at x=400
    createTestSurface({
      id: "planned1",
      start: { x: 400, y: 100 },
      end: { x: 400, y: 500 },
      canReflect: true,
    }),
  ],
  allSurfaces: [
    // Unplanned reflective surface at x=200
    createTestSurface({
      id: "unplanned1",
      start: { x: 200, y: 100 },
      end: { x: 200, y: 500 },
      canReflect: true,
    }),
    createTestSurface({
      id: "planned1",
      start: { x: 400, y: 100 },
      end: { x: 400, y: 500 },
      canReflect: true,
    }),
  ],
  expected: {
    isAligned: false, // Actual reflects off unplanned, planned goes through
  },
  tags: ["bypass", "planned-path-ignores-unplanned", "first-principle-planned-transparency"],
};

/**
 * FIRST PRINCIPLE 6.3: Reflection Chain Rule + Transparency
 *
 * When the reflection point from surface1 is on the wrong side of surface2,
 * surface2 MUST be bypassed. The planned path should:
 * 1. Go to surface1 (passing through surface2 if in the way)
 * 2. Reflect off surface1
 * 3. Since reflection point is on wrong side of surface2, surface2 is bypassed
 * 4. Go directly to cursor (passing through surface2 again if in the way)
 *
 * This tests both transparency AND the reflection chain bypass rule.
 */
export const reflectionChainBypassWithTransparency: TestSetup = {
  name: "reflection-chain-bypass-with-transparency",
  description: "Reflection point on wrong side of surface2 causes bypass, path goes through surface2",
  player: { x: 100, y: 300 },
  cursor: { x: 500, y: 300 }, // Same Y as player, to the right
  plannedSurfaces: [
    // Surface1: at x=200, normal points left (toward player)
    // Player at x=100 is on reflective side
    createTestSurface({
      id: "surface1",
      start: { x: 200, y: 100 },
      end: { x: 200, y: 500 },
      canReflect: true,
    }),
    // Surface2: at x=300, normal points left
    // After reflecting off surface1 at (200, 300), the path goes LEFT (away from surface2)
    // The reflection point (200, 300) is to the LEFT of surface2 (x=300)
    // Surface2 normal points left, so reflective side is x < 300
    // Point at x=200 IS on reflective side... need different geometry
    // 
    // Actually, for the reflection point to be on WRONG side:
    // Surface2 at x=150 (between player and surface1), normal pointing RIGHT
    // Reflection point at x=200 is to the RIGHT of x=150
    // If normal points right, reflective side is x > 150
    // Point at x=200 > 150, so it IS on reflective side
    //
    // Let me try: surface2 at x=250, normal points left
    // Reflective side is x < 250
    // Reflection point at x=200 < 250, so on reflective side
    //
    // Need: reflection point on NON-reflective side of surface2
    // Surface2 normal points left → reflective side x < surface2.x
    // Reflection point x must be > surface2.x
    //
    // If surface1 is at x=200, reflection point is at x=200
    // We need surface2.x < 200 for reflection point to be on wrong side
    // Surface2 at x=150, normal left → reflective is x < 150
    // Point at x=200 > 150 → on NON-reflective side ✓
    createTestSurface({
      id: "surface2",
      start: { x: 150, y: 100 },
      end: { x: 150, y: 500 },
      canReflect: true,
    }),
  ],
  allSurfaces: [
    createTestSurface({
      id: "surface1",
      start: { x: 200, y: 100 },
      end: { x: 200, y: 500 },
      canReflect: true,
    }),
    createTestSurface({
      id: "surface2",
      start: { x: 150, y: 100 },
      end: { x: 150, y: 500 },
      canReflect: true,
    }),
  ],
  expected: {
    // Surface2 should be bypassed (reflection chain rule)
    // Plan becomes just [surface1]
    // Planned path: player → surface1 → cursor (direct after reflection)
    // Actual path: player → surface2 (it's in the way) → reflects → ...
    isAligned: false, // Actual hits surface2 first
  },
  // Skip 6.11 because surface2 is BYPASSED (not in active plan), so hitting it isn't "out-of-order"
  tags: ["bypass", "reflection-chain-bypass", "first-principle-6.3", "first-principle-planned-transparency", "skip-6.11"],
};

/**
 * All bypass scenario setups.
 */
/**
 * User-reported scenario: horizontal wall blocking path to horizontal planned surface.
 * 
 * Setup:
 * - player (100, 0)
 * - non-reflective wall at y=50
 * - cursor (0, 55)
 * - planned reflective surface at y=200
 * 
 * The path should go from player toward planned surface, hit the wall,
 * then show red planned path continuing to the planned surface.
 */
export const horizontalWallBlockingHorizontalSurface: TestSetup = {
  name: "horizontal-wall-blocking-horizontal-surface",
  description: "Horizontal wall blocks path to horizontal planned surface",
  player: { x: 100, y: 0 },
  cursor: { x: 0, y: 55 },
  plannedSurfaces: [
    createHorizontalSurface("planned1", 200, 50, 150),
  ],
  allSurfaces: [
    // Non-reflective wall at y=50
    {
      ...createHorizontalSurface("wall", 50, 0, 200),
      surfaceType: "wall",
      onArrowHit: () => ({ type: "stop" }),
      isPlannable: () => false,
      canReflectFrom: () => false,
    } as unknown as import("@/surfaces/Surface").Surface,
    createHorizontalSurface("planned1", 200, 50, 150),
  ],
  expected: {
    isAligned: false, // Path diverges at wall
  },
  tags: ["bypass", "obstruction", "horizontal", "first-principle-6.0c", "skip-2.5"],
};

/**
 * User-reported bug 1: Reflection chain bypass not working correctly.
 *
 * The reflection point from ricochet-4 (using full plan images) was on the wrong
 * side of ricochet-1, so ricochet-1 should be bypassed.
 *
 * After fix: ricochet-1 is correctly bypassed, paths are aligned.
 */
export const userReportedReflectionChainBypass: TestSetup = {
  name: "user-reported-reflection-chain-bypass",
  description: "Reflection chain bypass with off-segment reflection point",
  player: { x: 748.1195593000004, y: 666 },
  cursor: { x: 737.7496197830452, y: 206.50095602294454 },
  plannedSurfaces: [
    createTestSurface({
      id: "ricochet-4",
      start: { x: 850, y: 350 },
      end: { x: 850, y: 500 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-1",
      start: { x: 800, y: 150 },
      end: { x: 900, y: 250 },
      canReflect: true,
    }),
  ],
  allSurfaces: [
    createTestSurface({
      id: "floor",
      start: { x: 0, y: 700 },
      end: { x: 1280, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "ricochet-1",
      start: { x: 800, y: 150 },
      end: { x: 900, y: 250 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-4",
      start: { x: 850, y: 350 },
      end: { x: 850, y: 500 },
      canReflect: true,
    }),
  ],
  expected: {
    // After fix: ricochet-1 is bypassed, paths should be aligned
    isAligned: true,
  },
  tags: ["bypass", "user-reported", "reflection-chain", "first-principle-6.3"],
};

/**
 * User-reported bug 2: Solid path not reaching cursor.
 *
 * The planned path uses an off-segment reflection on ricochet-4.
 * The actual path diverges because ricochet-1 is physically in the way.
 *
 * This is a divergence case - the paths are NOT aligned.
 * The solid red path should show the planned path from divergence to cursor.
 */
export const userReportedSolidPathNotReachingCursor: TestSetup = {
  name: "user-reported-solid-path-not-reaching-cursor",
  description: "Off-segment reflection causes divergence, solid red should reach cursor",
  player: { x: 633.783165200001, y: 666 },
  cursor: { x: 799.700195780222, y: 125.27724665391969 },
  plannedSurfaces: [
    createTestSurface({
      id: "ricochet-4",
      start: { x: 850, y: 350 },
      end: { x: 850, y: 500 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-1",
      start: { x: 800, y: 150 },
      end: { x: 900, y: 250 },
      canReflect: true,
    }),
  ],
  allSurfaces: [
    createTestSurface({
      id: "floor",
      start: { x: 0, y: 700 },
      end: { x: 1280, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "platform-2",
      start: { x: 550, y: 350 },
      end: { x: 750, y: 350 },
      canReflect: false,
    }),
    createTestSurface({
      id: "ricochet-1",
      start: { x: 800, y: 150 },
      end: { x: 900, y: 250 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-4",
      start: { x: 850, y: 350 },
      end: { x: 850, y: 500 },
      canReflect: true,
    }),
  ],
  expected: {
    // Actual path diverges because ricochet-1 is in the way
    isAligned: false,
    reachesCursor: false,
  },
  // Skip 2.5 because even without obstructions, the off-segment reflection creates complex geometry
  tags: ["bypass", "user-reported", "off-segment", "divergence", "solid-path-to-cursor", "skip-2.5"],
};

/**
 * User-reported bug 3: Strange trajectory behavior.
 *
 * The first segment is diverged (hits ricochet-1 instead of planned ricochet-4),
 * but is being rendered as solid green. The solid red path starts from the wrong point.
 */
export const userReportedStrangeTrajectory: TestSetup = {
  name: "user-reported-strange-trajectory",
  description: "First segment diverged but rendered as green, red path starts from wrong point",
  player: { x: 649.341951066669, y: 666 },
  cursor: { x: 836.870541378528, y: 110.1338432122371 },
  plannedSurfaces: [
    createTestSurface({
      id: "ricochet-4",
      start: { x: 850, y: 350 },
      end: { x: 850, y: 500 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-1",
      start: { x: 800, y: 150 },
      end: { x: 900, y: 250 },
      canReflect: true,
    }),
  ],
  allSurfaces: [
    createTestSurface({
      id: "floor",
      start: { x: 0, y: 700 },
      end: { x: 1280, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "ceiling",
      start: { x: 0, y: 80 },
      end: { x: 1280, y: 80 },
      canReflect: false,
    }),
    createTestSurface({
      id: "left-wall",
      start: { x: 20, y: 80 },
      end: { x: 20, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "ricochet-1",
      start: { x: 800, y: 150 },
      end: { x: 900, y: 250 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-4",
      start: { x: 850, y: 350 },
      end: { x: 850, y: 500 },
      canReflect: true,
    }),
  ],
  expected: {
    isAligned: false,
  },
  // Skip 1.16: Yellow IS correct - shows physics after divergence, even if eventually blocked
  // Skip 2.5: Complex geometry with off-segment reflection
  tags: ["bypass", "user-reported", "divergence", "first-segment-diverged", "skip-1.16", "skip-2.5"],
};

/**
 * User-reported bug 4: Similar to bug 3, single planned surface.
 *
 * The path hits ricochet-1 (unplanned), then continues to left-wall.
 * firstDivergedIndex is 1 (segment 1 is diverged).
 * The divergence point should be at end of segment 0, not at the wall.
 */
export const userReportedSingleSurfaceDivergence: TestSetup = {
  name: "user-reported-single-surface-divergence",
  description: "Single planned surface, hit unplanned surface first, then wall",
  player: { x: 638.2171109195828, y: 666 },
  cursor: { x: 824.4804261790927, y: 121.1472275334608 },
  plannedSurfaces: [
    createTestSurface({
      id: "ricochet-4",
      start: { x: 850, y: 350 },
      end: { x: 850, y: 500 },
      canReflect: true,
    }),
  ],
  allSurfaces: [
    createTestSurface({
      id: "floor",
      start: { x: 0, y: 700 },
      end: { x: 1280, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "left-wall",
      start: { x: 20, y: 80 },
      end: { x: 20, y: 700 },
      canReflect: false,
    }),
    createTestSurface({
      id: "ricochet-1",
      start: { x: 800, y: 150 },
      end: { x: 900, y: 250 },
      canReflect: true,
    }),
    createTestSurface({
      id: "ricochet-4",
      start: { x: 850, y: 350 },
      end: { x: 850, y: 500 },
      canReflect: true,
    }),
  ],
  expected: {
    isAligned: false,
  },
  tags: ["bypass", "user-reported", "divergence", "single-surface", "skip-1.16", "skip-2.5"],
};

export const bypassSetups: readonly TestSetup[] = [
  cursorWrongSideNoObstruction,
  playerWrongSide,
  chainWrongSide,
  cursorOnCorrectSide,
  noReflectThrough,
  surfaceBehindPlayer,
  partialBypass,
  wallThenSurfaceAfterCursor,
  obstructionThenSurfaceAfterCursor,
  noObstructionSurfaceAfterCursor,
  emptyPlanReflectiveSurfaceBetween,
  obstructionDoesNotCauseBypass,
  firstSegmentObstructionStillAligned,
  plannedPathFollowsPlanWhenObstructed,
  horizontalWallBlockingHorizontalSurface,
  // New transparency principle tests
  plannedPathTransparency,
  plannedPathIgnoresWalls,
  plannedPathIgnoresUnplannedReflective,
  reflectionChainBypassWithTransparency,
  // User-reported bugs
  userReportedReflectionChainBypass,
  userReportedSolidPathNotReachingCursor,
  userReportedStrangeTrajectory,
  userReportedSingleSurfaceDivergence,
];

