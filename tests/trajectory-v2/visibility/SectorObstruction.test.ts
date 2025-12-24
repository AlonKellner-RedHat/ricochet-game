/**
 * SectorObstruction.test.ts - TDD tests for sector obstruction blocking
 *
 * Tests that obstructions between the origin and planned surface
 * correctly block/restrict the sectors, resulting in restricted visibility.
 */

import { describe, it, expect } from "vitest";
import { propagateWithIntermediates } from "@/trajectory-v2/visibility/AnalyticalPropagation";
import { createTestSurface } from "./testHelpers";

const bounds = { minX: 0, maxX: 1280, minY: 0, maxY: 720 };

describe("Sector Obstruction Blocking", () => {
  describe("platform blocking surface", () => {
    it("platform-1 blocking ricochet-2 produces restricted valid[1]", () => {
      // Player below platform-1, which is below ricochet-2
      // Platform-1 blocks most of the path to ricochet-2
      const player = { x: 410.2, y: 666 };
      const ricochet2 = createTestSurface(
        "ricochet-2",
        { x: 400, y: 250 },
        { x: 550, y: 250 },
        true
      );
      const platform1 = createTestSurface(
        "platform-1",
        { x: 300, y: 450 },
        { x: 500, y: 450 },
        false
      );

      const result = propagateWithIntermediates(
        player,
        [ricochet2],
        [ricochet2, platform1],
        bounds
      );

      // Platform-1 (x=300-500, y=450) blocks most of the path to
      // ricochet-2 (x=400-550, y=250) from player (x=410, y=666)
      // Only the x=500-550 portion of the surface might be reachable
      // valid[1] should have very restricted or empty visibility
      expect(result.validPolygons[1]).toBeDefined();
      
      // The blocked sectors should result in a much smaller polygon
      // If fully blocked, polygon would be empty or have few vertices
      // We expect at most a small triangle or restricted area
      const valid1Vertices = result.validPolygons[1]!.polygon.length;
      
      // Should be significantly smaller than the 37+ vertices of valid[0]
      expect(valid1Vertices).toBeLessThan(15);
    });

    it("no obstruction leaves sectors unchanged", () => {
      // Player can see the surface directly without obstruction
      const player = { x: 475, y: 666 }; // Centered under ricochet-2
      const ricochet2 = createTestSurface(
        "ricochet-2",
        { x: 400, y: 250 },
        { x: 550, y: 250 },
        true
      );
      // No platform-1 in the way
      const floor = createTestSurface(
        "floor",
        { x: 0, y: 700 },
        { x: 1280, y: 700 },
        false
      );
      const ceiling = createTestSurface(
        "ceiling",
        { x: 0, y: 80 },
        { x: 1280, y: 80 },
        false
      );

      const result = propagateWithIntermediates(
        player,
        [ricochet2],
        [ricochet2, floor, ceiling],
        bounds
      );

      // Without obstruction, valid[1] should have a reasonable polygon
      expect(result.validPolygons[1]).toBeDefined();
      expect(result.validPolygons[1]!.polygon.length).toBeGreaterThan(3);
    });

    it("partial obstruction creates split sectors", () => {
      // Platform only covers part of the surface's angular extent
      const player = { x: 550, y: 666 }; // Right side of surface
      const ricochet2 = createTestSurface(
        "ricochet-2",
        { x: 400, y: 250 },
        { x: 550, y: 250 },
        true
      );
      // Platform covers left portion only
      const platform1 = createTestSurface(
        "platform-1",
        { x: 300, y: 450 },
        { x: 450, y: 450 },
        false
      );

      const result = propagateWithIntermediates(
        player,
        [ricochet2],
        [ricochet2, platform1],
        bounds
      );

      // Some visibility should remain for the unblocked portion
      expect(result.validPolygons[1]).toBeDefined();
      expect(result.validPolygons[1]!.polygon.length).toBeGreaterThan(0);
    });
  });

  describe("user reported case", () => {
    it("matches expected behavior - obstructed surface has restricted visibility", () => {
      // This is the exact case from the user's debug log
      const player = { x: 410.2218191000002, y: 666 };
      const cursor = { x: 551.209552058213, y: 557.5525812619503 };

      const ricochet2 = createTestSurface(
        "ricochet-2",
        { x: 400, y: 250 },
        { x: 550, y: 250 },
        true
      );

      const allSurfaces = [
        createTestSurface("floor", { x: 0, y: 700 }, { x: 1280, y: 700 }, false),
        createTestSurface("ceiling", { x: 0, y: 80 }, { x: 1280, y: 80 }, false),
        createTestSurface("left-wall", { x: 20, y: 80 }, { x: 20, y: 700 }, false),
        createTestSurface("right-wall", { x: 1260, y: 80 }, { x: 1260, y: 700 }, false),
        createTestSurface("platform-1", { x: 300, y: 450 }, { x: 500, y: 450 }, false),
        createTestSurface("platform-2", { x: 550, y: 350 }, { x: 750, y: 350 }, false),
        createTestSurface("ricochet-1", { x: 800, y: 150 }, { x: 900, y: 250 }, true),
        ricochet2,
        createTestSurface("ricochet-3", { x: 100, y: 200 }, { x: 200, y: 300 }, true),
        createTestSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 }, true),
      ];

      const result = propagateWithIntermediates(
        player,
        [ricochet2],
        allSurfaces,
        bounds
      );

      // Platform-1 and platform-2 block most of the path to ricochet-2
      // valid[1] should be heavily restricted
      expect(result.validPolygons[1]).toBeDefined();
      
      // The user expects very restricted or no visibility due to obstructions
      // If the surface is fully obstructed, valid[1] should be empty or very small
      const valid1 = result.validPolygons[1]!;
      
      // Check that cursor is NOT in the visibility polygon
      // (since the surface is obstructed)
      function isPointInPolygon(
        point: { x: number; y: number },
        polygon: readonly { x: number; y: number }[]
      ): boolean {
        if (polygon.length < 3) return false;
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
          const xi = polygon[i]!.x, yi = polygon[i]!.y;
          const xj = polygon[j]!.x, yj = polygon[j]!.y;
          if (
            yi > point.y !== yj > point.y &&
            point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi
          ) {
            inside = !inside;
          }
        }
        return inside;
      }

      // The cursor at (551, 557) should NOT be lit since
      // the path to ricochet-2 is blocked by platform-1
      const cursorLit = isPointInPolygon(cursor, valid1.polygon);
      
      // This should fail with current implementation (no blocking)
      // and pass after we integrate blocking
      expect(cursorLit).toBe(false);
    });
  });
});

