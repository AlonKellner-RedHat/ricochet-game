/**
 * Light-Divergence Correlation Tests
 *
 * Tests for V.5 First Principle:
 * - When light reaches the cursor, there is NO divergence (isAligned = true)
 * - When light does NOT reach the cursor, there IS divergence (isAligned = false)
 *
 * This is the fundamental connection between the visibility system
 * and the trajectory divergence system.
 */

import { describe, it, expect } from "vitest";
import { createTestSurface, executeSetup } from "../matrix/MatrixTestRunner";
import type { TestSetup } from "../matrix/types";
import { propagateCone } from "@/trajectory-v2/visibility/ConePropagator";
import { buildOutline } from "@/trajectory-v2/visibility/OutlineBuilder";

// Screen bounds for outline building
const SCREEN_BOUNDS = {
  minX: 0,
  minY: 0,
  maxX: 1280,
  maxY: 720,
};

/**
 * Check if a point is inside a polygon using ray casting.
 */
function isPointInPolygon(
  point: { x: number; y: number },
  vertices: readonly { x: number; y: number }[]
): boolean {
  if (vertices.length < 3) return false;

  let inside = false;
  const n = vertices.length;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const vi = vertices[i]!;
    const vj = vertices[j]!;

    if (
      vi.y > point.y !== vj.y > point.y &&
      point.x < ((vj.x - vi.x) * (point.y - vi.y)) / (vj.y - vi.y) + vi.x
    ) {
      inside = !inside;
    }
  }

  return inside;
}

/**
 * Check if a point is on or very close to any surface segment.
 */
function isPointOnSurface(
  point: { x: number; y: number },
  surfaces: readonly { segment: { start: { x: number; y: number }; end: { x: number; y: number } } }[],
  tolerance: number = 2
): boolean {
  for (const surface of surfaces) {
    const { start, end } = surface.segment;

    // Check distance from point to line segment
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lenSq = dx * dx + dy * dy;

    if (lenSq < 0.0001) continue; // Degenerate segment

    // Project point onto line
    const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lenSq));
    const projX = start.x + t * dx;
    const projY = start.y + t * dy;

    // Check distance
    const distSq = (point.x - projX) ** 2 + (point.y - projY) ** 2;
    if (distSq < tolerance * tolerance) {
      return true;
    }
  }
  return false;
}

/**
 * Assert V.5: Light-Divergence Correlation
 */
function assertLightDivergenceCorrelation(setup: TestSetup): void {
  // Skip edge case: cursor is on or very close to a surface
  // The behavior at surface boundaries is ambiguous
  if (isPointOnSurface(setup.cursor, setup.allSurfaces)) {
    console.log(`Cursor: (${setup.cursor.x.toFixed(0)}, ${setup.cursor.y.toFixed(0)}) - SKIPPED (on surface)`);
    return;
  }

  // Calculate visibility
  const visibilityResult = propagateCone(
    setup.player,
    setup.plannedSurfaces,
    setup.allSurfaces
  );
  const outline = buildOutline(visibilityResult, SCREEN_BOUNDS, setup.allSurfaces);

  // Skip if visibility calculation failed
  expect(visibilityResult.success, "Visibility calculation should succeed").toBe(true);
  expect(outline.isValid, "Outline should be valid").toBe(true);

  const vertices = outline.vertices.map((v) => v.position);
  const cursorLit = isPointInPolygon(setup.cursor, vertices);

  // Execute trajectory calculation
  const results = executeSetup(setup);
  const isAligned = results.alignment.isFullyAligned;

  // Log for debugging
  console.log(`Cursor: (${setup.cursor.x.toFixed(0)}, ${setup.cursor.y.toFixed(0)})`);
  console.log(`Cursor lit: ${cursorLit}`);
  console.log(`Paths aligned: ${isAligned}`);
  console.log(`Outline vertices: ${vertices.length}`);

  // Core principle: light ↔ alignment
  if (cursorLit) {
    expect(
      isAligned,
      `Cursor at (${setup.cursor.x.toFixed(0)}, ${setup.cursor.y.toFixed(0)}) is LIT, so paths should be ALIGNED`
    ).toBe(true);
  } else {
    expect(
      isAligned,
      `Cursor at (${setup.cursor.x.toFixed(0)}, ${setup.cursor.y.toFixed(0)}) is in SHADOW, so paths should DIVERGE`
    ).toBe(false);
  }
}

describe("Light-Divergence Correlation (V.5)", () => {
  describe("User-Reported Violations", () => {
    /**
     * Exact setup from user's debug log that showed V.5 violation.
     * Player at (475.1, 666), cursor at (1101.2, 532.8)
     */
    it("user-reported: cursor at (1101, 533) should follow V.5", () => {
      const setup: TestSetup = {
        name: "user-reported-v5-violation",
        description: "User-reported V.5 violation setup",
        player: { x: 475.0969986000473, y: 666 },
        cursor: { x: 1101.192998966482, y: 532.7724665391969 },
        plannedSurfaces: [],
        allSurfaces: [
          createTestSurface({
            id: "floor",
            start: { x: 0, y: 700 },
            end: { x: 1280, y: 700 },
            canReflect: false,
          }),
          createTestSurface({
            id: "ceiling",
            start: { x: 0, y: 80 },
            end: { x: 1280, y: 80 },
            canReflect: false,
          }),
          createTestSurface({
            id: "left-wall",
            start: { x: 20, y: 80 },
            end: { x: 20, y: 700 },
            canReflect: false,
          }),
          createTestSurface({
            id: "right-wall",
            start: { x: 1260, y: 80 },
            end: { x: 1260, y: 700 },
            canReflect: false,
          }),
          createTestSurface({
            id: "platform-1",
            start: { x: 300, y: 450 },
            end: { x: 500, y: 450 },
            canReflect: false,
          }),
          createTestSurface({
            id: "platform-2",
            start: { x: 550, y: 350 },
            end: { x: 750, y: 350 },
            canReflect: false,
          }),
          createTestSurface({
            id: "ricochet-1",
            start: { x: 800, y: 150 },
            end: { x: 900, y: 250 },
            canReflect: true,
          }),
          createTestSurface({
            id: "ricochet-2",
            start: { x: 400, y: 250 },
            end: { x: 550, y: 250 },
            canReflect: true,
          }),
          createTestSurface({
            id: "ricochet-3",
            start: { x: 100, y: 200 },
            end: { x: 200, y: 300 },
            canReflect: true,
          }),
          createTestSurface({
            id: "ricochet-4",
            start: { x: 850, y: 350 },
            end: { x: 850, y: 500 },
            canReflect: true,
          }),
        ],
        expected: {},
        tags: ["user-reported", "v5-violation"],
      };

      assertLightDivergenceCorrelation(setup);
    });
  });

  describe("Simple Cases", () => {
    it("empty room: cursor anywhere should be lit and aligned", () => {
      const setup: TestSetup = {
        name: "empty-room-test",
        description: "Simple empty room",
        player: { x: 640, y: 400 },
        cursor: { x: 800, y: 300 },
        plannedSurfaces: [],
        allSurfaces: [
          createTestSurface({
            id: "floor",
            start: { x: 0, y: 700 },
            end: { x: 1280, y: 700 },
            canReflect: false,
          }),
          createTestSurface({
            id: "ceiling",
            start: { x: 0, y: 80 },
            end: { x: 1280, y: 80 },
            canReflect: false,
          }),
          createTestSurface({
            id: "left-wall",
            start: { x: 20, y: 80 },
            end: { x: 20, y: 700 },
            canReflect: false,
          }),
          createTestSurface({
            id: "right-wall",
            start: { x: 1260, y: 80 },
            end: { x: 1260, y: 700 },
            canReflect: false,
          }),
        ],
        expected: {},
        tags: ["simple"],
      };

      assertLightDivergenceCorrelation(setup);
    });

    it("cursor behind wall: should be in shadow and diverge", () => {
      const setup: TestSetup = {
        name: "cursor-behind-wall",
        description: "Cursor blocked by a wall",
        player: { x: 200, y: 400 },
        cursor: { x: 800, y: 400 },
        plannedSurfaces: [],
        allSurfaces: [
          createTestSurface({
            id: "floor",
            start: { x: 0, y: 700 },
            end: { x: 1280, y: 700 },
            canReflect: false,
          }),
          createTestSurface({
            id: "ceiling",
            start: { x: 0, y: 80 },
            end: { x: 1280, y: 80 },
            canReflect: false,
          }),
          createTestSurface({
            id: "left-wall",
            start: { x: 20, y: 80 },
            end: { x: 20, y: 700 },
            canReflect: false,
          }),
          createTestSurface({
            id: "right-wall",
            start: { x: 1260, y: 80 },
            end: { x: 1260, y: 700 },
            canReflect: false,
          }),
          createTestSurface({
            id: "blocking-wall",
            start: { x: 500, y: 200 },
            end: { x: 500, y: 600 },
            canReflect: false,
          }),
        ],
        expected: {},
        tags: ["shadow"],
      };

      assertLightDivergenceCorrelation(setup);
    });
  });

  describe("Grid Sampling", () => {
    const baseSetup = {
      name: "grid-base",
      description: "Base setup for grid sampling",
      player: { x: 475.1, y: 666 },
      allSurfaces: [
        createTestSurface({
          id: "floor",
          start: { x: 0, y: 700 },
          end: { x: 1280, y: 700 },
          canReflect: false,
        }),
        createTestSurface({
          id: "ceiling",
          start: { x: 0, y: 80 },
          end: { x: 1280, y: 80 },
          canReflect: false,
        }),
        createTestSurface({
          id: "left-wall",
          start: { x: 20, y: 80 },
          end: { x: 20, y: 700 },
          canReflect: false,
        }),
        createTestSurface({
          id: "right-wall",
          start: { x: 1260, y: 80 },
          end: { x: 1260, y: 700 },
          canReflect: false,
        }),
        createTestSurface({
          id: "platform-1",
          start: { x: 300, y: 450 },
          end: { x: 500, y: 450 },
          canReflect: false,
        }),
        createTestSurface({
          id: "platform-2",
          start: { x: 550, y: 350 },
          end: { x: 750, y: 350 },
          canReflect: false,
        }),
        createTestSurface({
          id: "ricochet-1",
          start: { x: 800, y: 150 },
          end: { x: 900, y: 250 },
          canReflect: true,
        }),
        createTestSurface({
          id: "ricochet-2",
          start: { x: 400, y: 250 },
          end: { x: 550, y: 250 },
          canReflect: true,
        }),
        createTestSurface({
          id: "ricochet-3",
          start: { x: 100, y: 200 },
          end: { x: 200, y: 300 },
          canReflect: true,
        }),
        createTestSurface({
          id: "ricochet-4",
          start: { x: 850, y: 350 },
          end: { x: 850, y: 500 },
          canReflect: true,
        }),
      ],
    };

    // Sample a grid of cursor positions (50 pixel step for reasonable test count)
    const gridStep = 100;
    const testPositions: { x: number; y: number }[] = [];

    for (let x = 100; x < 1200; x += gridStep) {
      for (let y = 150; y < 650; y += gridStep) {
        testPositions.push({ x, y });
      }
    }

    for (const cursor of testPositions) {
      it(`cursor at (${cursor.x}, ${cursor.y})`, () => {
        const setup: TestSetup = {
          ...baseSetup,
          name: `grid-${cursor.x}-${cursor.y}`,
          cursor,
          plannedSurfaces: [],
          expected: {},
          tags: ["grid-sample"],
        };

        assertLightDivergenceCorrelation(setup);
      });
    }
  });
});

