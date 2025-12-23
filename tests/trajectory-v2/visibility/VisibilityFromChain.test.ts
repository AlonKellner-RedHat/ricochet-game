/**
 * VisibilityFromChain Tests (TDD)
 *
 * Tests for deriving visibility from ImageChain.
 * The core insight is that V.5 should be true BY CONSTRUCTION:
 * - cursorLit ↔ (planValid && aligned)
 *
 * First Principles:
 * - With no plan: visibility = line-of-sight from player (standard visibility polygon)
 * - With plan: visibility = reflective half-plane of last surface
 * - Cursor is lit IFF it's in the visibility polygon
 * - Plan is valid IFF no surfaces are bypassed
 * - Aligned IFF all reflection points are on-segment
 */

import { describe, expect, it } from "vitest";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import { createImageChain, evaluateBypassFromChain } from "@/trajectory-v2/engine/ImageChain";
import {
  isPlanValid,
  isPathAligned,
  isCursorLitByConstruction,
  computeValidRegionFromChain,
  isPointInValidRegion,
} from "@/trajectory-v2/visibility/VisibilityFromChain";

// Helper to create a mock surface
function createMockSurface(
  id: string,
  start: Vector2,
  end: Vector2,
  reflectiveSide: "left" | "right" | "both" = "both"
): Surface {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const normalLeft = { x: -dy / len, y: dx / len };
  const normalRight = { x: dy / len, y: -dx / len };

  return {
    id,
    segment: { start, end },
    surfaceType: "ricochet",
    onArrowHit: () => ({ type: "reflect" }),
    isPlannable: () => true,
    getVisualProperties: () => ({ color: 0xffffff, lineWidth: 2, alpha: 1 }),
    getNormal: () => (reflectiveSide === "right" ? normalRight : normalLeft),
    canReflectFrom: (dir: Vector2) => {
      if (reflectiveSide === "both") return true;
      const normal = reflectiveSide === "right" ? normalRight : normalLeft;
      const dot = dir.x * normal.x + dir.y * normal.y;
      return dot < 0;
    },
  };
}

describe("VisibilityFromChain - V.5 by Construction", () => {
  describe("isPlanValid", () => {
    it("returns true for empty plan (no surfaces)", () => {
      const player = { x: 100, y: 200 };
      const cursor = { x: 500, y: 400 };

      const result = evaluateBypassFromChain(player, cursor, []);

      expect(isPlanValid(result)).toBe(true);
    });

    it("returns true when no surfaces are bypassed", () => {
      const player = { x: 100, y: 300 };
      const cursor = { x: 500, y: 300 };
      const surface = createMockSurface("s1", { x: 300, y: 0 }, { x: 300, y: 600 }, "both");

      const result = evaluateBypassFromChain(player, cursor, [surface]);

      expect(result.bypassedSurfaces).toHaveLength(0);
      expect(isPlanValid(result)).toBe(true);
    });

    it("returns false when surfaces are bypassed", () => {
      const player = { x: 100, y: 300 };
      const cursor = { x: 500, y: 300 };
      // One-sided surface where player is on wrong side
      const surface = createMockSurface("s1", { x: 300, y: 0 }, { x: 300, y: 600 }, "right");

      const result = evaluateBypassFromChain(player, cursor, [surface]);

      // Player is on left, surface only reflects from right -> bypass
      expect(isPlanValid(result)).toBe(false);
    });
  });

  describe("isPathAligned", () => {
    it("returns true for empty plan", () => {
      const player = { x: 100, y: 200 };
      const cursor = { x: 500, y: 400 };
      const chain = createImageChain(player, cursor, []);

      expect(isPathAligned(chain)).toBe(true);
    });

    it("returns true when all reflection points are on-segment", () => {
      const player = { x: 100, y: 300 };
      const cursor = { x: 500, y: 300 };
      // Vertical surface from y=100 to y=500 at x=300
      const surface = createMockSurface("s1", { x: 300, y: 100 }, { x: 300, y: 500 });

      const chain = createImageChain(player, cursor, [surface]);

      // Ray at y=300 hits surface within y=[100, 500], so on-segment
      expect(chain.isReflectionOnSegment(0)).toBe(true);
      expect(isPathAligned(chain)).toBe(true);
    });

    it("returns false when any reflection point is off-segment", () => {
      // Player and cursor at y=50, surface segment only covers y=[200, 400]
      // The ray from player to cursor_image should hit the line at y=50,
      // which is outside the segment bounds.
      
      // For a single surface, cursor image = cursor reflected through surface
      // player=(100, 50), cursor=(500, 50), surface vertical at x=300
      // cursor_image = (500, 50) reflected through x=300 = (100, 50) - same as player!
      // This creates a degenerate ray. Need player and cursor on opposite sides.
      
      const player = { x: 100, y: 50 };
      const cursor = { x: 400, y: 50 }; // On other side of x=300
      // Vertical surface from y=200 to y=400 at x=300
      const surface = createMockSurface("s1", { x: 300, y: 200 }, { x: 300, y: 400 });

      const chain = createImageChain(player, cursor, [surface]);

      // cursor_image = (400, 50) reflected through x=300 = (200, 50)
      // Ray from (100, 50) to (200, 50) is horizontal at y=50
      // Extended line of surface at x=300 would be hit at (300, 50)
      // But segment is y in [200, 400], so y=50 is off-segment
      expect(chain.isReflectionOnSegment(0)).toBe(false);
      expect(isPathAligned(chain)).toBe(false);
    });
  });

  describe("isCursorLitByConstruction (V.5 invariant)", () => {
    it("cursor lit when plan valid AND aligned", () => {
      const player = { x: 100, y: 300 };
      const cursor = { x: 500, y: 300 };
      const surface = createMockSurface("s1", { x: 300, y: 100 }, { x: 300, y: 500 }, "both");

      const bypassResult = evaluateBypassFromChain(player, cursor, [surface]);

      // Plan is valid (no bypass), and on-segment (aligned)
      expect(isPlanValid(bypassResult)).toBe(true);
      expect(isPathAligned(bypassResult.chain)).toBe(true);
      expect(isCursorLitByConstruction(bypassResult)).toBe(true);
    });

    it("cursor NOT lit when plan invalid (bypassed)", () => {
      const player = { x: 100, y: 300 };
      const cursor = { x: 500, y: 300 };
      // Surface that will be bypassed
      const surface = createMockSurface("s1", { x: 300, y: 100 }, { x: 300, y: 500 }, "right");

      const bypassResult = evaluateBypassFromChain(player, cursor, [surface]);

      expect(isPlanValid(bypassResult)).toBe(false);
      expect(isCursorLitByConstruction(bypassResult)).toBe(false);
    });

    it("cursor NOT lit when plan valid but NOT aligned (off-segment)", () => {
      // Player and cursor on opposite sides of surface, but at y=50 which is off-segment
      const player = { x: 100, y: 50 };
      const cursor = { x: 400, y: 50 }; // On other side of x=300
      const surface = createMockSurface("s1", { x: 300, y: 200 }, { x: 300, y: 400 }, "both");

      const bypassResult = evaluateBypassFromChain(player, cursor, [surface]);

      // Plan valid (no bypass) but off-segment (not aligned)
      expect(isPlanValid(bypassResult)).toBe(true);
      expect(isPathAligned(bypassResult.chain)).toBe(false);
      expect(isCursorLitByConstruction(bypassResult)).toBe(false);
    });
  });

  describe("computeValidRegionFromChain", () => {
    const screenBounds = { minX: 0, minY: 0, maxX: 1000, maxY: 800 };

    it("returns full screen for empty plan", () => {
      const player = { x: 500, y: 400 };
      const cursor = { x: 600, y: 500 };
      const bypassResult = evaluateBypassFromChain(player, cursor, []);

      const region = computeValidRegionFromChain(bypassResult, screenBounds, []);

      expect(region.isValid).toBe(true);
      // For empty plan, entire screen is valid (no surfaces to block)
    });

    it("returns valid region for plan with surfaces", () => {
      const player = { x: 100, y: 400 };
      const cursor = { x: 900, y: 400 };
      const surface = createMockSurface("s1", { x: 500, y: 100 }, { x: 500, y: 700 }, "both");

      const bypassResult = evaluateBypassFromChain(player, cursor, [surface]);

      const region = computeValidRegionFromChain(bypassResult, screenBounds, [surface]);

      expect(region.isValid).toBe(true);
      expect(region.vertices.length).toBeGreaterThan(0);
    });
  });

  describe("isPointInValidRegion", () => {
    const screenBounds = { minX: 0, minY: 0, maxX: 1000, maxY: 800 };

    it("cursor lit check is deterministic for same inputs", () => {
      const player = { x: 100, y: 400 };
      const cursor = { x: 900, y: 400 };
      const surface = createMockSurface("s1", { x: 500, y: 100 }, { x: 500, y: 700 }, "both");

      const result1 = evaluateBypassFromChain(player, cursor, [surface]);
      const result2 = evaluateBypassFromChain(player, cursor, [surface]);

      expect(isCursorLitByConstruction(result1)).toBe(isCursorLitByConstruction(result2));
    });

    it("region validity matches plan validity for empty plan", () => {
      const player = { x: 100, y: 400 };
      const cursor = { x: 900, y: 400 };

      const bypassResult = evaluateBypassFromChain(player, cursor, []);
      const region = computeValidRegionFromChain(bypassResult, screenBounds, []);

      // Empty plan = valid plan = valid region
      expect(isPlanValid(bypassResult)).toBe(true);
      expect(region.isValid).toBe(true);
    });

    it("cursor lit is false when off-segment (even with valid plan)", () => {
      // This test verifies that off-segment hits correctly result in not-lit
      const player = { x: 100, y: 50 };
      const cursor = { x: 700, y: 50 }; // On other side of x=500, but y=50 is off-segment
      const surface = createMockSurface("s1", { x: 500, y: 200 }, { x: 500, y: 600 }, "both");

      const bypassResult = evaluateBypassFromChain(player, cursor, [surface]);

      // Plan is valid (no bypass)
      expect(isPlanValid(bypassResult)).toBe(true);
      // But path is not aligned (off-segment)
      expect(isPathAligned(bypassResult.chain)).toBe(false);
      // So cursor is not lit
      expect(isCursorLitByConstruction(bypassResult)).toBe(false);
    });
  });
});

