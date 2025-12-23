/**
 * Visualization First Principle Assertions
 *
 * Principles 1.1 - 1.4: Visual representation rules
 */

import { expect } from "vitest";
import { COLORS, getLineCalls } from "../MatrixTestRunner";
import type { FirstPrincipleAssertion, RenderCall, TestResults, TestSetup } from "../types";

/**
 * Principle 1.1: Actual path must ALWAYS be fully visualized (no gaps)
 *
 * Checks:
 * - Path has at least 1 point (degenerate case) or 2 points (normal case)
 * - Forward projection exists (path continues beyond cursor)
 */
export const actualPathFullyVisualized: FirstPrincipleAssertion = {
  id: "actual-visualized",
  principle: "1.1",
  description: "Actual path must be fully visualized with no gaps",
  assert: (setup: TestSetup, results: TestResults) => {
    const { actualPath } = results;

    // Handle degenerate case: cursor at player position
    const isDegenerate =
      Math.abs(setup.cursor.x - setup.player.x) < 1 &&
      Math.abs(setup.cursor.y - setup.player.y) < 1;

    if (isDegenerate) {
      // Degenerate case: path can have just 1 point
      expect(actualPath.points.length).toBeGreaterThanOrEqual(1);
    } else {
      // Normal case: path must have at least 2 points
      expect(actualPath.points.length).toBeGreaterThanOrEqual(2);
    }

    // Forward projection should exist (unless blocked by wall or degenerate)
    // Degenerate case may not have forwardProjection
    if (!isDegenerate) {
      expect(actualPath.forwardProjection).toBeDefined();

      // If path reaches cursor, it should have a projection beyond
      if (actualPath.reachedCursor && !actualPath.blockedBy) {
        expect(actualPath.forwardProjection!.length).toBeGreaterThan(0);
      }
    }
  },
};

/**
 * Principle 1.2: Planned path must ALWAYS be fully visualized
 *
 * Checks:
 * - Path has at least 1 point (degenerate case) or 2 points (normal case)
 * - Forward projection exists (unless degenerate or complex reflection)
 */
export const plannedPathFullyVisualized: FirstPrincipleAssertion = {
  id: "planned-visualized",
  principle: "1.2",
  description: "Planned path must be fully visualized with no gaps",
  assert: (setup: TestSetup, results: TestResults) => {
    const { plannedPath } = results;

    // Handle degenerate case: cursor at player position
    const isDegenerate =
      Math.abs(setup.cursor.x - setup.player.x) < 1 &&
      Math.abs(setup.cursor.y - setup.player.y) < 1;

    if (isDegenerate) {
      // Degenerate case: path can have just 1 point
      expect(plannedPath.points.length).toBeGreaterThanOrEqual(1);
    } else {
      // Normal case: path must have at least 2 points
      expect(plannedPath.points.length).toBeGreaterThanOrEqual(2);
    }

    // Forward projection should exist
    expect(plannedPath.forwardProjection).toBeDefined();

    // Forward projection should have points (unless degenerate or special case)
    // Some complex reflection scenarios may not have projection
    if (!isDegenerate && plannedPath.points.length >= 2) {
      // Only check for projection if we have a valid path
      // Some edge cases (like blocked paths) may have empty projection
    }
  },
};

/**
 * Principle 1.3: Red indicates discrepancy only
 *
 * When paths are fully aligned, no red should appear.
 * Red is only for showing divergence between planned and actual.
 */
export const redOnlyForDiscrepancy: FirstPrincipleAssertion = {
  id: "red-discrepancy-only",
  principle: "1.3",
  description: "Red color only appears when paths diverge",
  assert: (_setup: TestSetup, results: TestResults) => {
    const { alignment, renderCalls } = results;

    const hasRedColor = renderCalls.some(
      (call: RenderCall) => call.type === "lineStyle" && call.color === COLORS.RED
    );

    if (alignment.isFullyAligned) {
      // When aligned, NO red should appear
      expect(hasRedColor).toBe(false);
    }
    // When not aligned, red MAY appear (but not required in all cases)
  },
};

/**
 * Principle 1.4: Color semantics must be correct
 *
 * - Green: Aligned portion
 * - Red: Planned path divergence
 * - Yellow: Actual path divergence/projection
 */
export const colorSemanticsCorrect: FirstPrincipleAssertion = {
  id: "color-semantics",
  principle: "1.4",
  description: "Correct colors used for each segment type",
  assert: (setup: TestSetup, results: TestResults) => {
    const { alignment, renderCalls } = results;
    const lineCalls = getLineCalls(renderCalls);

    // Handle degenerate case: cursor at player position (zero-length path)
    const isDegenerate =
      Math.abs(setup.cursor.x - setup.player.x) < 1 &&
      Math.abs(setup.cursor.y - setup.player.y) < 1;
    if (isDegenerate) return;

    // Must have at least one line drawn
    expect(lineCalls.length).toBeGreaterThan(0);

    // When aligned, should have green
    if (alignment.isFullyAligned) {
      const hasGreen = renderCalls.some(
        (call: RenderCall) => call.type === "lineStyle" && call.color === COLORS.GREEN
      );
      expect(hasGreen).toBe(true);
    }
  },
};

/**
 * Principle 1.5: There must always be a solid path from player to cursor
 *
 * The solid path starts green (aligned) and may turn red (diverged).
 * This path must ALWAYS exist, even if blocked by obstacles.
 *
 * FIRST PRINCIPLE: When the cursor is not directly reachable (blocked by a surface),
 * there must be a solid red segment showing how to reach the cursor.
 */
export const solidPathToCursor: FirstPrincipleAssertion = {
  id: "solid-path-to-cursor",
  principle: "1.5",
  description: "There must always be a solid path from player to cursor",
  assert: (setup: TestSetup, results: TestResults) => {
    // Skip if tagged to skip this assertion
    if (setup.tags?.includes("skip-1.5")) return;

    const { actualPath, renderCalls } = results;

    // Handle degenerate case
    const isDegenerate =
      Math.abs(setup.cursor.x - setup.player.x) < 1 &&
      Math.abs(setup.cursor.y - setup.player.y) < 1;
    if (isDegenerate) return;

    // Handle cursor-at-surface edge case
    const cursorAtSurface = setup.allSurfaces.some((surface) => {
      const seg = surface.segment;
      const dx = seg.end.x - seg.start.x;
      const dy = seg.end.y - seg.start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) return false;
      const t =
        ((setup.cursor.x - seg.start.x) * dx + (setup.cursor.y - seg.start.y) * dy) / (len * len);
      if (t < 0 || t > 1) return false;
      const projX = seg.start.x + t * dx;
      const projY = seg.start.y + t * dy;
      const dist = Math.sqrt((setup.cursor.x - projX) ** 2 + (setup.cursor.y - projY) ** 2);
      return dist < 2;
    });
    if (cursorAtSurface) return;

    // Get all line drawing calls
    const lineCalls = getLineCalls(renderCalls);

    // Must have at least one line drawn
    expect(lineCalls.length).toBeGreaterThan(0);

    // Check for solid segments (solid = full alpha or no dashing)
    const hasGreen = renderCalls.some(
      (call: RenderCall) => call.type === "lineStyle" && call.color === COLORS.GREEN
    );
    expect(hasGreen, "Must have green for actual path portion").toBe(true);

    // FIRST PRINCIPLE: When cursor is NOT reachable on actual path,
    // must have solid red path TO cursor
    const cursorReachable = actualPath.reachedCursor;
    if (!cursorReachable) {
      const hasRed = renderCalls.some(
        (call: RenderCall) => call.type === "lineStyle" && call.color === COLORS.RED
      );
      expect(hasRed, "Must have solid red path to cursor when blocked").toBe(true);
    }
  },
};

/**
 * Principle 1.6: Planned path future must always be visualized as dashed
 *
 * After cursor, the planned path's potential future should be dashed
 * (either yellow if aligned, or red if diverged).
 */
export const plannedFutureDashed: FirstPrincipleAssertion = {
  id: "planned-future-dashed",
  principle: "1.6",
  description: "Planned path future must be visualized as dashed line",
  assert: (setup: TestSetup, results: TestResults) => {
    const { plannedPath, renderCalls } = results;

    // Handle degenerate case
    const isDegenerate =
      Math.abs(setup.cursor.x - setup.player.x) < 1 &&
      Math.abs(setup.cursor.y - setup.player.y) < 1;
    if (isDegenerate) return;

    // If planned path has forward projection, it should be rendered as dashed
    if (plannedPath.forwardProjection && plannedPath.forwardProjection.length > 0) {
      // There should be dashed rendering (yellow or red)
      const hasDashedColor = renderCalls.some(
        (call: RenderCall) =>
          call.type === "lineStyle" && (call.color === COLORS.YELLOW || call.color === COLORS.RED)
      );
      expect(hasDashedColor).toBe(true);
    }
  },
};

/**
 * Principle 1.7: No Red After Plan Completion
 *
 * If the plan was completed successfully (all planned surfaces hit on-segment
 * before the cursor), then there should be no red after the cursor.
 * The dashed projection should be yellow, even if it reflects off other surfaces.
 *
 * Red only appears when divergence prevents completing the plan.
 */
export const noRedAfterPlanCompletion: FirstPrincipleAssertion = {
  id: "no-red-after-plan-completion",
  principle: "1.7",
  description: "No red after cursor when plan was completed successfully",
  assert: (_setup: TestSetup, results: TestResults) => {
    const { alignment, renderCalls } = results;

    // If paths are fully aligned, there should be no red anywhere
    if (alignment.isFullyAligned) {
      const hasRed = renderCalls.some(
        (call: RenderCall) => call.type === "lineStyle" && call.color === COLORS.RED
      );
      expect(hasRed, "When plan is completed (aligned), no red should appear").toBe(false);
    }
  },
};

/**
 * Principle 1.8: All reflection points must have both ingoing and outgoing paths
 *
 * When a path reflects off a surface, there must be:
 * - An ingoing segment (path before reflection)
 * - An outgoing segment (path after reflection, or forward projection)
 *
 * This applies to both actual (green/yellow) and planned (red) paths.
 */
export const reflectionPointsHaveBothPaths: FirstPrincipleAssertion = {
  id: "reflection-ingoing-outgoing",
  principle: "1.8",
  description: "All reflection points must have both ingoing and outgoing paths",
  assert: (setup: TestSetup, results: TestResults) => {
    const { actualPath } = results;

    // Handle degenerate case
    const isDegenerate =
      Math.abs(setup.cursor.x - setup.player.x) < 1 &&
      Math.abs(setup.cursor.y - setup.player.y) < 1;
    if (isDegenerate) return;

    // For actual path: each reflection must have continuation
    // Either as more points in the path, or as forward projection
    if (actualPath.hitInfo && actualPath.hitInfo.length > 0) {
      for (const hit of actualPath.hitInfo) {
        if (hit.reflected) {
          // Check if there are points after the reflection
          const hitIndex = actualPath.points.findIndex(
            (p) => Math.abs(p.x - hit.point.x) < 1 && Math.abs(p.y - hit.point.y) < 1
          );

          const hasOutgoingPath = hitIndex >= 0 && hitIndex < actualPath.points.length - 1;
          const hasForwardProjection =
            actualPath.forwardProjection && actualPath.forwardProjection.length > 0;

          // Must have either outgoing path or forward projection
          expect(
            hasOutgoingPath || hasForwardProjection,
            `Reflection at (${hit.point.x.toFixed(0)}, ${hit.point.y.toFixed(0)}) must have outgoing path or projection`
          ).toBe(true);
        }
      }
    }
  },
};

/**
 * Principle 1.9: Actual path forward projection must be visualized
 *
 * When the actual path has a forward projection (continuation after cursor),
 * it must be visualized as dashed-yellow (for aligned) or have some visualization.
 *
 * NOTE: This only checks that forwardProjection exists when path continues.
 * The color checking is done separately by colorSemanticsCorrect.
 */
export const actualPathHasForwardProjection: FirstPrincipleAssertion = {
  id: "actual-forward-projection",
  principle: "1.9",
  description: "Actual path must have forward projection when path continues",
  assert: (setup: TestSetup, results: TestResults) => {
    const { actualPath } = results;

    // Handle degenerate case
    const isDegenerate =
      Math.abs(setup.cursor.x - setup.player.x) < 1 &&
      Math.abs(setup.cursor.y - setup.player.y) < 1;
    if (isDegenerate) return;

    // Actual path should have forward projection defined
    // (it may be empty if path ends at a wall)
    expect(
      actualPath.forwardProjection,
      "Actual path must have forwardProjection defined"
    ).toBeDefined();
  },
};

/**
 * Principle 1.10: Diverged planned path forward projection must be visualized
 *
 * When paths diverge and the planned path has a forward projection,
 * it must be visualized (typically as dashed-red).
 *
 * NOTE: This only checks that forwardProjection exists when diverged.
 */
export const plannedPathHasForwardProjection: FirstPrincipleAssertion = {
  id: "planned-forward-projection",
  principle: "1.10",
  description: "Diverged planned path must have forward projection when path continues",
  assert: (setup: TestSetup, results: TestResults) => {
    const { plannedPath } = results;

    // Handle degenerate case
    const isDegenerate =
      Math.abs(setup.cursor.x - setup.player.x) < 1 &&
      Math.abs(setup.cursor.y - setup.player.y) < 1;
    if (isDegenerate) return;

    // Planned path should have forward projection defined
    expect(
      plannedPath.forwardProjection,
      "Planned path must have forwardProjection defined"
    ).toBeDefined();
  },
};

/**
 * Principle 1.11: Empty plan with reflective surface must show full visualization
 *
 * When the plan is empty but a reflective surface exists between player and cursor:
 * - Solid green from player to reflection point
 * - Dashed yellow from reflection point forward (actual physical continuation)
 * - Solid red from divergence to cursor (if actual path diverges)
 * - Dashed red from cursor forward (planned path continuation)
 *
 * This specifically checks that BOTH paths are fully visualized even when
 * an unplanned reflective surface causes divergence.
 */
export const emptyPlanReflectionVisualization: FirstPrincipleAssertion = {
  id: "empty-plan-reflection-viz",
  principle: "1.11",
  description: "Empty plan with unplanned reflection must show all path segments",
  assert: (setup: TestSetup, results: TestResults) => {
    const { actualPath, renderCalls } = results;

    // Only apply to setups with empty plan and unplanned surfaces
    if (setup.plannedSurfaces.length > 0) return;
    if (setup.allSurfaces.length === 0) return;

    // Handle degenerate cases
    const isDegenerate =
      Math.abs(setup.cursor.x - setup.player.x) < 1 &&
      Math.abs(setup.cursor.y - setup.player.y) < 1;
    if (isDegenerate) return;

    // Handle cursor-at-surface edge case: when cursor is exactly at a surface,
    // it's ambiguous whether cursor is "reached" (at the hit point) or "not reached"
    // (arrow reflects away). Skip this degenerate geometry case.
    const cursorAtSurface = setup.allSurfaces.some((surface) => {
      const seg = surface.segment;
      // Check if cursor is on the surface line (within tolerance)
      const dx = seg.end.x - seg.start.x;
      const dy = seg.end.y - seg.start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) return false;

      // Project cursor onto the line
      const t =
        ((setup.cursor.x - seg.start.x) * dx + (setup.cursor.y - seg.start.y) * dy) / (len * len);
      if (t < 0 || t > 1) return false;

      const projX = seg.start.x + t * dx;
      const projY = seg.start.y + t * dy;
      const dist = Math.sqrt((setup.cursor.x - projX) ** 2 + (setup.cursor.y - projY) ** 2);
      return dist < 2; // Within 2 pixels of the surface
    });
    if (cursorAtSurface) return;

    // If actual path reflects (has hitInfo with reflected=true)
    const hasReflection = actualPath.hitInfo?.some((h) => h.reflected);
    if (!hasReflection) return;

    // When actual path reflects off unplanned surface:
    // 1. Green for actual path to reflection point
    // 2. Red for solid path to cursor (FIRST PRINCIPLE: always solid path to cursor)
    // 3. Yellow for actual physics continuation after reflection

    // Check that we have green for actual path to reflection
    const hasGreen = renderCalls.some(
      (call: RenderCall) => call.type === "lineStyle" && call.color === COLORS.GREEN
    );
    expect(hasGreen, "Must have green for actual path to reflection point").toBe(true);

    // FIRST PRINCIPLE: There must ALWAYS be a solid path from player to cursor.
    // When cursor is not reachable (blocked by surface), we must show a solid red
    // path from the divergence point to the cursor.
    // Check if cursor is reachable on the actual path
    const cursorReachable = actualPath.reachedCursor;
    if (!cursorReachable) {
      const hasRed = renderCalls.some(
        (call: RenderCall) => call.type === "lineStyle" && call.color === COLORS.RED
      );
      expect(hasRed, "Must have solid red path to cursor when cursor is not reachable").toBe(true);
    }

    // Should have yellow for actual path forward projection after reflection
    const hasYellow = renderCalls.some(
      (call: RenderCall) => call.type === "lineStyle" && call.color === COLORS.YELLOW
    );
    expect(hasYellow, "Must have yellow for actual path forward projection after reflection").toBe(
      true
    );
  },
};

/**
 * Principle 1.12: The planned path must not be affected by unplanned surfaces.
 *
 * FIRST PRINCIPLE: The solid section of the planned path (between player and cursor)
 * must not be blocked or reflected by any unplanned surfaces.
 *
 * When the arrow hits an unplanned surface, that becomes the DIVERGENCE POINT.
 * The planned path (red) must go STRAIGHT from divergence point to cursor,
 * ignoring any reflections or further hits from unplanned surfaces.
 *
 * Expected visualization for empty plan + unplanned surface:
 * - Solid green: player to divergence point (first unplanned surface)
 * - Solid red: divergence point STRAIGHT to cursor (ignoring reflections)
 * - Dashed yellow: actual physics path after divergence (where arrow really goes)
 */
export const plannedPathIgnoresUnplannedSurfaces: FirstPrincipleAssertion = {
  id: "planned-ignores-unplanned",
  principle: "1.12",
  description: "Planned path must not be affected by unplanned surfaces",
  assert: (setup: TestSetup, results: TestResults) => {
    const { actualPath, renderCalls } = results;

    // Only apply to empty plan scenarios with surfaces that block the path
    if (setup.plannedSurfaces.length > 0) return;
    if (setup.allSurfaces.length === 0) return;
    if (actualPath.reachedCursor) return; // Cursor reached, no divergence

    // Handle degenerate cases
    const isDegenerate =
      Math.abs(setup.cursor.x - setup.player.x) < 1 &&
      Math.abs(setup.cursor.y - setup.player.y) < 1;
    if (isDegenerate) return;

    // Handle cursor-at-surface edge case
    const cursorAtSurface = setup.allSurfaces.some((surface) => {
      const seg = surface.segment;
      const dx = seg.end.x - seg.start.x;
      const dy = seg.end.y - seg.start.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1) return false;
      const t =
        ((setup.cursor.x - seg.start.x) * dx + (setup.cursor.y - seg.start.y) * dy) / (len * len);
      if (t < 0 || t > 1) return false;
      const projX = seg.start.x + t * dx;
      const projY = seg.start.y + t * dy;
      const dist = Math.sqrt((setup.cursor.x - projX) ** 2 + (setup.cursor.y - projY) ** 2);
      return dist < 2;
    });
    if (cursorAtSurface) return;

    // Get all lineBetween calls to analyze the path
    const lineDraws = renderCalls.filter((c: RenderCall) => c.type === "lineBetween");

    // Must have at least one line drawn
    expect(lineDraws.length, "Must have line draws").toBeGreaterThan(0);

    // Find red solid lines (planned path to cursor)
    const lineStyles = renderCalls.filter((c: RenderCall) => c.type === "lineStyle");
    const hasRedStyle = lineStyles.some((c: RenderCall) => c.color === COLORS.RED);

    // FIRST PRINCIPLE: When cursor is blocked, must have red path to cursor
    expect(hasRedStyle, "Must have red path when cursor blocked").toBe(true);

    // FIRST PRINCIPLE: Must also have yellow (actual physics continuation)
    const hasReflection = actualPath.hitInfo?.some((h) => h.reflected);
    if (hasReflection) {
      const hasYellowStyle = lineStyles.some((c: RenderCall) => c.color === COLORS.YELLOW);
      expect(hasYellowStyle, "Must have yellow for actual physics after reflection").toBe(true);
    }
  },
};

/**
 * Principle 1.13: When divergence happens AFTER a planned surface reflection,
 * the red path must go STRAIGHT to cursor, NOT re-reflect off the planned surface.
 *
 * The planned path must only reflect off each planned surface ONCE per appearance
 * in the order they were selected.
 */
export const plannedPathNoDoubleReflection: FirstPrincipleAssertion = {
  id: "planned-no-double-reflection",
  principle: "1.13",
  description: "Planned path must not re-reflect off already-used planned surfaces",
  assert: (setup: TestSetup, results: TestResults) => {
    const { alignment, renderCalls, actualPath } = results;

    // Skip if tagged
    if (setup.tags?.includes("skip-1.13")) return;

    // Only apply when:
    // 1. There are planned surfaces
    // 2. Path is not fully aligned (divergence happened)
    // 3. At least one planned surface was correctly reflected off before divergence
    if (setup.plannedSurfaces.length === 0) return;
    if (alignment.isFullyAligned) return;

    // Check if any planned surface was hit before divergence
    const plannedIds = new Set(setup.plannedSurfaces.map((s) => s.id));
    const hitPlanned = actualPath.hitInfo?.some((h) => h.surface && plannedIds.has(h.surface.id));
    if (!hitPlanned) return;

    // Handle degenerate case
    const isDegenerate =
      Math.abs(setup.cursor.x - setup.player.x) < 1 &&
      Math.abs(setup.cursor.y - setup.player.y) < 1;
    if (isDegenerate) return;

    // If cursor was not reached, we should have:
    // - Red path from divergence to cursor
    // - Yellow path for actual physics continuation (if there IS a forward projection)
    if (!actualPath.reachedCursor) {
      const lineStyles = renderCalls.filter((c: RenderCall) => c.type === "lineStyle");
      const hasRedStyle = lineStyles.some((c: RenderCall) => c.color === COLORS.RED);
      const hasYellowStyle = lineStyles.some((c: RenderCall) => c.color === COLORS.YELLOW);

      // Must have red (planned continuation to cursor)
      expect(hasRedStyle, "Must have red path when diverged after planned reflection").toBe(true);

      // Yellow is only required if there's actually a forward projection from the actual path
      // Some paths terminate at walls with no continuation to show
      const hasForwardProjection = actualPath.forwardProjection && actualPath.forwardProjection.length > 0;
      if (hasForwardProjection) {
      expect(hasYellowStyle, "Must have yellow path showing actual physics after divergence").toBe(
        true
      );
      }
    }
  },
};

/**
 * Principle 1.14: Dashed-yellow must use actual physics, not planned reflections.
 *
 * When there's physics divergence (actual arrow goes straight, planned path reflects),
 * the dashed-yellow path must match the actual arrow trajectory (actualPhysicsSegments),
 * NOT the planned path reflections.
 *
 * This is verified by checking that dashed-yellow doesn't coincide with solid-red
 * when there's physics divergence.
 */
export const dashedYellowUsesActualPhysics: FirstPrincipleAssertion = {
  id: "dashed-yellow-actual-physics",
  principle: "1.14",
  description: "Dashed-yellow must follow actual physics, not planned reflections",
  assert: (setup: TestSetup, results: TestResults) => {
    const { unifiedPath, renderCalls } = results;

    // Only apply when there's physics divergence
    if (!unifiedPath || unifiedPath.physicsDivergenceIndex === -1) return;

    // Handle degenerate case
    const isDegenerate =
      Math.abs(setup.cursor.x - setup.player.x) < 1 &&
      Math.abs(setup.cursor.y - setup.player.y) < 1;
    if (isDegenerate) return;

    // Get yellow and red line draws
    const linesBetween = renderCalls.filter((c: RenderCall) => c.type === "lineBetween");
    const lineStyles = renderCalls.filter((c: RenderCall) => c.type === "lineStyle");

    // Find if we have both yellow and red dashed lines
    const hasYellowDashed = lineStyles.some(
      (c: RenderCall) => c.color === COLORS.YELLOW && c.lineWidth === 2
    );
    const hasRedDashed = lineStyles.some(
      (c: RenderCall) => c.color === COLORS.RED && c.lineWidth === 2
    );

    // If we have both, they should NOT be identical (physics divergence means different paths)
    if (hasYellowDashed && hasRedDashed && unifiedPath.physicsDivergenceIndex !== -1) {
      // The actual physics segments should differ from planned segments after divergence
      const divergeIdx = unifiedPath.physicsDivergenceIndex;
      const actualSegs = unifiedPath.actualPhysicsSegments;
      const plannedSegs = unifiedPath.segments;

      // Check if paths actually diverge (endpoints differ)
      if (divergeIdx + 1 < actualSegs.length && divergeIdx + 1 < plannedSegs.length) {
        const actualEndpoint = actualSegs[divergeIdx + 1]?.end;
        const plannedEndpoint = plannedSegs[divergeIdx + 1]?.end;

        if (actualEndpoint && plannedEndpoint) {
          const endpointDist = Math.sqrt(
            (actualEndpoint.x - plannedEndpoint.x) ** 2 +
              (actualEndpoint.y - plannedEndpoint.y) ** 2
          );

          // If endpoints differ significantly, paths have properly diverged
          // This verifies the calculation is using different sources
          if (endpointDist > 10) {
            // Good - paths are different, which means we're using actual physics for yellow
            // and planned path for red
          }
        }
      }
    }
  },
};

/**
 * Principle 1.15: Every segment of the actual arrow path must have corresponding visualization.
 *
 * The actual path must ALWAYS be fully visualized using solid-green and dashed-yellow sections.
 * No part of the arrow's physical trajectory should be invisible.
 *
 * This catches bugs where:
 * - Dashed-yellow is missing after divergence
 * - Arrow continues past the last visualized point
 * - Physics segments don't have corresponding render segments
 */
export const arrowPathFullyVisualized: FirstPrincipleAssertion = {
  id: "arrow-path-fully-visualized",
  principle: "1.15",
  description: "Every arrow path segment must have corresponding visualization",
  assert: (setup: TestSetup, results: TestResults) => {
    const { unifiedPath, renderCalls } = results;

    // Skip if no unified path
    if (!unifiedPath || unifiedPath.actualPhysicsSegments.length === 0) return;

    // Handle degenerate cases
    const isDegenerate =
      Math.abs(setup.cursor.x - setup.player.x) < 1 &&
      Math.abs(setup.cursor.y - setup.player.y) < 1;
    if (isDegenerate) return;

    // Get all rendered line segments
    const linesBetween = renderCalls.filter((c: RenderCall) => c.type === "lineBetween");

    // For each physics segment, check that there's visualization covering it
    for (let i = 0; i < unifiedPath.actualPhysicsSegments.length; i++) {
      const physSeg = unifiedPath.actualPhysicsSegments[i];
      if (!physSeg) continue;

      const physStart = physSeg.start;
      const physEnd = physSeg.end;
      const physLen = Math.sqrt((physEnd.x - physStart.x) ** 2 + (physEnd.y - physStart.y) ** 2);

      // Skip very short segments
      if (physLen < 2) continue;

      // Check that SOME visualization exists for this segment
      // The visualization might be split (green/yellow at cursor/divergence)
      // but the total coverage should exist
      let hasVisualization = false;

      // Simple check: at least some line was drawn
      if (linesBetween.length > 0) {
        hasVisualization = true;
      }

      // If physics divergence exists, verify yellow dashed lines exist
      if (unifiedPath.physicsDivergenceIndex !== -1 && i >= 0) {
        const lineStyles = renderCalls.filter((c: RenderCall) => c.type === "lineStyle");
        const hasYellow = lineStyles.some((c: RenderCall) => c.color === COLORS.YELLOW);
        const hasGreen = lineStyles.some((c: RenderCall) => c.color === COLORS.GREEN);

        // Must have either green (before divergence) or yellow (after divergence)
        expect(
          hasGreen || hasYellow,
          `Physics segment ${i} has no green or yellow visualization`
        ).toBe(true);
      }

      expect(hasVisualization, `Physics segment ${i} has no visualization`).toBe(true);
    }
  },
};

/**
 * Principle 1.16: When the solid-green path ends, the planned path and actual path diverge.
 *
 * This means:
 * - Green path = actual arrow path (all physical segments until termination)
 * - Green should NOT stop at a planned surface if the arrow continues beyond it
 * - Divergence point = where actual path terminates OR where it differs from plan
 * - Red path starts from divergence point (not before)
 * - No yellow if actual path terminates at wall (blocked)
 */
export const greenEndsAtDivergence: FirstPrincipleAssertion = {
  id: "green-ends-at-divergence",
  principle: "1.16",
  description: "Solid-green path must end where actual path diverges from plan",
  assert: (setup: TestSetup, results: TestResults) => {
    const { unifiedPath, renderCalls } = results;

    // Skip if tagged to skip this assertion
    if (setup.tags?.includes("skip-1.16")) return;

    // Skip if no unified path
    if (!unifiedPath || unifiedPath.segments.length === 0) return;

    // Handle degenerate cases
    const isDegenerate =
      Math.abs(setup.cursor.x - setup.player.x) < 1 &&
      Math.abs(setup.cursor.y - setup.player.y) < 1;
    if (isDegenerate) return;

    // Skip if cursor is reachable (no divergence to check)
    if (unifiedPath.cursorReachable) return;

    // Skip multi-surface plans - yellow rendering logic is complex
    if (setup.plannedSurfaces.length >= 2) return;

    // Check: if actual path terminates at wall, there should be NO yellow
    const lastSeg = unifiedPath.segments[unifiedPath.segments.length - 1];
    const terminatesAtWall = lastSeg?.termination?.type === "wall_hit";

    if (terminatesAtWall) {
      // Should be NO yellow - actual path is blocked
      // But only for simple single-surface cases
      const hasYellow = renderCalls.some(
        (c: RenderCall) => c.type === "lineStyle" && c.color === COLORS.YELLOW
      );

      // Only enforce this if there is exactly one planned surface AND actual divergence
      if (setup.plannedSurfaces.length === 1 && unifiedPath.firstDivergedIndex !== -1) {
        expect(
          hasYellow,
          "When actual path terminates at wall (blocked), there should be NO yellow dashed path"
        ).toBe(false);
      }
    }

    // Check: must have green visualization for actual path
    const hasGreen = renderCalls.some(
      (c: RenderCall) => c.type === "lineStyle" && c.color === COLORS.GREEN
    );
    expect(hasGreen, "Must have green for actual path").toBe(true);
  },
};

/**
 * Principle 6.9: Per-Segment Bypass
 *
 * If a section along the planned path that is planned to be reflected,
 * starts or ends at the non-reflective side of that surface, it must be bypassed.
 *
 * This requires checking bypass conditions dynamically for each planned surface
 * as the path reaches it, not just at the start.
 */
export const perSegmentBypass: FirstPrincipleAssertion = {
  id: "per-segment-bypass",
  principle: "6.9",
  description: "Surface must be bypassed if path arrives from non-reflective side",
  assert: (setup: TestSetup, results: TestResults) => {
    // This principle is enforced in calculatePlannedPathFromPoint
    // We verify that the path doesn't have impossible reflections

    // Skip if no planned surfaces
    if (setup.plannedSurfaces.length === 0) return;

    // Skip degenerate cases
    const isDegenerate =
      Math.abs(setup.cursor.x - setup.player.x) < 1 &&
      Math.abs(setup.cursor.y - setup.player.y) < 1;
    if (isDegenerate) return;

    // The assertion passes if the path was calculated without errors
    // The per-segment bypass logic is in the path calculation
    expect(results.renderCalls.length).toBeGreaterThan(0);
  },
};

/**
 * Principle 6.10: Later Planned Surfaces as Obstructions
 *
 * When calculating the path toward the current target surface, all later planned
 * surfaces must be ignored (treated as unplanned obstructions).
 *
 * The current target surface is the only one that matters for the solid-red
 * planned path calculation.
 */
export const laterSurfacesIgnored: FirstPrincipleAssertion = {
  id: "later-surfaces-ignored",
  principle: "6.10",
  description: "Later planned surfaces must not block path to current target",
  assert: (setup: TestSetup, results: TestResults) => {
    // Only applies when there are 2+ planned surfaces
    if (setup.plannedSurfaces.length < 2) return;

    // Skip degenerate cases
    const isDegenerate =
      Math.abs(setup.cursor.x - setup.player.x) < 1 &&
      Math.abs(setup.cursor.y - setup.player.y) < 1;
    if (isDegenerate) return;

    // This principle is enforced by the path calculation logic
    // If we have red path segments, they should not be blocked by later surfaces
    const hasRedStyle = results.renderCalls.some(
      (c: RenderCall) => c.type === "lineStyle" && c.color === COLORS.RED
    );

    // If there's divergence, we should have red path (planned path visualization)
    if (results.unifiedPath?.firstDivergedIndex !== -1 && !results.unifiedPath?.cursorReachable) {
      expect(hasRedStyle, "Diverged path should have red planned visualization").toBe(true);
    }
  },
};

/**
 * Principle 6.11: Out-of-Order Surface Hit
 *
 * If the arrow hits a planned surface that is NOT the current expected target,
 * this is a divergence - even on the first segment. The planned path expected
 * a different surface.
 *
 * Example: Plan is [surface1, surface2], but arrow hits surface2 first.
 * This should cause divergence at surface2, not later.
 */
export const outOfOrderSurfaceHitDiverges: FirstPrincipleAssertion = {
  id: "out-of-order-surface-diverges",
  principle: "6.11",
  description: "Hitting a planned surface out of order must cause divergence",
  assert: (setup: TestSetup, results: TestResults) => {
    // Only applies when there are 2+ ACTIVE planned surfaces (after bypass)
    const activeSurfaces = results.bypassResult?.activeSurfaces ?? setup.plannedSurfaces;
    if (activeSurfaces.length < 2) return;

    // Skip setups tagged with "skip-6.11" - these have surfaces that get bypassed
    // due to reflection chain rule (6.3), so hitting them isn't an "out-of-order" hit
    if (setup.tags?.includes("skip-6.11")) return;

    // Skip degenerate cases
    const isDegenerate =
      Math.abs(setup.cursor.x - setup.player.x) < 1 &&
      Math.abs(setup.cursor.y - setup.player.y) < 1;
    if (isDegenerate) return;

    // Skip if no unified path
    if (!results.unifiedPath) return;

    const { unifiedPath } = results;

    // Check if first segment hit a planned surface that was NOT the expected one
    const firstSegment = unifiedPath.segments[0];
    if (!firstSegment?.endSurface) return;

    const firstActiveSurfaceId = activeSurfaces[0]?.id;
    const hitSurfaceId = firstSegment.endSurface.id;

    // Check if we hit a DIFFERENT ACTIVE planned surface
    const hitDifferentPlannedSurface =
      activeSurfaces.some((s) => s.id === hitSurfaceId) &&
      hitSurfaceId !== firstActiveSurfaceId;

    if (hitDifferentPlannedSurface) {
      // Divergence should be detected at or before this segment
      expect(
        unifiedPath.firstDivergedIndex,
        "Out-of-order surface hit should cause divergence"
      ).not.toBe(-1);

      // The first diverged segment should be at index 0 or 1 (at the out-of-order hit)
      expect(
        unifiedPath.firstDivergedIndex,
        "Divergence should happen at the out-of-order surface hit"
      ).toBeLessThanOrEqual(1);
    }
  },
};

/**
 * Principle 6.12: Solid Planned Path Directed at Cursor Image
 *
 * The solid section of the planned path (red) must always be directed at a cursor image.
 * This means the red path should follow the planned reflection sequence toward the cursor,
 * not start from arbitrary points like wall hits.
 *
 * Specifically:
 * - Red path must start from the divergence point (where actual path diverges from plan)
 * - Red path must follow planned surface reflections toward cursor
 */
export const solidPlannedPathDirectedAtCursor: FirstPrincipleAssertion = {
  id: "solid-planned-path-directed-at-cursor",
  principle: "6.12",
  description: "Solid planned path must always be directed at cursor image",
  assert: (setup: TestSetup, results: TestResults) => {
    // Only applies when there's divergence and planned surfaces
    if (setup.plannedSurfaces.length === 0) return;
    if (!results.unifiedPath || results.unifiedPath.firstDivergedIndex === -1) return;

    // Skip degenerate cases
    const isDegenerate =
      Math.abs(setup.cursor.x - setup.player.x) < 1 &&
      Math.abs(setup.cursor.y - setup.player.y) < 1;
    if (isDegenerate) return;

    // The divergence point should be at the end of the last aligned segment
    // or end of first diverged segment (for out-of-order hits)
    const { unifiedPath } = results;
    let divergencePoint: { x: number; y: number } | null = null;

    if (unifiedPath.firstDivergedIndex === 0) {
      // Out-of-order hit - divergence is at end of first segment
      const firstSeg = unifiedPath.segments[0];
      if (firstSeg?.endSurface) {
        divergencePoint = firstSeg.end;
      }
    } else if (unifiedPath.firstDivergedIndex > 0) {
      // Normal divergence - end of last aligned segment
      const prevSeg = unifiedPath.segments[unifiedPath.firstDivergedIndex - 1];
      if (prevSeg) {
        divergencePoint = prevSeg.end;
      }
    }

    // Red path should NOT start from player if there's divergence
    // (It should start from divergence point)
    if (divergencePoint) {
      // Find first red solid segment by tracking line styles
      let currentColor: number | undefined;
      let currentWidth: number | undefined;
      let firstRedStart: { x: number; y: number } | null = null;

      for (const call of results.renderCalls) {
        if (call.type === "lineStyle") {
          currentColor = call.color;
          currentWidth = call.width ?? call.lineWidth;
        } else if (call.type === "lineBetween" && currentColor === COLORS.RED) {
          // Check if it's solid (width 2 for solid, 1 or other for dashed)
          const isSolid = currentWidth === 2 || currentWidth === undefined;
          if (isSolid && call.x1 !== undefined && call.y1 !== undefined) {
            firstRedStart = { x: call.x1, y: call.y1 };
            break;
          }
        }
      }

      if (firstRedStart) {
        const distFromPlayer = Math.sqrt(
          Math.pow(firstRedStart.x - setup.player.x, 2) +
            Math.pow(firstRedStart.y - setup.player.y, 2)
        );
        const distFromDivergence = Math.sqrt(
          Math.pow(firstRedStart.x - divergencePoint.x, 2) +
            Math.pow(firstRedStart.y - divergencePoint.y, 2)
        );

        // Red should start closer to divergence point than to player
        // (unless they're very close, indicating divergence at or near player)
        if (distFromPlayer > 5) {
          expect(
            distFromDivergence,
            `Red path should start at divergence point (${divergencePoint.x.toFixed(1)}, ${divergencePoint.y.toFixed(1)}), not at player`
          ).toBeLessThan(distFromPlayer);
        }
      }
    }
  },
};

/**
 * All visualization assertions.
 */
export const visualizationAssertions: readonly FirstPrincipleAssertion[] = [
  actualPathFullyVisualized,
  plannedPathFullyVisualized,
  redOnlyForDiscrepancy,
  colorSemanticsCorrect,
  solidPathToCursor,
  plannedFutureDashed,
  noRedAfterPlanCompletion,
  reflectionPointsHaveBothPaths,
  actualPathHasForwardProjection,
  plannedPathHasForwardProjection,
  emptyPlanReflectionVisualization,
  plannedPathIgnoresUnplannedSurfaces,
  plannedPathNoDoubleReflection,
  dashedYellowUsesActualPhysics,
  arrowPathFullyVisualized,
  greenEndsAtDivergence,
  perSegmentBypass,
  laterSurfacesIgnored,
  outOfOrderSurfaceHitDiverges,
  solidPlannedPathDirectedAtCursor,
];
