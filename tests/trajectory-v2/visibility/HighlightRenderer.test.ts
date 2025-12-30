/**
 * HighlightRenderer Tests
 *
 * TDD tests for the dashed polygon outline renderer.
 * Tests focus on the polygon rendering logic, not Phaser-specific rendering.
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";
import {
  type DashPattern,
  HighlightRenderer,
  type HighlightRendererConfig,
  generateDashedPath,
} from "@/trajectory-v2/visibility/HighlightRenderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

// =============================================================================
// DASHED PATH GENERATION TESTS
// =============================================================================

describe("HighlightRenderer - Dashed Path Generation", () => {
  describe("generateDashedPath", () => {
    const defaultPattern: DashPattern = { dashLength: 10, gapLength: 5 };

    it("generates segments along a straight horizontal line", () => {
      const start: Vector2 = { x: 0, y: 0 };
      const end: Vector2 = { x: 50, y: 0 };

      const segments = generateDashedPath(start, end, defaultPattern);

      // With dash=10, gap=5, total pattern=15
      // Line length=50, so we get: dash(0-10), gap(10-15), dash(15-25), gap(25-30), dash(30-40), gap(40-45), dash(45-50)
      // Actually with full dashes: (0-10), (15-25), (30-40), (45-50) - partial at end
      expect(segments.length).toBeGreaterThanOrEqual(3);

      // First segment should start at origin
      expect(segments[0]!.start.x).toBeCloseTo(0);
      expect(segments[0]!.start.y).toBeCloseTo(0);
    });

    it("generates segments along a diagonal line", () => {
      const start: Vector2 = { x: 0, y: 0 };
      const end: Vector2 = { x: 30, y: 40 }; // length = 50

      const segments = generateDashedPath(start, end, defaultPattern);

      expect(segments.length).toBeGreaterThanOrEqual(2);

      // First segment should start at origin
      expect(segments[0]!.start.x).toBeCloseTo(0);
      expect(segments[0]!.start.y).toBeCloseTo(0);

      // Last segment should end at or before the endpoint
      const lastSeg = segments[segments.length - 1]!;
      expect(lastSeg.end.x).toBeLessThanOrEqual(end.x + 0.1);
      expect(lastSeg.end.y).toBeLessThanOrEqual(end.y + 0.1);
    });

    it("handles short lines with single dash", () => {
      const start: Vector2 = { x: 0, y: 0 };
      const end: Vector2 = { x: 5, y: 0 }; // length = 5, less than dash length

      const segments = generateDashedPath(start, end, defaultPattern);

      // Should have at least one segment covering the whole line
      expect(segments.length).toBe(1);
      expect(segments[0]!.start.x).toBeCloseTo(0);
      expect(segments[0]!.end.x).toBeCloseTo(5);
    });

    it("uses custom dash pattern", () => {
      const start: Vector2 = { x: 0, y: 0 };
      const end: Vector2 = { x: 100, y: 0 };
      const pattern: DashPattern = { dashLength: 20, gapLength: 10 };

      const segments = generateDashedPath(start, end, pattern);

      // With dash=20, gap=10, total=30
      // Dashes at: 0-20, 30-50, 60-80, 90-100
      expect(segments.length).toBeGreaterThanOrEqual(3);
    });
  });
});

// =============================================================================
// POLYGON OUTLINE TESTS
// =============================================================================

describe("HighlightRenderer - Polygon Outline", () => {
  let mockGraphics: {
    clear: ReturnType<typeof vi.fn>;
    lineStyle: ReturnType<typeof vi.fn>;
    moveTo: ReturnType<typeof vi.fn>;
    lineTo: ReturnType<typeof vi.fn>;
    strokePath: ReturnType<typeof vi.fn>;
    beginPath: ReturnType<typeof vi.fn>;
    closePath: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockGraphics = {
      clear: vi.fn(),
      lineStyle: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      strokePath: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
    };
  });

  describe("HighlightRenderer", () => {
    it("renders triangle cone outline with dashes", () => {
      const config: HighlightRendererConfig = {
        color: 0xffff00,
        alpha: 1,
        lineWidth: 2,
        dashPattern: { dashLength: 10, gapLength: 5 },
      };

      const renderer = new HighlightRenderer(mockGraphics as never, config);

      const triangle: Vector2[] = [
        { x: 100, y: 200 },
        { x: 50, y: 100 },
        { x: 150, y: 100 },
      ];

      renderer.renderPolygonOutline(triangle);

      // Should have called clear
      expect(mockGraphics.clear).toHaveBeenCalled();

      // Should have set line style
      expect(mockGraphics.lineStyle).toHaveBeenCalledWith(2, 0xffff00, 1);

      // Should have drawn multiple line segments (dashes)
      expect(mockGraphics.moveTo.mock.calls.length).toBeGreaterThan(0);
      expect(mockGraphics.lineTo.mock.calls.length).toBeGreaterThan(0);
    });

    it("renders quadrilateral cone outline", () => {
      const config: HighlightRendererConfig = {
        color: 0xffff00,
        alpha: 1,
        lineWidth: 2,
        dashPattern: { dashLength: 8, gapLength: 4 },
      };

      const renderer = new HighlightRenderer(mockGraphics as never, config);

      const quad: Vector2[] = [
        { x: 100, y: 200 },
        { x: 50, y: 100 },
        { x: 150, y: 100 },
        { x: 120, y: 180 },
      ];

      renderer.renderPolygonOutline(quad);

      expect(mockGraphics.clear).toHaveBeenCalled();
      expect(mockGraphics.moveTo.mock.calls.length).toBeGreaterThan(0);
    });

    it("handles empty polygon gracefully", () => {
      const config: HighlightRendererConfig = {
        color: 0xffff00,
        alpha: 1,
        lineWidth: 2,
        dashPattern: { dashLength: 10, gapLength: 5 },
      };

      const renderer = new HighlightRenderer(mockGraphics as never, config);

      renderer.renderPolygonOutline([]);

      // Should clear but not crash
      expect(mockGraphics.clear).toHaveBeenCalled();
    });

    it("clears previous rendering", () => {
      const config: HighlightRendererConfig = {
        color: 0xffff00,
        alpha: 1,
        lineWidth: 2,
        dashPattern: { dashLength: 10, gapLength: 5 },
      };

      const renderer = new HighlightRenderer(mockGraphics as never, config);

      const triangle: Vector2[] = [
        { x: 100, y: 200 },
        { x: 50, y: 100 },
        { x: 150, y: 100 },
      ];

      // Render twice
      renderer.renderPolygonOutline(triangle);
      renderer.renderPolygonOutline(triangle);

      // Should have cleared twice
      expect(mockGraphics.clear).toHaveBeenCalledTimes(2);
    });
  });
});

// =============================================================================
// MULTIPLE CONES RENDERING TESTS
// =============================================================================

describe("HighlightRenderer - Multiple Cones", () => {
  let mockGraphics: {
    clear: ReturnType<typeof vi.fn>;
    lineStyle: ReturnType<typeof vi.fn>;
    moveTo: ReturnType<typeof vi.fn>;
    lineTo: ReturnType<typeof vi.fn>;
    strokePath: ReturnType<typeof vi.fn>;
    beginPath: ReturnType<typeof vi.fn>;
    closePath: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    mockGraphics = {
      clear: vi.fn(),
      lineStyle: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      strokePath: vi.fn(),
      beginPath: vi.fn(),
      closePath: vi.fn(),
    };
  });

  it("renders multiple cone outlines", () => {
    const config: HighlightRendererConfig = {
      color: 0xffff00,
      alpha: 1,
      lineWidth: 2,
      dashPattern: { dashLength: 10, gapLength: 5 },
    };

    const renderer = new HighlightRenderer(mockGraphics as never, config);

    const cones: Vector2[][] = [
      [
        { x: 100, y: 200 },
        { x: 50, y: 100 },
        { x: 75, y: 100 },
      ],
      [
        { x: 100, y: 200 },
        { x: 125, y: 100 },
        { x: 150, y: 100 },
      ],
    ];

    renderer.renderMultipleOutlines(cones);

    // Should have rendered dashes for both cones
    expect(mockGraphics.moveTo.mock.calls.length).toBeGreaterThan(3);
  });

  it("clears only once when rendering multiple cones", () => {
    const config: HighlightRendererConfig = {
      color: 0xffff00,
      alpha: 1,
      lineWidth: 2,
      dashPattern: { dashLength: 10, gapLength: 5 },
    };

    const renderer = new HighlightRenderer(mockGraphics as never, config);

    const cones: Vector2[][] = [
      [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 20, y: 0 },
      ],
      [
        { x: 30, y: 0 },
        { x: 40, y: 10 },
        { x: 50, y: 0 },
      ],
    ];

    renderer.renderMultipleOutlines(cones);

    // Should clear only once at the beginning
    expect(mockGraphics.clear).toHaveBeenCalledTimes(1);
  });
});

