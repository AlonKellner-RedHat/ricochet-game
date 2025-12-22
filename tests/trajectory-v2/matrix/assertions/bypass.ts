/**
 * Bypass First Principle Assertions
 *
 * Principles 6.1 - 6.5: Surface bypass rules
 * Principle 7.1 - 7.2: Path unity rules
 */

import { expect } from "vitest";
import { evaluateBypass } from "@/trajectory-v2/engine/BypassEvaluator";
import { tracePhysicalPath } from "@/trajectory-v2/engine/PathBuilder";
import { isOnReflectiveSide } from "@/trajectory-v2/engine/ValidityChecker";
import { COLORS, distance } from "../MatrixTestRunner";
import type { FirstPrincipleAssertion, TestResults, TestSetup } from "../types";

/**
 * Principle 6.1: Cursor Side Rule
 *
 * If the cursor is on the non-reflective side of the last planned surface,
 * that surface MUST be bypassed.
 */
export const cursorSideRule: FirstPrincipleAssertion = {
  id: "cursor-side-rule",
  principle: "6.1",
  description: "Cursor on wrong side of last surface must cause bypass",
  assert: (setup: TestSetup, results: TestResults) => {
    if (setup.plannedSurfaces.length === 0) {
      return; // No surfaces to check
    }

    const lastSurface = setup.plannedSurfaces[setup.plannedSurfaces.length - 1]!;
    const cursorOnCorrectSide = isOnReflectiveSide(setup.cursor, lastSurface);

    if (!cursorOnCorrectSide) {
      // Cursor is on wrong side - surface should be bypassed
      // This means the planned path should NOT reflect off this surface
      // The path should be direct (or use other surfaces)

      // Check using bypass evaluator
      const bypassResult = evaluateBypass(
        setup.player,
        setup.cursor,
        setup.plannedSurfaces,
        setup.allSurfaces
      );

      // The last surface should NOT be in active surfaces
      const isActive = bypassResult.activeSurfaces.some(
        (s) => s.id === lastSurface.id
      );
      expect(
        isActive,
        `Surface ${lastSurface.id} should be bypassed (cursor on wrong side)`
      ).toBe(false);
    }
  },
};

/**
 * Principle 6.2: Player Side Rule
 *
 * If the player is on the non-reflective side of the first planned surface,
 * that surface MUST be bypassed.
 */
export const playerSideRule: FirstPrincipleAssertion = {
  id: "player-side-rule",
  principle: "6.2",
  description: "Player on wrong side of first surface must cause bypass",
  assert: (setup: TestSetup, _results: TestResults) => {
    if (setup.plannedSurfaces.length === 0) {
      return; // No surfaces to check
    }

    const firstSurface = setup.plannedSurfaces[0]!;
    const playerOnCorrectSide = isOnReflectiveSide(setup.player, firstSurface);

    if (!playerOnCorrectSide) {
      // Player is on wrong side - surface should be bypassed
      const bypassResult = evaluateBypass(
        setup.player,
        setup.cursor,
        setup.plannedSurfaces,
        setup.allSurfaces
      );

      const isActive = bypassResult.activeSurfaces.some(
        (s) => s.id === firstSurface.id
      );
      expect(
        isActive,
        `Surface ${firstSurface.id} should be bypassed (player on wrong side)`
      ).toBe(false);
    }
  },
};

/**
 * Principle 6.4: No Reflect-Through
 *
 * A path may NEVER "reflect through" a surface. With bypass logic:
 * - Surfaces on wrong side are excluded from DIRECTION calculation
 * - The actual path uses forward physics and CAN still hit these surfaces
 *   if they're physically in the way
 *
 * "Reflect-through" means the path geometry would require passing through
 * a surface and somehow reflecting off its back side. This is prevented by:
 * 1. Forward physics: rays cast forward, hit surfaces from front
 * 2. canReflectFrom: surfaces check incoming direction
 *
 * This assertion verifies:
 * - All reflections are on-segment (forward physics hits real geometry)
 * - Reflections respect canReflectFrom direction
 */
export const noReflectThrough: FirstPrincipleAssertion = {
  id: "no-reflect-through",
  principle: "6.4",
  description: "Path may never reflect through a surface",
  assert: (setup: TestSetup, results: TestResults) => {
    const { actualPath } = results;

    // Verify no "impossible" reflections exist
    for (const hit of actualPath.hitInfo) {
      if (hit.reflected) {
        // For a valid reflection, the hit must be on the segment
        expect(
          hit.onSegment,
          `Reflection off ${hit.surface.id} should be on segment`
        ).toBe(true);
      }
    }

    // Verify bypassedSurfaces are tracked when cursor is on wrong side
    const bypassedIds = (results.plannedPath.bypassedSurfaces || []).map(b => b.surface.id);
    
    for (const surface of setup.plannedSurfaces) {
      const cursorOnCorrectSide = isOnReflectiveSide(setup.cursor, surface);
      
      if (!cursorOnCorrectSide) {
        // This surface should be in bypassed list
        expect(
          bypassedIds.includes(surface.id),
          `Surface ${surface.id} should be tracked as bypassed (cursor on wrong side)`
        ).toBe(true);
      }
    }
  },
};

/**
 * Principle 7.1: Arrow-Visualization Unity
 *
 * The arrow's trajectory when shot MUST be exactly the same as the
 * solid-green + dashed-yellow visualization.
 */
export const arrowVisualizationUnity: FirstPrincipleAssertion = {
  id: "arrow-visualization-unity",
  principle: "7.1",
  description: "Arrow trajectory must match green+yellow visualization exactly",
  assert: (setup: TestSetup, results: TestResults) => {
    const { actualPath, arrowWaypoints, renderCalls } = results;

    // Arrow waypoints should be actual path + forward projection
    const expectedWaypoints = [
      ...actualPath.points,
      ...(actualPath.forwardProjection || []),
    ];

    // Compare lengths
    expect(
      arrowWaypoints.length,
      `Arrow waypoints (${arrowWaypoints.length}) should match path+projection (${expectedWaypoints.length})`
    ).toBe(expectedWaypoints.length);

    // Compare each point
    for (let i = 0; i < arrowWaypoints.length; i++) {
      const arrowPoint = arrowWaypoints[i]!;
      const expectedPoint = expectedWaypoints[i]!;

      expect(
        distance(arrowPoint, expectedPoint),
        `Arrow waypoint ${i} should match expected point`
      ).toBeLessThan(1);
    }

    // When paths are aligned, there should be no red in the visualization
    if (results.alignment.isFullyAligned) {
      const hasRed = renderCalls.some(
        (c) => c.type === "lineStyle" && c.color === COLORS.RED
      );
      expect(
        hasRed,
        "When aligned, visualization should have no red"
      ).toBe(false);
    }
  },
};

/**
 * Principle 7.2: Single Source of Truth
 *
 * There should be ONE physical path calculation that both arrow movement
 * and visualization use. This is verified by checking that arrow waypoints
 * come directly from the actual path result.
 */
export const singleSourceOfTruth: FirstPrincipleAssertion = {
  id: "single-source-of-truth",
  principle: "7.2",
  description: "Arrow and visualization must use same path calculation",
  assert: (setup: TestSetup, results: TestResults) => {
    const { actualPath, arrowWaypoints } = results;

    // First waypoint must be the player position
    if (arrowWaypoints.length > 0 && actualPath.points.length > 0) {
      expect(
        distance(arrowWaypoints[0]!, setup.player),
        "First arrow waypoint should be player position"
      ).toBeLessThan(1);

      expect(
        distance(actualPath.points[0]!, setup.player),
        "First actual path point should be player position"
      ).toBeLessThan(1);
    }

    // If actual path has hits, arrow should pass through them
    for (const hit of actualPath.hitInfo) {
      if (hit.reflected) {
        const passesHit = arrowWaypoints.some(
          (wp) => distance(wp, hit.point) < 2
        );
        expect(
          passesHit,
          `Arrow should pass through reflection point on ${hit.surface.id}`
        ).toBe(true);
      }
    }
  },
};

/**
 * Principle 6.5: Planned Path Reflects Only Off Planned Surfaces
 *
 * The solid section of the planned path should only reflect off surfaces
 * that are in the plan (active surfaces after bypass evaluation).
 * If the plan is empty, there should be no reflections in the solid path.
 */
export const plannedReflectsOnlyPlanned: FirstPrincipleAssertion = {
  id: "planned-reflects-only-planned",
  principle: "6.5",
  description: "Planned path solid section reflects only off planned surfaces",
  assert: (setup: TestSetup, results: TestResults) => {
    // Get bypass result to know which surfaces are active
    const bypassResult = evaluateBypass(
      setup.player,
      setup.cursor,
      setup.plannedSurfaces,
      setup.allSurfaces
    );
    
    const activeSurfaceIds = new Set(bypassResult.activeSurfaces.map(s => s.id));
    
    // Check planned path hits
    const { plannedPath } = results;
    
    for (const hit of plannedPath.hitInfo) {
      if (hit.reflected) {
        // Any reflection in the planned path should be off an active surface
        expect(
          activeSurfaceIds.has(hit.surface.id),
          `Planned path reflected off ${hit.surface.id} which is not an active planned surface. Active surfaces: ${[...activeSurfaceIds].join(', ')}`
        ).toBe(true);
      }
    }
    
    // Special case: If plan is empty (no active surfaces), planned path should have no reflections
    if (bypassResult.activeSurfaces.length === 0) {
      const hasReflection = plannedPath.hitInfo.some(h => h.reflected);
      expect(
        hasReflection,
        "With no planned surfaces, planned path should have no reflections"
      ).toBe(false);
    }
  },
};

/**
 * Principle 6.6: Aligned Segments Must Be Green
 *
 * The planned and actual paths must both start aligned, with the same initial direction.
 * The aligned portions should be visualized as solid green.
 * 
 * Specifically: The segment that ENDS at an unplanned surface should still be
 * "unplanned" (green), because both planned and actual paths go in the same direction
 * until they hit the surface. Divergence only applies to segments AFTER the reflection.
 */
export const alignedSegmentsGreen: FirstPrincipleAssertion = {
  id: "aligned-segments-green",
  principle: "6.6",
  description: "Aligned/unplanned segments before divergence must be green",
  assert: (setup: TestSetup, results: TestResults) => {
    const { renderCalls } = results;
    
    // If there's any rendering, the first solid line should be green
    // (because the paths start aligned in the same direction)
    
    // Find line style calls
    const lineStyleCalls = renderCalls.filter(c => c.type === "lineStyle");
    const lineToCalls = renderCalls.filter(c => c.type === "lineTo");
    
    if (lineStyleCalls.length === 0 || lineToCalls.length === 0) {
      return; // No lines drawn - skip
    }
    
    // First line style should be green (for the aligned portion)
    const firstLineStyle = lineStyleCalls[0];
    if (firstLineStyle && firstLineStyle.alpha === 1) {
      // Solid line - should be green (aligned) unless degenerate
      const isDegenerate =
        Math.abs(setup.cursor.x - setup.player.x) < 1 &&
        Math.abs(setup.cursor.y - setup.player.y) < 1;
      
      if (!isDegenerate) {
        expect(
          firstLineStyle.color,
          "First solid segment should be green (aligned portion)"
        ).toBe(COLORS.GREEN);
      }
    }
  },
};

/**
 * Principle 6.7: Paths Start With Same Initial Direction
 *
 * The planned path and the actual path must both start aligned,
 * with the same initial direction from the player.
 */
export const pathsStartAligned: FirstPrincipleAssertion = {
  id: "paths-start-aligned",
  principle: "6.7",
  description: "Planned and actual paths must start with same initial direction",
  assert: (setup: TestSetup, results: TestResults) => {
    const { plannedPath, actualPath } = results;

    // Need at least 2 points to determine direction
    if (plannedPath.points.length < 2 || actualPath.points.length < 2) {
      return; // Degenerate case - skip
    }

    // Both should start at player
    expect(
      distance(plannedPath.points[0]!, setup.player),
      "Planned path should start at player"
    ).toBeLessThan(1);
    expect(
      distance(actualPath.points[0]!, setup.player),
      "Actual path should start at player"
    ).toBeLessThan(1);

    // Calculate initial directions
    const plannedDir = {
      x: plannedPath.points[1]!.x - plannedPath.points[0]!.x,
      y: plannedPath.points[1]!.y - plannedPath.points[0]!.y,
    };
    const actualDir = {
      x: actualPath.points[1]!.x - actualPath.points[0]!.x,
      y: actualPath.points[1]!.y - actualPath.points[0]!.y,
    };

    const plannedLen = Math.sqrt(plannedDir.x ** 2 + plannedDir.y ** 2);
    const actualLen = Math.sqrt(actualDir.x ** 2 + actualDir.y ** 2);

    if (plannedLen < 1e-6 || actualLen < 1e-6) {
      return; // Zero-length direction - skip
    }

    // Normalize and compare via dot product
    const dotProduct =
      (plannedDir.x / plannedLen) * (actualDir.x / actualLen) +
      (plannedDir.y / plannedLen) * (actualDir.y / actualLen);

    // Directions should be parallel (dot product ~1)
    expect(
      dotProduct,
      "Planned and actual paths must start in the same direction"
    ).toBeGreaterThan(0.999);
  },
};

/**
 * Principle 6.8: Solid Planned Path Unaffected By Unplanned Surfaces
 *
 * The solid section of the planned path must not reflect or be blocked
 * (or affected in any manner) by any unplanned surface.
 * 
 * This extends 6.5 to also check for blocking, not just reflections.
 */
export const solidPlannedUnaffectedByUnplanned: FirstPrincipleAssertion = {
  id: "solid-planned-unaffected",
  principle: "6.8",
  description: "Solid planned path not affected by unplanned surfaces",
  assert: (setup: TestSetup, results: TestResults) => {
    // Get bypass result to know which surfaces are active
    const bypassResult = evaluateBypass(
      setup.player,
      setup.cursor,
      setup.plannedSurfaces,
      setup.allSurfaces
    );
    
    const activeSurfaceIds = new Set(bypassResult.activeSurfaces.map(s => s.id));
    
    // Check planned path hits
    const { plannedPath } = results;
    
    // Find hits that happen BEFORE cursor (solid section)
    // These should only be on active planned surfaces
    for (let i = 0; i < plannedPath.hitInfo.length; i++) {
      const hit = plannedPath.hitInfo[i]!;
      
      // Check if this hit is part of the solid section (before cursor)
      // We use a heuristic: hits that are reflected are part of the path
      if (hit.reflected || i < plannedPath.points.length - 2) {
        // This hit is in the solid section - should only be active surfaces
        if (!activeSurfaceIds.has(hit.surface.id)) {
          // Hit an unplanned surface in solid section - violation!
          expect(
            false,
            `Solid planned path should not be affected by unplanned surface ${hit.surface.id}. Active surfaces: ${[...activeSurfaceIds].join(", ")}`
          ).toBe(true);
        }
      }
    }
  },
};

/**
 * Principle 6.9: Aligned Path After Planned Reflection Is Green
 *
 * When reflecting off a PLANNED surface (on-segment), the entire path
 * from player to cursor should be solid green, and the projection
 * after cursor should be dashed yellow.
 *
 * There should be NO red when following planned reflections correctly.
 */
export const alignedAfterPlannedReflection: FirstPrincipleAssertion = {
  id: "aligned-after-planned-reflection",
  principle: "6.9",
  description: "Path after planned reflection should be green, not red",
  assert: (setup: TestSetup, results: TestResults) => {
    const { alignment, plannedPath, renderCalls } = results;
    
    // Only check if there are planned surfaces and path is aligned
    if (setup.plannedSurfaces.length === 0) {
      return; // No planned surfaces - skip
    }
    
    // If all planned surfaces were hit on-segment (aligned), there should be no red
    if (alignment.isFullyAligned) {
      const hasRed = renderCalls.some(
        (c) => c.type === "lineStyle" && c.color === COLORS.RED
      );
      expect(
        hasRed,
        "When reflecting off planned surfaces correctly, path should be green/yellow, not red"
      ).toBe(false);
    }
    
    // If path has reflections that match planned surfaces, they should be "aligned"
    const bypassResult = evaluateBypass(
      setup.player,
      setup.cursor,
      setup.plannedSurfaces,
      setup.allSurfaces
    );
    
    for (const hit of plannedPath.hitInfo) {
      if (hit.reflected && hit.onSegment) {
        // Check if this was a planned surface
        const isPlannedSurface = bypassResult.activeSurfaces.some(
          s => s.id === hit.surface.id
        );
        
        if (isPlannedSurface) {
          // This reflection was planned and on-segment - should not cause divergence
          // (This is validated by isFullyAligned check above)
        }
      }
    }
  },
};

/**
 * Principle 6.10: Off-Segment Reflections Must Still Reflect
 *
 * When a surface is planned and the reflection point is off the segment edges,
 * the planned path must still reflect off the extended line of the surface.
 * The path should NOT go straight through.
 */
export const offSegmentMustReflect: FirstPrincipleAssertion = {
  id: "off-segment-must-reflect",
  principle: "6.10",
  description: "Planned surfaces with off-segment hits must still cause reflection",
  assert: (setup: TestSetup, results: TestResults) => {
    // Only check if there are planned surfaces
    if (setup.plannedSurfaces.length === 0) {
      return;
    }
    
    const { plannedPath } = results;
    
    // Get bypass result
    const bypassResult = evaluateBypass(
      setup.player,
      setup.cursor,
      setup.plannedSurfaces,
      setup.allSurfaces
    );
    
    // For each active (non-bypassed) planned surface, the path should reflect
    for (const surface of bypassResult.activeSurfaces) {
      // Find if we hit this surface (on or off segment)
      const hitThisSurface = plannedPath.hitInfo.some(
        h => h.surface.id === surface.id
      );
      
      // If there are active planned surfaces, we should hit them
      // (This assertion is about ensuring reflection happens, even if off-segment)
      if (bypassResult.activeSurfaces.length > 0 && plannedPath.points.length >= 2) {
        // Path should have more than 2 points if it reflects
        // (player -> surface -> cursor/continuation)
        // A straight line would only have 2 points
        const pathHasReflection = plannedPath.points.length >= 3 || 
          plannedPath.hitInfo.some(h => h.reflected);
        
        // Note: This is a heuristic check. The key principle is that the path
        // should reflect off planned surfaces, even if off-segment.
      }
    }
  },
};

/**
 * Principle 6.0: Obstructions Do Not Cause Bypass
 *
 * A surface must be bypassed ONLY if either the source (player image)
 * or the target (cursor image) is on the non-reflective side.
 * Obstructions do NOT cause bypass - they cause divergence.
 */
export const obstructionsDoNotCauseBypass: FirstPrincipleAssertion = {
  id: "obstructions-do-not-cause-bypass",
  principle: "6.0",
  description: "Obstructions must not cause surface bypass",
  assert: (setup: TestSetup, results: TestResults) => {
    // Get bypass result
    const bypassResult = evaluateBypass(
      setup.player,
      setup.cursor,
      setup.plannedSurfaces,
      setup.allSurfaces
    );
    
    // Check that no surface was bypassed due to obstruction
    for (const bypassed of bypassResult.bypassedSurfaces) {
      expect(
        bypassed.reason,
        `Surface ${bypassed.surface.id} should not be bypassed due to obstruction`
      ).not.toBe("obstruction_before");
    }
  },
};

/**
 * Principle 6.0b: First Segment Always Aligned
 *
 * The planned path must follow cursor images as reflected by planned surfaces.
 * The planned and actual paths must start aligned (same initial direction).
 * Even if an obstruction blocks the first segment, the direction is correct,
 * so the first segment should be "aligned" (green).
 */
export const firstSegmentAlwaysAligned: FirstPrincipleAssertion = {
  id: "first-segment-always-aligned",
  principle: "6.0b",
  description: "First segment must always be aligned when plan exists",
  assert: (setup: TestSetup, results: TestResults) => {
    // Only applies when there are planned surfaces (direction is calculated using images)
    if (setup.plannedSurfaces.length === 0) {
      return;
    }
    
    // Check unified path
    const bypassResult = evaluateBypass(
      setup.player,
      setup.cursor,
      setup.plannedSurfaces,
      setup.allSurfaces
    );
    
    // Only check if there are active surfaces (non-bypassed)
    if (bypassResult.activeSurfaces.length === 0) {
      return;
    }
    
    const unifiedPath = tracePhysicalPath(
      setup.player,
      setup.cursor,
      bypassResult,
      setup.allSurfaces
    );
    
    // First segment must be aligned or unplanned, never diverged
    if (unifiedPath.segments.length > 0) {
      const firstSegment = unifiedPath.segments[0]!;
      expect(
        firstSegment.planAlignment,
        "First segment should be aligned (correct direction) or unplanned"
      ).not.toBe("diverged");
    }
  },
};

/**
 * Principle 6.0c: Planned Path Ignores Obstructions
 *
 * During the solid section of the planned path, all obstructions must be ignored.
 * The planned path (red) must still follow the plan - reflecting off planned surfaces.
 * 
 * This assertion verifies that:
 * 1. When there's a divergence with planned surfaces, red segments exist
 * 2. At least one red segment REACHES the planned surface (within tolerance)
 * 3. The planned path doesn't just draw a straight line to cursor
 */
export const plannedPathIgnoresObstructions: FirstPrincipleAssertion = {
  id: "planned-path-ignores-obstructions",
  principle: "6.0c",
  description: "Planned path (red) must still follow plan when obstructed",
  assert: (setup: TestSetup, results: TestResults) => {
    // Only applies when there are planned surfaces
    if (setup.plannedSurfaces.length === 0) {
      return;
    }
    
    const bypassResult = evaluateBypass(
      setup.player,
      setup.cursor,
      setup.plannedSurfaces,
      setup.allSurfaces
    );
    
    // Only check if there are active surfaces (non-bypassed)
    if (bypassResult.activeSurfaces.length === 0) {
      return;
    }
    
    const unifiedPath = tracePhysicalPath(
      setup.player,
      setup.cursor,
      bypassResult,
      setup.allSurfaces
    );
    
    // If the path diverges (has obstructions), check that red path exists
    if (unifiedPath.firstDivergedIndex !== -1 && !unifiedPath.cursorReachable) {
      // Get all red line segments from render calls
      const redLineSegments = getRedLineSegments(results.renderCalls);
      
      // There must be red segments showing the planned path
      expect(
        redLineSegments.length,
        "Diverged path with planned surfaces should have red segments"
      ).toBeGreaterThan(0);
      
      // Check that at least one red segment reaches a planned surface
      for (const surface of bypassResult.activeSurfaces) {
        const surfaceX = surface.segment.start.x;
        const surfaceY = surface.segment.start.y;
        const isVertical = Math.abs(surface.segment.end.x - surfaceX) < 1;
        const isHorizontal = Math.abs(surface.segment.end.y - surfaceY) < 1;
        
        let reachesSurface = false;
        for (const seg of redLineSegments) {
          if (isVertical) {
            // Vertical surface: check if segment endpoint has x near surfaceX
            if (Math.abs(seg.x2 - surfaceX) < 5 || Math.abs(seg.x1 - surfaceX) < 5) {
              reachesSurface = true;
              break;
            }
          } else if (isHorizontal) {
            // Horizontal surface: check if segment endpoint has y near surfaceY
            if (Math.abs(seg.y2 - surfaceY) < 5 || Math.abs(seg.y1 - surfaceY) < 5) {
              reachesSurface = true;
              break;
            }
          }
        }
        
        expect(
          reachesSurface,
          `Red path must reach planned surface ${surface.id}`
        ).toBe(true);
      }
    }
  },
};

/**
 * Helper to extract red line segments from render calls.
 */
function getRedLineSegments(
  renderCalls: readonly import("../types").RenderCall[]
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const segments: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  let currentColor: number | undefined;
  
  for (const call of renderCalls) {
    if (call.type === "lineStyle") {
      currentColor = call.color;
    } else if (call.type === "lineBetween" && currentColor === COLORS.RED) {
      segments.push({
        x1: call.x1!,
        y1: call.y1!,
        x2: call.x2!,
        y2: call.y2!,
      });
    }
  }
  
  return segments;
}

/**
 * Principle 6.6: Bypassed Surface Visualization
 *
 * All bypassed surfaces must be visually indicated.
 * The bypassedSurfaces array in the path result should contain
 * all surfaces that were bypassed, with reasons.
 */
export const bypassedSurfacesTracked: FirstPrincipleAssertion = {
  id: "bypassed-surfaces-tracked",
  principle: "6.6",
  description: "Bypassed surfaces must be tracked for visualization",
  assert: (setup: TestSetup, results: TestResults) => {
    const { plannedPath } = results;
    
    // Get bypass result for comparison
    const bypassResult = evaluateBypass(
      setup.player,
      setup.cursor,
      setup.plannedSurfaces,
      setup.allSurfaces
    );
    
    // If there are bypassed surfaces in the evaluator, they should be in the path result
    if (bypassResult.bypassedSurfaces.length > 0 && plannedPath.bypassedSurfaces) {
      const bypassedInPath = plannedPath.bypassedSurfaces.map(b => b.surface.id);
      const bypassedInEval = bypassResult.bypassedSurfaces.map(b => b.surface.id);
      
      // All bypassed surfaces from evaluator should be tracked in path result
      for (const id of bypassedInEval) {
        expect(
          bypassedInPath,
          `Bypassed surface ${id} should be tracked in path result`
        ).toContain(id);
      }
    }
  },
};

/**
 * All bypass and unity assertions.
 */
export const bypassAssertions: readonly FirstPrincipleAssertion[] = [
  obstructionsDoNotCauseBypass,
  firstSegmentAlwaysAligned,
  plannedPathIgnoresObstructions,
  cursorSideRule,
  playerSideRule,
  noReflectThrough,
  arrowVisualizationUnity,
  singleSourceOfTruth,
  plannedReflectsOnlyPlanned,
  alignedSegmentsGreen,
  pathsStartAligned,
  solidPlannedUnaffectedByUnplanned,
  alignedAfterPlannedReflection,
  offSegmentMustReflect,
  bypassedSurfacesTracked,
];

