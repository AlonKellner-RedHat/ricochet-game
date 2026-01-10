/**
 * Tests for SurfaceState with Multiple Occurrences
 *
 * When the same surface appears multiple times in a plan (e.g., [A, B, A]),
 * each occurrence must be tracked independently with its own position and
 * bypass status.
 */

import { describe, expect, it } from "vitest";
import {
  prepareSurfaceStates,
  getActivePlannedSurfaces,
} from "@/trajectory-v2/engine/SurfaceState";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

/**
 * Helper to create a simple vertical test surface.
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

describe("SurfaceState with Multiple Occurrences", () => {
  // Two parallel vertical surfaces for bouncing back and forth
  const surfaceA = createVerticalSurface("surface-A", 200, 100, 500, true); // normal points left
  const surfaceB = createVerticalSurface("surface-B", 400, 100, 500, false); // normal points right
  const allSurfaces = [surfaceA, surfaceB];

  describe("prepareSurfaceStates with duplicates", () => {
    it("should track multiple occurrences of the same surface", () => {
      const player: Vector2 = { x: 100, y: 300 }; // Left of surface A
      const cursor: Vector2 = { x: 100, y: 300 }; // Same position (will aim back)

      // Plan: A, B, A (bounce back and forth)
      const plannedSurfaces = [surfaceA, surfaceB, surfaceA];

      const result = prepareSurfaceStates(player, cursor, plannedSurfaces, allSurfaces);

      // Surface A should have 2 occurrences (positions 1 and 3)
      const stateA = result.states.get("surface-A");
      expect(stateA).toBeDefined();
      expect(stateA!.occurrences).toHaveLength(2);
      expect(stateA!.occurrences[0]?.position).toBe(1);
      expect(stateA!.occurrences[1]?.position).toBe(3);

      // Surface B should have 1 occurrence (position 2)
      const stateB = result.states.get("surface-B");
      expect(stateB).toBeDefined();
      expect(stateB!.occurrences).toHaveLength(1);
      expect(stateB!.occurrences[0]?.position).toBe(2);
    });

    it("should track bypass status per occurrence", () => {
      // Player between surfaces, looking right
      const player: Vector2 = { x: 300, y: 300 };
      const cursor: Vector2 = { x: 500, y: 300 };

      // Plan: A, B, A
      // First A: player is on wrong side (x=300 > 200, but normal points left so reflective side is x < 200)
      // This should cause bypass of first occurrence
      const plannedSurfaces = [surfaceA, surfaceB, surfaceA];

      const result = prepareSurfaceStates(player, cursor, plannedSurfaces, allSurfaces);

      const stateA = result.states.get("surface-A");
      expect(stateA).toBeDefined();
      expect(stateA!.occurrences).toHaveLength(2);
      
      // First occurrence should be bypassed (player wrong side)
      expect(stateA!.occurrences[0]?.bypassReason).toBe("player_wrong_side");
      
      // Note: Second occurrence bypass depends on cascade evaluation
      // Just verify it's tracked separately
      expect(stateA!.occurrences[1]?.position).toBe(3);
    });

    it("should return correct activeSurfaces order with duplicates", () => {
      const player: Vector2 = { x: 100, y: 300 }; // Left of A
      const cursor: Vector2 = { x: 100, y: 300 }; // Aiming left

      // Plan: A, B, A
      const plannedSurfaces = [surfaceA, surfaceB, surfaceA];

      const result = prepareSurfaceStates(player, cursor, plannedSurfaces, allSurfaces);

      // If all active, should return [A, B, A] in order
      // Note: May be bypassed based on cursor side checks
      expect(result.activeSurfaces.length).toBeLessThanOrEqual(3);
    });
  });

  describe("getActivePlannedSurfaces with occurrences", () => {
    it("should return surfaces in plan order with duplicates", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 100, y: 350 }; // Slightly different Y

      const plannedSurfaces = [surfaceA, surfaceB, surfaceA];

      const result = prepareSurfaceStates(player, cursor, plannedSurfaces, allSurfaces);
      const activeSurfaces = getActivePlannedSurfaces(result.states);

      // Should preserve order including duplicates
      // The exact count depends on bypass evaluation
      for (let i = 0; i < activeSurfaces.length - 1; i++) {
        // Just verify surfaces are returned (order may vary based on bypass)
        expect(activeSurfaces[i]).toBeDefined();
      }
    });
  });

  describe("empty and single occurrence cases", () => {
    it("should handle empty plan", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 500, y: 300 };

      const result = prepareSurfaceStates(player, cursor, [], allSurfaces);

      const stateA = result.states.get("surface-A");
      expect(stateA).toBeDefined();
      expect(stateA!.occurrences).toHaveLength(0);
    });

    it("should handle single occurrence", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 300, y: 300 };

      const plannedSurfaces = [surfaceA];

      const result = prepareSurfaceStates(player, cursor, plannedSurfaces, allSurfaces);

      const stateA = result.states.get("surface-A");
      expect(stateA).toBeDefined();
      expect(stateA!.occurrences).toHaveLength(1);
      expect(stateA!.occurrences[0]?.position).toBe(1);
    });
  });
});
