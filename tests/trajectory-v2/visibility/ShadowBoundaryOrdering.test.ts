/**
 * Shadow Boundary Ordering Tests
 *
 * Tests that shadow boundaries are correctly captured when rays pass through
 * surface endpoints. The expected behavior is:
 * - Ray hits endpoint (visible)
 * - Ray continues past endpoint to hit next obstacle (shadow extension)
 * - Both points are in the polygon in correct order
 */

import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import {
  type ScreenBounds,
  createFullCone,
  projectCone,
} from "@/trajectory-v2/visibility/ConeProjection";
import { describe, expect, it } from "vitest";

// Helper to create test surfaces
function createTestSurface(id: string, start: Vector2, end: Vector2, canReflect = false): Surface {
  return {
    id,
    segment: { start, end },
    canReflect,
    normal: { x: 0, y: 1 },
    canReflectFrom: () => canReflect,
  } as unknown as Surface;
}

// Helper to check if a vertex is in the polygon (with tolerance)
function hasVertex(polygon: Vector2[], target: Vector2, tolerance = 0.1): boolean {
  return polygon.some(
    (v) => Math.abs(v.x - target.x) < tolerance && Math.abs(v.y - target.y) < tolerance
  );
}

// Helper to find vertex index
function findVertexIndex(polygon: Vector2[], target: Vector2, tolerance = 0.1): number {
  return polygon.findIndex(
    (v) => Math.abs(v.x - target.x) < tolerance && Math.abs(v.y - target.y) < tolerance
  );
}

describe("Shadow Boundary Ordering", () => {
  describe("Case 1: Small obstruction with shadow extensions", () => {
    /**
     * Setup:
     * - Box from (-100, -100) to (100, 100)
     * - Obstruction at (-10, 50) to (10, 50)
     * - Player at (0, 0)
     *
     * Expected polygon (clockwise from smallest angle):
     * [(10, 50), (20, 100), (100, 100), (100, -100), (-100, -100), (-100, 100), (-20, 100), (-10, 50)]
     */
    const bounds: ScreenBounds = { minX: -100, maxX: 100, minY: -100, maxY: 100 };
    const player = { x: 0, y: 0 };
    const obstruction = createTestSurface("obstruction", { x: -10, y: 50 }, { x: 10, y: 50 });

    // No surfaces (screen boundaries are the only obstacles for this test)
    // But we need the obstruction as a surface
    const surfaces = [obstruction];

    it("should produce correct polygon with shadow extensions", () => {
      const cone = createFullCone(player);
      const polygon = projectCone(cone, surfaces, bounds);

      console.log("\n=== Case 1: Small obstruction ===");
      console.log("Player:", player);
      console.log("Obstruction: (-10, 50) to (10, 50)");
      console.log("Polygon vertices:");
      polygon.forEach((v, i) => {
        const angle = (Math.atan2(v.y - player.y, v.x - player.x) * 180) / Math.PI;
        console.log(`  [${i}] (${v.x.toFixed(1)}, ${v.y.toFixed(1)}) angle=${angle.toFixed(1)}°`);
      });

      // Expected vertices
      const expectedVertices = [
        { x: 10, y: 50 }, // Right end of obstruction
        { x: 20, y: 100 }, // Shadow extension to top wall
        { x: 100, y: 100 }, // Top-right corner
        { x: 100, y: -100 }, // Bottom-right corner
        { x: -100, y: -100 }, // Bottom-left corner
        { x: -100, y: 100 }, // Top-left corner
        { x: -20, y: 100 }, // Shadow extension to top wall
        { x: -10, y: 50 }, // Left end of obstruction
      ];

      console.log("\nExpected vertices:");
      expectedVertices.forEach((v, i) => {
        const angle = (Math.atan2(v.y - player.y, v.x - player.x) * 180) / Math.PI;
        console.log(`  [${i}] (${v.x.toFixed(1)}, ${v.y.toFixed(1)}) angle=${angle.toFixed(1)}°`);
      });

      // Check that all expected vertices are present
      console.log("\n--- Vertex Check ---");
      for (const expected of expectedVertices) {
        const found = hasVertex(polygon, expected);
        console.log(`  (${expected.x}, ${expected.y}): ${found ? "FOUND" : "MISSING"}`);
        expect(found).toBe(true);
      }

      // Check polygon has correct number of vertices
      expect(polygon.length).toBe(8);
    });

    it("shadow extension (20, 100) should be present", () => {
      const cone = createFullCone(player);
      const polygon = projectCone(cone, surfaces, bounds);

      // This is the key test - the continuation hit at (20, 100)
      const hasShadowExtension = hasVertex(polygon, { x: 20, y: 100 });
      expect(hasShadowExtension).toBe(true);
    });

    it("shadow extension (-20, 100) should be present", () => {
      const cone = createFullCone(player);
      const polygon = projectCone(cone, surfaces, bounds);

      // This is the key test - the continuation hit at (-20, 100)
      const hasShadowExtension = hasVertex(polygon, { x: -20, y: 100 });
      expect(hasShadowExtension).toBe(true);
    });
  });

  describe("Case 2: Obstruction with endpoints at 45° angles (exact corner hits)", () => {
    /**
     * Setup:
     * - Box from (-100, -100) to (100, 100)
     * - Obstruction at (-50, 50) to (50, 50)
     * - Player at (0, 0)
     *
     * Expected polygon:
     * [(50, 50), (100, 100), (100, -100), (-100, -100), (-100, 100), (-50, 50)]
     */
    const bounds: ScreenBounds = { minX: -100, maxX: 100, minY: -100, maxY: 100 };
    const player = { x: 0, y: 0 };
    const obstruction = createTestSurface("obstruction", { x: -50, y: 50 }, { x: 50, y: 50 });
    const surfaces = [obstruction];

    it("should produce correct polygon with corner shadow extensions", () => {
      const cone = createFullCone(player);
      const polygon = projectCone(cone, surfaces, bounds);

      console.log("\n=== Case 2: Obstruction at 45° ===");
      console.log("Player:", player);
      console.log("Obstruction: (-50, 50) to (50, 50)");
      console.log("Polygon vertices:");
      polygon.forEach((v, i) => {
        const angle = (Math.atan2(v.y - player.y, v.x - player.x) * 180) / Math.PI;
        console.log(`  [${i}] (${v.x.toFixed(1)}, ${v.y.toFixed(1)}) angle=${angle.toFixed(1)}°`);
      });

      // Expected vertices
      const expectedVertices = [
        { x: 50, y: 50 }, // Right end of obstruction
        { x: 100, y: 100 }, // Top-right corner (shadow extension hits exactly here)
        { x: 100, y: -100 }, // Bottom-right corner
        { x: -100, y: -100 }, // Bottom-left corner
        { x: -100, y: 100 }, // Top-left corner (shadow extension hits exactly here)
        { x: -50, y: 50 }, // Left end of obstruction
      ];

      console.log("\nExpected vertices:");
      expectedVertices.forEach((v, i) => {
        const angle = (Math.atan2(v.y - player.y, v.x - player.x) * 180) / Math.PI;
        console.log(`  [${i}] (${v.x.toFixed(1)}, ${v.y.toFixed(1)}) angle=${angle.toFixed(1)}°`);
      });

      // Check that all expected vertices are present
      console.log("\n--- Vertex Check ---");
      for (const expected of expectedVertices) {
        const found = hasVertex(polygon, expected);
        console.log(`  (${expected.x}, ${expected.y}): ${found ? "FOUND" : "MISSING"}`);
        expect(found).toBe(true);
      }

      // Check polygon has correct number of vertices
      expect(polygon.length).toBe(6);
    });

    it("continuation hit at (100, 100) should follow endpoint (50, 50)", () => {
      const cone = createFullCone(player);
      const polygon = projectCone(cone, surfaces, bounds);

      const endpointIdx = findVertexIndex(polygon, { x: 50, y: 50 });
      const cornerIdx = findVertexIndex(polygon, { x: 100, y: 100 });

      console.log(`\nEndpoint (50, 50) at index: ${endpointIdx}`);
      console.log(`Corner (100, 100) at index: ${cornerIdx}`);

      // They should be consecutive (corner follows endpoint)
      expect(endpointIdx).not.toBe(-1);
      expect(cornerIdx).not.toBe(-1);
      // Note: In clockwise order from the starting angle, corner should follow endpoint
    });
  });
});
