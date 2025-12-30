/**
 * V.5 Cursor Reachability Invariant
 *
 * First Principle: Light reaches the cursor if and only if the plan is fully valid.
 * - No divergence between planned and actual paths
 * - No bypassed surfaces
 *
 * This is the fundamental connection between visibility and trajectory validity.
 */

import { expect } from "vitest";
import type { Invariant, InvariantContext } from "../types";

export const v5CursorReachabilityInvariant: Invariant = {
  id: "V.5",
  name: "Cursor Reachability",
  description:
    "Light reaches cursor iff plan is fully valid (no divergence AND no bypassed surfaces)",

  assert: (context: InvariantContext): void => {
    const { lightReachesCursor, planValidity } = context;

    // Light should reach cursor exactly when plan is valid
    if (planValidity.isValid) {
      expect(
        lightReachesCursor,
        `V.5 violation: Plan is valid but light does NOT reach cursor. ` +
          `Player: (${context.player.x}, ${context.player.y}), ` +
          `Cursor: (${context.cursor.x}, ${context.cursor.y})`
      ).toBe(true);
    } else {
      expect(
        lightReachesCursor,
        `V.5 violation: Plan is INVALID but light reaches cursor. ` +
          `Divergence: ${planValidity.hasDivergence}, ` +
          `Bypass: ${planValidity.hasBypass} (${planValidity.bypassedSurfaceIds.join(", ")}). ` +
          `Player: (${context.player.x}, ${context.player.y}), ` +
          `Cursor: (${context.cursor.x}, ${context.cursor.y})`
      ).toBe(false);
    }
  },
};

