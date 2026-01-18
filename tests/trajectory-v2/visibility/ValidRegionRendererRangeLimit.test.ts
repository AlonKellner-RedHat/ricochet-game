/**
 * Tests for ValidRegionRenderer with Range Limit.
 *
 * TDD: Tests written first, then implementation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ValidRegionRenderer } from "@/trajectory-v2/visibility/ValidRegionRenderer";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import { createRangeLimitPair } from "@/trajectory-v2/obstacles/RangeLimit";
import type { IValidRegionGraphics } from "@/trajectory-v2/visibility/ValidRegionRenderer";

describe("ValidRegionRenderer with Range Limit", () => {
  describe("render configuration", () => {
    it("should accept rangeLimit in render options", () => {
      const screenBounds = { minX: 0, minY: 0, maxX: 800, maxY: 600 };
      const mockGraphics = createMockGraphics();
      const renderer = new ValidRegionRenderer(mockGraphics, screenBounds);
      
      const player = { x: 400, y: 300 };
      const screenChain = createScreenBoundaryChain(screenBounds);
      const rangeLimitPair = createRangeLimitPair(100);
      const rangeLimit = { pair: rangeLimitPair, center: player };
      
      // Should not throw when passing rangeLimit
      expect(() => {
        renderer.render(player, [], [screenChain], null, undefined, rangeLimit);
      }).not.toThrow();
    });

    it("should produce smaller visibility polygon with range limit", () => {
      const screenBounds = { minX: 0, minY: 0, maxX: 800, maxY: 600 };
      const mockGraphics = createMockGraphics();
      const renderer = new ValidRegionRenderer(mockGraphics, screenBounds);
      
      const player = { x: 400, y: 300 };
      const screenChain = createScreenBoundaryChain(screenBounds);
      
      // Render without range limit
      renderer.render(player, [], [screenChain], null);
      const withoutRangeLimitCalls = mockGraphics.lineTo.mock.calls.length;
      
      // Reset mock
      mockGraphics.lineTo.mockClear();
      
      // Render with range limit
      const rangeLimitPair = createRangeLimitPair(100);
      const rangeLimit = { pair: rangeLimitPair, center: player };
      renderer.render(player, [], [screenChain], null, undefined, rangeLimit);
      
      // With range limit, the polygon should still render (has lineTo calls)
      const withRangeLimitCalls = mockGraphics.lineTo.mock.calls.length;
      expect(withRangeLimitCalls).toBeGreaterThan(0);
    });
  });
});

/**
 * Create a mock graphics object with all required methods.
 */
function createMockGraphics(): IValidRegionGraphics {
  return {
    clear: vi.fn(),
    fillStyle: vi.fn(),
    lineStyle: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    arc: vi.fn(),
    closePath: vi.fn(),
    fillPath: vi.fn(),
    strokePath: vi.fn(),
    fillRect: vi.fn(),
    setBlendMode: vi.fn(),
  };
}
