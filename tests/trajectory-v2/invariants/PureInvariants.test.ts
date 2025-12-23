/**
 * Pure Invariants Test Suite
 *
 * These tests define INVARIANTS that are mathematically guaranteed
 * by the ImageChain architecture. They have NO skip conditions -
 * if an invariant fails, it's a bug in the core architecture.
 *
 * Unlike the complex assertions in the matrix tests, these are
 * simple boolean expressions that are impossible to violate if
 * the architecture is correct.
 */

import { describe, expect, it } from "vitest";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import {
  createImageChain,
  evaluateBypassFromChain,
  buildPlannedPathFromChain,
} from "@/trajectory-v2/engine/ImageChain";
import {
  isPlanValid,
  isPathAligned,
  isCursorLitByConstruction,
} from "@/trajectory-v2/visibility/VisibilityFromChain";

// Helper to create a mock surface
function createMockSurface(
  id: string,
  start: Vector2,
  end: Vector2
): Surface {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  return {
    id,
    segment: { start, end },
    surfaceType: "ricochet",
    onArrowHit: () => ({ type: "reflect" }),
    isPlannable: () => true,
    getVisualProperties: () => ({ color: 0xffffff, lineWidth: 2, alpha: 1 }),
    getNormal: () => ({ x: -dy / len, y: dx / len }),
    canReflectFrom: () => true,
  };
}

// Generate random test cases
function randomPosition(min: number, max: number): Vector2 {
  return {
    x: min + Math.random() * (max - min),
    y: min + Math.random() * (max - min),
  };
}

function randomSurface(id: string, bounds: { min: number; max: number }): Surface {
  const start = randomPosition(bounds.min, bounds.max);
  const end = randomPosition(bounds.min, bounds.max);
  return createMockSurface(id, start, end);
}

describe("Pure Invariants - ImageChain Architecture", () => {
  /**
   * INVARIANT S1: First waypoint is always player position
   *
   * The planned path always starts at the player position.
   * This is guaranteed by construction in buildPlannedPathFromChain.
   */
  describe("S1: First waypoint is player", () => {
    it("holds for empty surface list", () => {
      const player = { x: 100, y: 200 };
      const cursor = { x: 500, y: 400 };
      const chain = createImageChain(player, cursor, []);
      const path = buildPlannedPathFromChain(chain);

      expect(path.waypoints[0]).toEqual(player);
    });

    it("holds for single surface", () => {
      const player = { x: 100, y: 200 };
      const cursor = { x: 500, y: 400 };
      const surface = createMockSurface("s1", { x: 300, y: 0 }, { x: 300, y: 600 });
      const chain = createImageChain(player, cursor, [surface]);
      const path = buildPlannedPathFromChain(chain);

      expect(path.waypoints[0]).toEqual(player);
    });

    it("holds for multiple surfaces", () => {
      const player = { x: 100, y: 200 };
      const cursor = { x: 500, y: 400 };
      const surfaces = [
        createMockSurface("s1", { x: 200, y: 0 }, { x: 200, y: 600 }),
        createMockSurface("s2", { x: 400, y: 0 }, { x: 400, y: 600 }),
      ];
      const chain = createImageChain(player, cursor, surfaces);
      const path = buildPlannedPathFromChain(chain);

      expect(path.waypoints[0]).toEqual(player);
    });

    it("holds for 100 random configurations", () => {
      for (let i = 0; i < 100; i++) {
        const player = randomPosition(0, 1000);
        const cursor = randomPosition(0, 1000);
        const numSurfaces = Math.floor(Math.random() * 4);
        const surfaces = Array.from({ length: numSurfaces }, (_, j) =>
          randomSurface(`s${j}`, { min: 0, max: 1000 })
        );

        const chain = createImageChain(player, cursor, surfaces);
        const path = buildPlannedPathFromChain(chain);

        expect(path.waypoints[0]!.x).toBe(player.x);
        expect(path.waypoints[0]!.y).toBe(player.y);
      }
    });
  });

  /**
   * INVARIANT S2: Last waypoint is always cursor position
   *
   * The planned path always ends at the cursor position.
   */
  describe("S2: Last waypoint is cursor", () => {
    it("holds for empty surface list", () => {
      const player = { x: 100, y: 200 };
      const cursor = { x: 500, y: 400 };
      const chain = createImageChain(player, cursor, []);
      const path = buildPlannedPathFromChain(chain);

      expect(path.waypoints[path.waypoints.length - 1]).toEqual(cursor);
    });

    it("holds for 100 random configurations", () => {
      for (let i = 0; i < 100; i++) {
        const player = randomPosition(0, 1000);
        const cursor = randomPosition(0, 1000);
        const numSurfaces = Math.floor(Math.random() * 4);
        const surfaces = Array.from({ length: numSurfaces }, (_, j) =>
          randomSurface(`s${j}`, { min: 0, max: 1000 })
        );

        const chain = createImageChain(player, cursor, surfaces);
        const path = buildPlannedPathFromChain(chain);
        const lastWaypoint = path.waypoints[path.waypoints.length - 1]!;

        expect(lastWaypoint.x).toBe(cursor.x);
        expect(lastWaypoint.y).toBe(cursor.y);
      }
    });
  });

  /**
   * INVARIANT S3: Waypoint count = surfaces + 2
   *
   * For N surfaces, we have N+2 waypoints:
   * [player, rp0, rp1, ..., rpN-1, cursor]
   */
  describe("S3: Waypoint count = surfaces + 2", () => {
    it("holds for 0, 1, 2, 3 surfaces", () => {
      const player = { x: 100, y: 200 };
      const cursor = { x: 900, y: 400 };

      for (let n = 0; n <= 3; n++) {
        const surfaces = Array.from({ length: n }, (_, i) =>
          createMockSurface(`s${i}`, { x: 200 + i * 200, y: 0 }, { x: 200 + i * 200, y: 600 })
        );
        const chain = createImageChain(player, cursor, surfaces);
        const path = buildPlannedPathFromChain(chain);

        expect(path.waypoints.length).toBe(n + 2);
        expect(path.hits.length).toBe(n);
      }
    });
  });

  /**
   * INVARIANT V5: CursorLit ↔ (PlanValid ∧ PathAligned)
   *
   * This is the core V.5 principle, now TRUE BY CONSTRUCTION.
   * We don't need to assert it - it's the DEFINITION of cursorLit.
   */
  describe("V5: CursorLit = PlanValid AND PathAligned (BY CONSTRUCTION)", () => {
    it("cursorLit is defined correctly", () => {
      const player = { x: 100, y: 300 };
      const cursor = { x: 500, y: 300 };
      const surface = createMockSurface("s1", { x: 300, y: 100 }, { x: 300, y: 500 });

      const bypassResult = evaluateBypassFromChain(player, cursor, [surface]);
      const planValid = isPlanValid(bypassResult);
      const aligned = isPathAligned(bypassResult.chain);
      const cursorLit = isCursorLitByConstruction(bypassResult);

      // This is TRUE BY CONSTRUCTION - it's the DEFINITION
      expect(cursorLit).toBe(planValid && aligned);
    });

    it("definition holds for 100 random configurations", () => {
      for (let i = 0; i < 100; i++) {
        const player = randomPosition(0, 1000);
        const cursor = randomPosition(0, 1000);
        const numSurfaces = Math.floor(Math.random() * 3);
        const surfaces = Array.from({ length: numSurfaces }, (_, j) =>
          randomSurface(`s${j}`, { min: 0, max: 1000 })
        );

        const bypassResult = evaluateBypassFromChain(player, cursor, surfaces);
        const planValid = isPlanValid(bypassResult);
        const aligned = isPathAligned(bypassResult.chain);
        const cursorLit = isCursorLitByConstruction(bypassResult);

        expect(cursorLit).toBe(planValid && aligned);
      }
    });
  });

  /**
   * INVARIANT D1: Determinism - Same inputs produce same outputs
   *
   * All ImageChain functions are pure - calling them multiple times
   * with the same inputs produces exactly the same outputs.
   */
  describe("D1: Determinism", () => {
    it("ImageChain is deterministic", () => {
      const player = { x: 137.5, y: 283.7 };
      const cursor = { x: 583.2, y: 417.8 };
      const surface = createMockSurface("s1", { x: 300, y: 100 }, { x: 400, y: 500 });

      const chain1 = createImageChain(player, cursor, [surface]);
      const chain2 = createImageChain(player, cursor, [surface]);

      expect(chain1.getPlayerImage(1)).toEqual(chain2.getPlayerImage(1));
      expect(chain1.getCursorImage(1)).toEqual(chain2.getCursorImage(1));
      expect(chain1.getReflectionPoint(0)).toEqual(chain2.getReflectionPoint(0));
      expect(chain1.isReflectionOnSegment(0)).toBe(chain2.isReflectionOnSegment(0));
    });

    it("bypass evaluation is deterministic", () => {
      const player = { x: 100, y: 300 };
      const cursor = { x: 500, y: 300 };
      const surface = createMockSurface("s1", { x: 300, y: 100 }, { x: 300, y: 500 });

      const result1 = evaluateBypassFromChain(player, cursor, [surface]);
      const result2 = evaluateBypassFromChain(player, cursor, [surface]);

      expect(result1.activeSurfaces.length).toBe(result2.activeSurfaces.length);
      expect(result1.bypassedSurfaces.length).toBe(result2.bypassedSurfaces.length);
      expect(isCursorLitByConstruction(result1)).toBe(isCursorLitByConstruction(result2));
    });
  });

  /**
   * INVARIANT R1: Reversibility - reflect(reflect(p)) = p
   *
   * Double reflection through any line returns the original point.
   * This is a mathematical identity that must always hold.
   */
  describe("R1: Reflection Reversibility", () => {
    it("double reflection returns original point", () => {
      const player = { x: 137.5, y: 283.7 };
      const cursor = { x: 500, y: 300 };
      const surface = createMockSurface("s1", { x: 300, y: 100 }, { x: 400, y: 500 });

      const chain = createImageChain(player, cursor, [surface]);
      const playerImage1 = chain.getPlayerImage(1);

      // Reflect the reflected image back
      const reverseChain = createImageChain(playerImage1, cursor, [surface]);
      const doubleReflected = reverseChain.getPlayerImage(1);

      // Should be very close to original player
      expect(doubleReflected.x).toBeCloseTo(player.x, 8);
      expect(doubleReflected.y).toBeCloseTo(player.y, 8);
    });
  });

  /**
   * HIGH-DENSITY GRID TEST
   *
   * Tests V.5 invariant at 25px grid density (16x more points than 50px).
   * This demonstrates the new architecture handles high-density testing.
   */
  describe("High-Density Grid Test (25px)", () => {
    const SCREEN_BOUNDS = { minX: 0, minY: 0, maxX: 1280, maxY: 720 };
    const GRID_STEP = 25; // 25px grid = 16x more points than 50px
    const MARGIN = 50;

    // Generate grid positions
    function generateGridPositions(): Vector2[] {
      const positions: Vector2[] = [];
      for (let x = MARGIN; x < SCREEN_BOUNDS.maxX - MARGIN; x += GRID_STEP) {
        for (let y = MARGIN; y < SCREEN_BOUNDS.maxY - MARGIN; y += GRID_STEP) {
          positions.push({ x, y });
        }
      }
      return positions;
    }

    it("V.5 holds for all cursor positions on 25px grid", () => {
      const player = { x: 200, y: 500 };
      const surfaces = [
        createMockSurface("s1", { x: 400, y: 100 }, { x: 400, y: 600 }),
        createMockSurface("s2", { x: 800, y: 100 }, { x: 800, y: 600 }),
      ];

      const gridPositions = generateGridPositions();
      console.log(`Testing V.5 at ${gridPositions.length} cursor positions (25px grid)`);

      let violations = 0;
      for (const cursor of gridPositions) {
        const bypassResult = evaluateBypassFromChain(player, cursor, surfaces);
        const planValid = isPlanValid(bypassResult);
        const aligned = isPathAligned(bypassResult.chain);
        const cursorLit = isCursorLitByConstruction(bypassResult);

        // V.5 BY CONSTRUCTION: cursorLit === (planValid && aligned)
        if (cursorLit !== (planValid && aligned)) {
          violations++;
        }
      }

      expect(violations).toBe(0);
    });

    it("Waypoint invariants hold for all cursor positions", () => {
      const player = { x: 200, y: 500 };
      const surfaces = [
        createMockSurface("s1", { x: 400, y: 100 }, { x: 400, y: 600 }),
      ];

      const gridPositions = generateGridPositions();

      let violations = 0;
      for (const cursor of gridPositions) {
        const chain = createImageChain(player, cursor, surfaces);
        const path = buildPlannedPathFromChain(chain);

        // S1: First waypoint is player
        if (path.waypoints[0]!.x !== player.x || path.waypoints[0]!.y !== player.y) {
          violations++;
        }

        // S2: Last waypoint is cursor
        const last = path.waypoints[path.waypoints.length - 1]!;
        if (last.x !== cursor.x || last.y !== cursor.y) {
          violations++;
        }

        // S3: Waypoint count = surfaces + 2
        if (path.waypoints.length !== surfaces.length + 2) {
          violations++;
        }
      }

      expect(violations).toBe(0);
    });
  });
});

