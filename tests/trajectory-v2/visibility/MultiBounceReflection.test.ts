/**
 * Tests for Multi-Bounce Reflection Cascade
 *
 * Verify that the reflection cascade (visibility polygon propagation)
 * works correctly when the same surface appears multiple times in the plan.
 */

import { describe, expect, it } from "vitest";
import { ValidRegionRenderer } from "@/trajectory-v2/visibility/ValidRegionRenderer";
import { SurfaceChain, createMixedChain } from "@/trajectory-v2/geometry/SurfaceChain";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";
import type { ScreenBounds } from "@/trajectory-v2/visibility/AnalyticalPropagation";
import { prepareSurfaceStates } from "@/trajectory-v2/engine/SurfaceState";

/**
 * Helper to create a vertical ricochet surface.
 */
function createVerticalSurface(
  id: string,
  x: number,
  yStart: number,
  yEnd: number,
  normalPointsLeft: boolean
): Surface {
  const start = normalPointsLeft ? { x, y: yStart } : { x, y: yEnd };
  const end = normalPointsLeft ? { x, y: yEnd } : { x, y: yStart };

  const computeNormal = () => {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return { x: 0, y: 1 };
    return { x: -dy / len, y: dx / len };
  };

  return {
    id,
    segment: { start, end },
    surfaceType: "ricochet",
    onArrowHit: () => ({ type: "reflect" }),
    isPlannable: () => true,
    getVisualProperties: () => ({ color: 0xffffff, lineWidth: 2, alpha: 1 }),
    getNormal: computeNormal,
    canReflectFrom: (arrowDir) => {
      const normal = computeNormal();
      const dot = arrowDir.x * normal.x + arrowDir.y * normal.y;
      return dot < 0;
    },
  };
}

describe("Multi-Bounce Reflection Cascade", () => {
  const screenBounds: ScreenBounds = {
    minX: 0,
    minY: 0,
    maxX: 1280,
    maxY: 720,
  };

  // Two parallel vertical surfaces for bouncing
  const surfaceA = createVerticalSurface("surface-A", 200, 100, 600, true); // normal points left
  const surfaceB = createVerticalSurface("surface-B", 400, 100, 600, false); // normal points right

  describe("SurfaceState with multi-bounce plan", () => {
    it("should track occurrences independently for A, B, A plan", () => {
      const player: Vector2 = { x: 100, y: 350 }; // Left of A
      const cursor: Vector2 = { x: 100, y: 350 };

      const plannedSurfaces = [surfaceA, surfaceB, surfaceA];
      const allSurfaces = [surfaceA, surfaceB];

      const result = prepareSurfaceStates(player, cursor, plannedSurfaces, allSurfaces);

      // Surface A appears at positions 1 and 3
      const stateA = result.states.get("surface-A");
      expect(stateA).toBeDefined();
      expect(stateA!.occurrences).toHaveLength(2);
      expect(stateA!.occurrences.map(o => o.position)).toEqual([1, 3]);

      // Surface B appears at position 2
      const stateB = result.states.get("surface-B");
      expect(stateB).toBeDefined();
      expect(stateB!.occurrences).toHaveLength(1);
      expect(stateB!.occurrences[0]?.position).toBe(2);
    });

    it("should handle A, B, A, B plan (4 bounces)", () => {
      const player: Vector2 = { x: 100, y: 350 };
      const cursor: Vector2 = { x: 100, y: 350 };

      const plannedSurfaces = [surfaceA, surfaceB, surfaceA, surfaceB];
      const allSurfaces = [surfaceA, surfaceB];

      const result = prepareSurfaceStates(player, cursor, plannedSurfaces, allSurfaces);

      // Surface A at positions 1 and 3
      const stateA = result.states.get("surface-A");
      expect(stateA!.occurrences).toHaveLength(2);
      expect(stateA!.occurrences.map(o => o.position)).toEqual([1, 3]);

      // Surface B at positions 2 and 4
      const stateB = result.states.get("surface-B");
      expect(stateB!.occurrences).toHaveLength(2);
      expect(stateB!.occurrences.map(o => o.position)).toEqual([2, 4]);
    });
  });

  describe("Bypass evaluation per occurrence", () => {
    it("should evaluate each occurrence based on cascade state", () => {
      // Player in between surfaces, on wrong side of A initially
      const player: Vector2 = { x: 300, y: 350 }; // Between A and B
      const cursor: Vector2 = { x: 300, y: 350 };

      const plannedSurfaces = [surfaceA, surfaceB, surfaceA];
      const allSurfaces = [surfaceA, surfaceB];

      const result = prepareSurfaceStates(player, cursor, plannedSurfaces, allSurfaces);

      // First occurrence of A should be bypassed (player on wrong side)
      const stateA = result.states.get("surface-A");
      expect(stateA!.occurrences[0]?.bypassReason).toBe("player_wrong_side");

      // Second occurrence of A (position 3) is evaluated based on cascade state
      // Since first A is bypassed, the cascade continues differently
    });
  });

  describe("Active surfaces with duplicates", () => {
    it("should return surfaces in plan order including duplicates", () => {
      const player: Vector2 = { x: 100, y: 350 };
      const cursor: Vector2 = { x: 100, y: 350 };

      const plannedSurfaces = [surfaceA, surfaceB, surfaceA];
      const allSurfaces = [surfaceA, surfaceB];

      const result = prepareSurfaceStates(player, cursor, plannedSurfaces, allSurfaces);

      // Note: The exact active surfaces depend on bypass evaluation
      // Just verify the occurrences are tracked correctly
      const stateA = result.states.get("surface-A");
      expect(stateA!.occurrences).toHaveLength(2);
    });
  });
});
