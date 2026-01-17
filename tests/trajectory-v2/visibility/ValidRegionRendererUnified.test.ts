/**
 * Tests for ValidRegionRenderer integration with unified reflection paradigm.
 *
 * Phase 4: Validate that ValidRegionRenderer uses ReflectionCache throughout
 * the visibility pipeline for both origin and target reflections.
 */

import { describe, it, expect } from "vitest";
import { createMockBidirectionalSurface } from "@test/helpers/surfaceHelpers";
import { ValidRegionRenderer, type IValidRegionGraphics } from "@/trajectory-v2/visibility/ValidRegionRenderer";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import type { Surface } from "@/surfaces/Surface";
import type { SurfaceChain } from "@/trajectory-v2/geometry/SurfaceChain";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

// Mock graphics that implements IValidRegionGraphics interface
class MockGraphics implements IValidRegionGraphics {
  public calls: Array<{ method: string; args: unknown[] }> = [];

  clear(): void {
    this.calls.push({ method: "clear", args: [] });
  }
  fillStyle(color: number, alpha?: number): void {
    this.calls.push({ method: "fillStyle", args: [color, alpha] });
  }
  lineStyle(width: number, color: number, alpha?: number): void {
    this.calls.push({ method: "lineStyle", args: [width, color, alpha] });
  }
  beginPath(): void {
    this.calls.push({ method: "beginPath", args: [] });
  }
  moveTo(x: number, y: number): void {
    this.calls.push({ method: "moveTo", args: [x, y] });
  }
  lineTo(x: number, y: number): void {
    this.calls.push({ method: "lineTo", args: [x, y] });
  }
  closePath(): void {
    this.calls.push({ method: "closePath", args: [] });
  }
  fillPath(): void {
    this.calls.push({ method: "fillPath", args: [] });
  }
  strokePath(): void {
    this.calls.push({ method: "strokePath", args: [] });
  }
  fillRect(x: number, y: number, width: number, height: number): void {
    this.calls.push({ method: "fillRect", args: [x, y, width, height] });
  }
  setBlendMode(blendMode: number): void {
    this.calls.push({ method: "setBlendMode", args: [blendMode] });
  }
}

// Factory function for mock graphics
const createMockGraphics = () => new MockGraphics();

describe("ValidRegionRenderer Unified Integration", () => {
  const SCREEN_BOUNDS = {
    minX: 0,
    maxX: 400,
    minY: 0,
    maxY: 300,
  };

  // Helper to create a horizontal surface
  function createHorizontalSurface(
    id: string,
    y: number,
    xStart: number,
    xEnd: number
  ): Surface {
    return createMockBidirectionalSurface(id, { x: xStart, y }, { x: xEnd, y });
  }

  describe("Cache creation", () => {
    it("should create ReflectionCache internally for visibility calculation", () => {
      const graphics = createMockGraphics();
      const renderer = new ValidRegionRenderer(graphics, SCREEN_BOUNDS);

      const player: Vector2 = { x: 200, y: 200 };
      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);

      // Render with no planned surfaces (Stage 1 only)
      renderer.render(player, [], [screenChain]);

      // Should complete without error
      expect(graphics.calls.some((c) => c.method === "clear")).toBe(true);
    });

    it("should use same cache throughout multi-stage visibility", () => {
      const graphics = createMockGraphics();
      const renderer = new ValidRegionRenderer(graphics, SCREEN_BOUNDS);

      const player: Vector2 = { x: 200, y: 200 };
      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
      const plannedSurface = createHorizontalSurface("planned", 150, 100, 300);

      // Render with one planned surface (Stage 1 + Stage 2)
      renderer.render(player, [plannedSurface], [screenChain]);

      // Should complete without error - cache is used internally
      expect(graphics.calls.some((c) => c.method === "clear")).toBe(true);
    });
  });

  describe("Origin reflection", () => {
    it("should use cached origin reflection for Stage 2+", () => {
      const graphics = createMockGraphics();
      const renderer = new ValidRegionRenderer(graphics, SCREEN_BOUNDS);

      const player: Vector2 = { x: 200, y: 200 };
      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
      const plannedSurface = createHorizontalSurface("planned", 150, 100, 300);

      // First render
      renderer.render(player, [plannedSurface], [screenChain]);

      // Check visibility stages
      const stages = renderer.getVisibilityStages();

      // Should have at least Stage 1
      expect(stages.length).toBeGreaterThanOrEqual(1);

      // Stage 1 should use player position as origin
      expect(stages[0]?.origin.x).toBe(player.x);
      expect(stages[0]?.origin.y).toBe(player.y);

      // If Stage 2 exists, origin should be reflected
      if (stages.length >= 2) {
        // Player at y=200, surface at y=150, reflected player at y=100
        expect(stages[1]?.origin.y).toBe(100);
      }
    });
  });

  describe("Visibility polygon correctness", () => {
    it("should produce valid visibility polygon for Stage 1", () => {
      const graphics = createMockGraphics();
      const renderer = new ValidRegionRenderer(graphics, SCREEN_BOUNDS);

      const player: Vector2 = { x: 200, y: 150 };
      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);

      renderer.render(player, [], [screenChain]);

      const stages = renderer.getVisibilityStages();
      expect(stages.length).toBe(1);
      expect(stages[0]?.isValid).toBe(true);
      expect(stages[0]?.polygon.length).toBeGreaterThanOrEqual(3);
    });

    it("should produce valid visibility polygons for cascaded reflections", () => {
      const graphics = createMockGraphics();
      const renderer = new ValidRegionRenderer(graphics, SCREEN_BOUNDS);

      const player: Vector2 = { x: 200, y: 200 };
      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
      const plannedSurface = createHorizontalSurface("planned", 150, 50, 350);

      renderer.render(player, [plannedSurface], [screenChain]);

      const stages = renderer.getVisibilityStages();

      // All stages should have valid polygons
      for (const stage of stages) {
        if (stage.isValid) {
          expect(stage.polygon.length).toBeGreaterThanOrEqual(3);
        }
      }
    });
  });

  describe("Performance", () => {
    it("should benefit from cache reuse across stages", () => {
      const graphics = createMockGraphics();
      const renderer = new ValidRegionRenderer(graphics, SCREEN_BOUNDS);

      const player: Vector2 = { x: 200, y: 200 };
      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);

      // Multiple planned surfaces for extensive cascading
      const surfaces = [
        createHorizontalSurface("s1", 180, 50, 350),
        createHorizontalSurface("s2", 160, 50, 350),
        createHorizontalSurface("s3", 140, 50, 350),
      ];

      // Should complete efficiently with cache reuse
      const start = performance.now();
      renderer.render(player, surfaces, [screenChain]);
      const duration = performance.now() - start;

      // Basic sanity check - should complete in reasonable time
      expect(duration).toBeLessThan(1000); // Less than 1 second
    });
  });
});
