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

    it("should produce visibility polygon with range limit using lineTo and arc", () => {
      const screenBounds = { minX: 0, minY: 0, maxX: 800, maxY: 600 };
      const mockGraphics = createMockGraphics();
      const renderer = new ValidRegionRenderer(mockGraphics, screenBounds);
      
      const player = { x: 400, y: 300 };
      const screenChain = createScreenBoundaryChain(screenBounds);
      
      // Render with range limit
      const rangeLimitPair = createRangeLimitPair(100);
      const rangeLimit = { pair: rangeLimitPair, center: player };
      renderer.render(player, [], [screenChain], null, undefined, rangeLimit);
      
      // With range limit, the polygon should render using a mix of lineTo and arc
      // At least one of them should be called
      const lineToCallCount = mockGraphics.lineTo.mock.calls.length;
      const arcCallCount = mockGraphics.arc.mock.calls.length;
      expect(lineToCallCount + arcCallCount).toBeGreaterThan(0);
    });
  });

  describe("arc rendering", () => {
    it("should call arc() when range limit is active and has consecutive range_limit vertices", () => {
      const screenBounds = { minX: 0, minY: 0, maxX: 800, maxY: 600 };
      const mockGraphics = createMockGraphics();
      const renderer = new ValidRegionRenderer(mockGraphics, screenBounds);
      
      const player = { x: 400, y: 300 };
      const screenChain = createScreenBoundaryChain(screenBounds);
      
      // Use a small range limit so most rays hit it (not screen boundary)
      const rangeLimitPair = createRangeLimitPair(100);
      const rangeLimit = { pair: rangeLimitPair, center: player };
      
      renderer.render(player, [], [screenChain], null, undefined, rangeLimit);
      
      // arc() should be called for range limit edge sections
      expect(mockGraphics.arc).toHaveBeenCalled();
    });

    it("should NOT call arc() when no range limit is provided", () => {
      const screenBounds = { minX: 0, minY: 0, maxX: 800, maxY: 600 };
      const mockGraphics = createMockGraphics();
      const renderer = new ValidRegionRenderer(mockGraphics, screenBounds);
      
      const player = { x: 400, y: 300 };
      const screenChain = createScreenBoundaryChain(screenBounds);
      
      // Render without range limit
      renderer.render(player, [], [screenChain], null);
      
      // arc() should NOT be called (no range limit)
      expect(mockGraphics.arc).not.toHaveBeenCalled();
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
