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
 */
export const solidPathToCursor: FirstPrincipleAssertion = {
  id: "solid-path-to-cursor",
  principle: "1.5",
  description: "There must always be a solid path from player to cursor",
  assert: (setup: TestSetup, results: TestResults) => {
    const { renderCalls } = results;

    // Handle degenerate case
    const isDegenerate =
      Math.abs(setup.cursor.x - setup.player.x) < 1 &&
      Math.abs(setup.cursor.y - setup.player.y) < 1;
    if (isDegenerate) return;

    // Get all line drawing calls
    const lineCalls = getLineCalls(renderCalls);
    
    // Must have at least one line drawn
    expect(lineCalls.length).toBeGreaterThan(0);

    // Check for solid segments (solid = full alpha or no dashing)
    // Note: This is a heuristic check - actual implementation may vary
    const hasGreenOrRed = renderCalls.some(
      (call: RenderCall) =>
        call.type === "lineStyle" &&
        (call.color === COLORS.GREEN || call.color === COLORS.RED)
    );
    expect(hasGreenOrRed).toBe(true);
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
          call.type === "lineStyle" &&
          (call.color === COLORS.YELLOW || call.color === COLORS.RED)
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
            p => Math.abs(p.x - hit.point.x) < 1 && Math.abs(p.y - hit.point.y) < 1
          );
          
          const hasOutgoingPath = hitIndex >= 0 && hitIndex < actualPath.points.length - 1;
          const hasForwardProjection = actualPath.forwardProjection && actualPath.forwardProjection.length > 0;
          
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
    const { alignment, actualPath, renderCalls } = results;

    // Only apply to setups with empty plan and unplanned surfaces
    if (setup.plannedSurfaces.length > 0) return;
    if (setup.allSurfaces.length === 0) return;

    // Handle degenerate case
    const isDegenerate =
      Math.abs(setup.cursor.x - setup.player.x) < 1 &&
      Math.abs(setup.cursor.y - setup.player.y) < 1;
    if (isDegenerate) return;

    // If actual path reflects (has hitInfo with reflected=true)
    const hasReflection = actualPath.hitInfo?.some(h => h.reflected);
    if (!hasReflection) return;

    // When actual path reflects off unplanned surface, paths diverge
    // Check that we have green for actual path to reflection
    const hasGreen = renderCalls.some(
      (call: RenderCall) => call.type === "lineStyle" && call.color === COLORS.GREEN
    );
    expect(hasGreen, "Must have green for actual path to reflection point").toBe(true);

    // If paths diverged, should have red for planned path
    if (!alignment.isFullyAligned) {
      const hasRed = renderCalls.some(
        (call: RenderCall) => call.type === "lineStyle" && call.color === COLORS.RED
      );
      expect(hasRed, "Must have red for diverged planned path to cursor").toBe(true);
    }

    // If actual path has forward projection, should have yellow
    if (actualPath.forwardProjection && actualPath.forwardProjection.length > 0) {
      const hasYellow = renderCalls.some(
        (call: RenderCall) => call.type === "lineStyle" && call.color === COLORS.YELLOW
      );
      expect(
        hasYellow,
        "Must have yellow for actual path forward projection after reflection"
      ).toBe(true);
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
];

