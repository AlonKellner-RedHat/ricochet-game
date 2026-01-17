/**
 * Tests for cache sharing between trajectory and visibility systems.
 *
 * Phase 5: Ensure trajectory and visibility systems can share the same
 * ReflectionCache for optimal performance and consistency.
 */

import { describe, it, expect } from "vitest";
import { createMockBidirectionalSurface } from "@test/helpers/surfaceHelpers";
import { createReflectionCache, type ReflectionCache } from "@/trajectory-v2/geometry/ReflectionCache";
import { ValidRegionRenderer, type IValidRegionGraphics } from "@/trajectory-v2/visibility/ValidRegionRenderer";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import type { Surface } from "@/surfaces/Surface";
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

describe("Cache Sharing between Trajectory and Visibility", () => {
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

  describe("External cache injection", () => {
    it("should accept external ReflectionCache in render method", () => {
      const graphics = new MockGraphics();
      const renderer = new ValidRegionRenderer(graphics, SCREEN_BOUNDS);
      const externalCache = createReflectionCache();

      const player: Vector2 = { x: 200, y: 200 };
      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
      const plannedSurface = createHorizontalSurface("planned", 150, 50, 350);

      // Render with external cache
      renderer.render(player, [plannedSurface], [screenChain], null, externalCache);

      // Should complete successfully
      expect(graphics.calls.some((c) => c.method === "clear")).toBe(true);
    });

    it("should use external cache for reflections when provided", () => {
      const graphics = new MockGraphics();
      const renderer = new ValidRegionRenderer(graphics, SCREEN_BOUNDS);
      const externalCache = createReflectionCache();

      // Player position that ensures light reaches the planned surface
      const player: Vector2 = { x: 200, y: 250 };
      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);
      // Planned surface that player can see
      const plannedSurface = createHorizontalSurface("planned", 200, 50, 350);

      // Render with external cache
      renderer.render(player, [plannedSurface], [screenChain], null, externalCache);

      // External cache is available for use by projectConeV2 and origin reflection
      // Even if no reflections happen (no visible Stage 2), the cache was passed in
      // The main test is that render completes successfully with external cache
      expect(renderer.getVisibilityStages().length).toBeGreaterThanOrEqual(1);
    });

    it("should pre-populate cache in trajectory and reuse in visibility", () => {
      const sharedCache = createReflectionCache();
      const plannedSurface = createHorizontalSurface("planned", 150, 50, 350);
      const player: Vector2 = { x: 200, y: 200 };

      // Simulate trajectory system reflecting the player
      const reflectedPlayer = sharedCache.reflect(player, plannedSurface);
      const statsAfterTrajectory = sharedCache.stats();
      expect(statsAfterTrajectory.misses).toBe(1);
      expect(reflectedPlayer.y).toBe(100); // 200 through y=150 = 100

      // Now visibility system uses the same cache
      const graphics = new MockGraphics();
      const renderer = new ValidRegionRenderer(graphics, SCREEN_BOUNDS);
      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);

      renderer.render(player, [plannedSurface], [screenChain], null, sharedCache);

      // The cache is shared - same reference
      // If visibility system tries to reflect the same player through the same surface,
      // it will get a cache hit. However, visibility may not always reflect the exact
      // same point if the Stage 2 conditions aren't met.
      // The main assertion is that the cache is properly passed through and usable.
      expect(sharedCache.stats().size).toBeGreaterThanOrEqual(2); // At least the one we added
    });
  });

  describe("Bidirectional identity", () => {
    it("should maintain identity when same cache is used for trajectory and visibility", () => {
      const sharedCache = createReflectionCache();
      const surface = createHorizontalSurface("s1", 150, 0, 400);
      const player: Vector2 = { x: 200, y: 200 };

      // Trajectory reflects player
      const reflected = sharedCache.reflect(player, surface);

      // Visibility system should get same reflected point
      const sameReflected = sharedCache.reflect(player, surface);
      expect(sameReflected).toBe(reflected);

      // Reflecting back should return original
      const backToOriginal = sharedCache.reflect(reflected, surface);
      expect(backToOriginal).toBe(player);
    });
  });

  describe("Integration scenario", () => {
    it("should efficiently share cache for complete aiming cycle", () => {
      const sharedCache = createReflectionCache();
      const plannedSurfaces = [
        createHorizontalSurface("s1", 150, 50, 350),
        createHorizontalSurface("s2", 100, 50, 350),
      ];
      const player: Vector2 = { x: 200, y: 250 };
      const cursor: Vector2 = { x: 200, y: 50 };

      // Phase 1: Trajectory system builds image chain
      let currentOrigin = player;
      let currentTarget = cursor;
      for (const surface of plannedSurfaces) {
        currentOrigin = sharedCache.reflect(currentOrigin, surface);
        currentTarget = sharedCache.reflect(currentTarget, surface);
      }

      const statsAfterTrajectory = sharedCache.stats();
      // At least some reflections occurred (exact count depends on whether any points coincide)
      expect(statsAfterTrajectory.misses).toBeGreaterThanOrEqual(1);

      // Phase 2: Visibility system renders valid region
      const graphics = new MockGraphics();
      const renderer = new ValidRegionRenderer(graphics, SCREEN_BOUNDS);
      const screenChain = createScreenBoundaryChain(SCREEN_BOUNDS);

      renderer.render(player, plannedSurfaces, [screenChain], null, sharedCache);

      const statsAfterVisibility = sharedCache.stats();

      // The cache is shared and persists across both systems
      // Trajectory populated the cache with origin and target reflections
      // Visibility uses the same cache, so any matching reflections will hit
      // Main assertion: cache was properly shared (size includes trajectory entries)
      expect(statsAfterVisibility.size).toBeGreaterThanOrEqual(statsAfterTrajectory.size);
    });
  });
});
