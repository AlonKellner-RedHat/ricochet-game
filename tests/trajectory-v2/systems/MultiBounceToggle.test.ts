/**
 * Tests for Multi-Bounce Toggle Logic
 *
 * The simplified toggle behavior:
 * - Clicking last planned surface: removes it
 * - Clicking any other surface: adds it (can't be consecutive by definition)
 */

import { describe, expect, it, beforeEach } from "vitest";
import { AimingSystem } from "@/trajectory-v2/systems/AimingSystem";
import type { Surface } from "@/surfaces/Surface";

/**
 * Helper to create a simple test surface.
 */
function createSurface(id: string): Surface {
  return {
    id,
    segment: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } },
    surfaceType: "ricochet",
    onArrowHit: () => ({ type: "reflect" }),
    isPlannable: () => true,
    getVisualProperties: () => ({ color: 0xffffff, lineWidth: 2, alpha: 1 }),
    getNormal: () => ({ x: 0, y: 1 }),
    canReflectFrom: () => true,
  };
}

describe("Multi-Bounce Toggle Logic", () => {
  let aimingSystem: AimingSystem;
  let surfaceA: Surface;
  let surfaceB: Surface;
  let surfaceC: Surface;

  beforeEach(() => {
    aimingSystem = new AimingSystem();
    surfaceA = createSurface("surface-A");
    surfaceB = createSurface("surface-B");
    surfaceC = createSurface("surface-C");
  });

  describe("toggleSurface", () => {
    it("should add a surface when plan is empty", () => {
      aimingSystem.toggleSurface(surfaceA);

      const planned = aimingSystem.getPlannedSurfaces();
      expect(planned).toHaveLength(1);
      expect(planned[0]?.id).toBe("surface-A");
    });

    it("should add a different surface when plan has one surface", () => {
      aimingSystem.toggleSurface(surfaceA);
      aimingSystem.toggleSurface(surfaceB);

      const planned = aimingSystem.getPlannedSurfaces();
      expect(planned).toHaveLength(2);
      expect(planned[0]?.id).toBe("surface-A");
      expect(planned[1]?.id).toBe("surface-B");
    });

    it("should remove last surface when clicked", () => {
      aimingSystem.toggleSurface(surfaceA);
      aimingSystem.toggleSurface(surfaceB);
      aimingSystem.toggleSurface(surfaceB); // Click last

      const planned = aimingSystem.getPlannedSurfaces();
      expect(planned).toHaveLength(1);
      expect(planned[0]?.id).toBe("surface-A");
    });

    it("should add duplicate when clicking non-last planned surface", () => {
      aimingSystem.toggleSurface(surfaceA);
      aimingSystem.toggleSurface(surfaceB);
      aimingSystem.toggleSurface(surfaceA); // Click first (not last)

      const planned = aimingSystem.getPlannedSurfaces();
      expect(planned).toHaveLength(3);
      expect(planned[0]?.id).toBe("surface-A");
      expect(planned[1]?.id).toBe("surface-B");
      expect(planned[2]?.id).toBe("surface-A"); // Duplicate added
    });

    it("should support multi-bounce sequence A, B, A, B", () => {
      aimingSystem.toggleSurface(surfaceA);
      aimingSystem.toggleSurface(surfaceB);
      aimingSystem.toggleSurface(surfaceA);
      aimingSystem.toggleSurface(surfaceB);

      const planned = aimingSystem.getPlannedSurfaces();
      expect(planned).toHaveLength(4);
      expect(planned.map(s => s.id)).toEqual([
        "surface-A",
        "surface-B",
        "surface-A",
        "surface-B",
      ]);
    });

    it("should not allow consecutive duplicates", () => {
      aimingSystem.toggleSurface(surfaceA);
      aimingSystem.toggleSurface(surfaceA); // Should remove, not add duplicate

      const planned = aimingSystem.getPlannedSurfaces();
      expect(planned).toHaveLength(0);
    });

    it("should allow re-adding after removal", () => {
      aimingSystem.toggleSurface(surfaceA);
      aimingSystem.toggleSurface(surfaceA); // Remove
      aimingSystem.toggleSurface(surfaceA); // Add again

      const planned = aimingSystem.getPlannedSurfaces();
      expect(planned).toHaveLength(1);
      expect(planned[0]?.id).toBe("surface-A");
    });

    it("should handle complex sequence with removals", () => {
      aimingSystem.toggleSurface(surfaceA); // [A]
      aimingSystem.toggleSurface(surfaceB); // [A, B]
      aimingSystem.toggleSurface(surfaceA); // [A, B, A]
      aimingSystem.toggleSurface(surfaceA); // Remove last -> [A, B]
      aimingSystem.toggleSurface(surfaceC); // [A, B, C]

      const planned = aimingSystem.getPlannedSurfaces();
      expect(planned).toHaveLength(3);
      expect(planned.map(s => s.id)).toEqual([
        "surface-A",
        "surface-B",
        "surface-C",
      ]);
    });
  });

  describe("addSurface", () => {
    it("should not add consecutive duplicate", () => {
      aimingSystem.addSurface(surfaceA);
      aimingSystem.addSurface(surfaceA); // Should be ignored

      const planned = aimingSystem.getPlannedSurfaces();
      expect(planned).toHaveLength(1);
    });

    it("should add non-consecutive duplicate", () => {
      aimingSystem.addSurface(surfaceA);
      aimingSystem.addSurface(surfaceB);
      aimingSystem.addSurface(surfaceA); // Non-consecutive, should be added

      const planned = aimingSystem.getPlannedSurfaces();
      expect(planned).toHaveLength(3);
    });
  });

  describe("removeSurface", () => {
    it("should remove last occurrence of surface", () => {
      aimingSystem.addSurface(surfaceA);
      aimingSystem.addSurface(surfaceB);
      aimingSystem.addSurface(surfaceA);
      aimingSystem.removeSurface(surfaceA); // Remove last A

      const planned = aimingSystem.getPlannedSurfaces();
      expect(planned).toHaveLength(2);
      expect(planned.map(s => s.id)).toEqual(["surface-A", "surface-B"]);
    });
  });
});
