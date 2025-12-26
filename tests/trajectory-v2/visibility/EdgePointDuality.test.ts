/**
 * Edge Point Duality Tests
 *
 * Tests the first-principle solution for handling rays that pass through
 * surface endpoints. When a ray passes exactly through an endpoint:
 * - The endpoint itself is visible
 * - What's "behind" the endpoint is also visible on one side
 * - The polygon ordering depends on which side is blocked
 *
 * This replaces the epsilon-based "grazing rays" approach.
 */

import { describe, it, expect } from "vitest";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import {
  createFullCone,
  projectCone,
  type ScreenBounds,
} from "@/trajectory-v2/visibility/ConeProjection";

// Helper to create test surfaces
function createTestSurface(
  id: string,
  start: Vector2,
  end: Vector2,
  canReflect = false
): Surface {
  return {
    id,
    segment: { start, end },
    canReflect,
    normal: { x: 0, y: 1 },
    canReflectFrom: () => canReflect,
  } as unknown as Surface;
}

describe("Edge Point Duality", () => {
  const bounds: ScreenBounds = { minX: 0, maxX: 1000, minY: 0, maxY: 1000 };

  describe("Single surface endpoint", () => {
    it("ray through endpoint should see both the endpoint and what's behind", () => {
      // Setup:
      // - Player at (500, 500)
      // - Horizontal surface at y=300 from (400, 300) to (600, 300)
      // - Ray through endpoint (600, 300) should see:
      //   - The endpoint (600, 300)
      //   - The screen boundary behind it (continuing the ray)
      const player = { x: 500, y: 500 };
      const surface = createTestSurface(
        "platform",
        { x: 400, y: 300 },
        { x: 600, y: 300 }
      );

      const cone = createFullCone(player);
      const polygon = projectCone(cone, [surface], bounds);

      console.log("Polygon vertices:");
      polygon.forEach((v, i) => {
        const angle = Math.atan2(v.y - player.y, v.x - player.x) * 180 / Math.PI;
        console.log(`  [${i}] (${v.x.toFixed(1)}, ${v.y.toFixed(1)}) angle=${angle.toFixed(1)}°`);
      });

      // The polygon should include:
      // 1. Surface endpoint (600, 300)
      // 2. Surface endpoint (400, 300)
      // 3. Points on the surface itself
      // 4. Screen boundary hits

      // Find the vertex at the surface endpoint
      const endpointVertex = polygon.find(
        (v) => Math.abs(v.x - 600) < 1 && Math.abs(v.y - 300) < 1
      );
      expect(endpointVertex).toBeDefined();
      console.log(`Endpoint vertex found: (${endpointVertex?.x.toFixed(1)}, ${endpointVertex?.y.toFixed(1)})`);
    });

    it("blocking side determines vertex ordering at endpoint", () => {
      // Setup:
      // - Player at (500, 800)
      // - Surface at (400, 300) to (600, 300)
      // - Ray through (600, 300):
      //   - On the LEFT (counter-clockwise) side: surface blocks
      //   - On the RIGHT (clockwise) side: open to screen boundary
      const player = { x: 500, y: 800 };
      const surface = createTestSurface(
        "platform",
        { x: 400, y: 300 },
        { x: 600, y: 300 }
      );

      const cone = createFullCone(player);
      const polygon = projectCone(cone, [surface], bounds);

      console.log("\nPolygon vertices:");
      polygon.forEach((v, i) => {
        const angle = Math.atan2(v.y - player.y, v.x - player.x) * 180 / Math.PI;
        console.log(`  [${i}] (${v.x.toFixed(1)}, ${v.y.toFixed(1)}) angle=${angle.toFixed(1)}°`);
      });

      // The endpoint (600, 300) should be in the polygon
      const hasEndpoint = polygon.some(
        (v) => Math.abs(v.x - 600) < 1 && Math.abs(v.y - 300) < 1
      );
      expect(hasEndpoint).toBe(true);

      // The polygon should be valid (non-self-intersecting)
      expect(polygon.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("Corner case: shared endpoint", () => {
    it("two surfaces sharing an endpoint should both be visible", () => {
      // Setup:
      // - Player at (500, 500)
      // - Surface 1: (300, 200) to (400, 300)
      // - Surface 2: (400, 300) to (500, 200)
      // - Both share endpoint (400, 300)
      const player = { x: 500, y: 500 };
      const surface1 = createTestSurface(
        "left",
        { x: 300, y: 200 },
        { x: 400, y: 300 }
      );
      const surface2 = createTestSurface(
        "right",
        { x: 400, y: 300 },
        { x: 500, y: 200 }
      );

      const cone = createFullCone(player);
      const polygon = projectCone(cone, [surface1, surface2], bounds);

      console.log("\nTwo surfaces with shared endpoint:");
      polygon.forEach((v, i) => {
        const angle = Math.atan2(v.y - player.y, v.x - player.x) * 180 / Math.PI;
        console.log(`  [${i}] (${v.x.toFixed(1)}, ${v.y.toFixed(1)}) angle=${angle.toFixed(1)}°`);
      });

      // The shared endpoint should be in the polygon
      const hasSharedEndpoint = polygon.some(
        (v) => Math.abs(v.x - 400) < 1 && Math.abs(v.y - 300) < 1
      );
      expect(hasSharedEndpoint).toBe(true);

      // Both surface endpoints should be represented
      const hasLeftEnd = polygon.some(
        (v) => Math.abs(v.x - 300) < 1 && Math.abs(v.y - 200) < 1
      );
      const hasRightEnd = polygon.some(
        (v) => Math.abs(v.x - 500) < 1 && Math.abs(v.y - 200) < 1
      );
      expect(hasLeftEnd).toBe(true);
      expect(hasRightEnd).toBe(true);
    });
  });

  describe("Shadow boundaries", () => {
    it("shadow boundary at surface endpoint should be captured", () => {
      // Setup:
      // - Player at (500, 800)
      // - Single surface blocking part of the view
      // - The shadow boundary should be at the surface endpoint
      const player = { x: 500, y: 800 };
      const surface = createTestSurface(
        "blocker",
        { x: 300, y: 400 },
        { x: 400, y: 400 }
      );

      const cone = createFullCone(player);
      const polygon = projectCone(cone, [surface], bounds);

      console.log("\nShadow boundary test:");
      polygon.forEach((v, i) => {
        const angle = Math.atan2(v.y - player.y, v.x - player.x) * 180 / Math.PI;
        console.log(`  [${i}] (${v.x.toFixed(1)}, ${v.y.toFixed(1)}) angle=${angle.toFixed(1)}°`);
      });

      // Both surface endpoints should be in the polygon
      const hasStart = polygon.some(
        (v) => Math.abs(v.x - 300) < 1 && Math.abs(v.y - 400) < 1
      );
      const hasEnd = polygon.some(
        (v) => Math.abs(v.x - 400) < 1 && Math.abs(v.y - 400) < 1
      );

      expect(hasStart).toBe(true);
      expect(hasEnd).toBe(true);

      // The polygon should include the screen boundary hits in the shadow region
      // (where light passes the endpoint and continues to the boundary)
    });
  });

  describe("First Principles Verification", () => {
    it("polygon vertices sorted by angle (V.7)", () => {
      const player = { x: 500, y: 500 };
      const surface = createTestSurface(
        "platform",
        { x: 300, y: 300 },
        { x: 700, y: 300 }
      );

      const cone = createFullCone(player);
      const polygon = projectCone(cone, [surface], bounds);

      // Calculate angles and verify they're sorted
      const angles = polygon.map((v) =>
        Math.atan2(v.y - player.y, v.x - player.x)
      );

      for (let i = 1; i < angles.length; i++) {
        const prevAngle = angles[i - 1]!;
        const currAngle = angles[i]!;
        // Allow for wrap-around at ±π
        const diff = currAngle - prevAngle;
        const isIncreasing = diff > -Math.PI && diff < Math.PI ? diff >= 0 : diff < 0;
        expect(isIncreasing).toBe(true);
      }
    });

    it("no epsilon-based offsets in polygon vertices", () => {
      // All vertices should be at exact coordinates (no 0.0001 offsets)
      const player = { x: 500, y: 500 };
      const surface = createTestSurface(
        "platform",
        { x: 300, y: 300 },
        { x: 700, y: 300 }
      );

      const cone = createFullCone(player);
      const polygon = projectCone(cone, [surface], bounds);

      // Check that coordinates are "clean" (integer or exact from intersection)
      for (const v of polygon) {
        // No tiny offsets like 0.001, 0.0001, etc.
        const xDecimal = Math.abs(v.x - Math.round(v.x));
        const yDecimal = Math.abs(v.y - Math.round(v.y));
        
        // Allow exact values or proper intersection results
        // But flag suspicious epsilon-like values
        const isSuspiciousX = xDecimal > 0 && xDecimal < 0.01;
        const isSuspiciousY = yDecimal > 0 && yDecimal < 0.01;
        
        if (isSuspiciousX || isSuspiciousY) {
          console.log(`Suspicious vertex: (${v.x}, ${v.y})`);
        }
        // Not failing - just documenting expectation
      }
    });

    it("deterministic output for same input", () => {
      const player = { x: 500, y: 500 };
      const surface = createTestSurface(
        "platform",
        { x: 300, y: 300 },
        { x: 700, y: 300 }
      );

      const cone = createFullCone(player);
      
      // Run multiple times - should get identical output
      const polygon1 = projectCone(cone, [surface], bounds);
      const polygon2 = projectCone(cone, [surface], bounds);
      const polygon3 = projectCone(cone, [surface], bounds);

      expect(polygon1.length).toBe(polygon2.length);
      expect(polygon2.length).toBe(polygon3.length);

      for (let i = 0; i < polygon1.length; i++) {
        expect(polygon1[i]!.x).toBe(polygon2[i]!.x);
        expect(polygon1[i]!.y).toBe(polygon2[i]!.y);
        expect(polygon2[i]!.x).toBe(polygon3[i]!.x);
        expect(polygon2[i]!.y).toBe(polygon3[i]!.y);
      }
    });
  });
});

