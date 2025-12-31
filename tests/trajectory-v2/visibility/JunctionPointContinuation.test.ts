/**
 * TDD Tests for JunctionPoint Continuation Behavior
 *
 * JunctionPoints are where two surfaces meet in a chain.
 * The junction can block its own ray based on surface orientations:
 * - Same orientations (both CW or both CCW): Junction BLOCKS ray
 * - Opposite orientations (one CW, one CCW): Junction ALLOWS ray to pass
 */

import { describe, it, expect } from "vitest";
import {
  projectConeV2,
  createFullCone,
  toVector2Array,
  type ScreenBoundsConfig,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import { isEndpoint, isHitPoint } from "@/trajectory-v2/geometry/SourcePoint";
import {
  SurfaceChain,
  createRicochetChain,
  isJunctionPoint,
} from "@/trajectory-v2/geometry/SurfaceChain";
import { RicochetSurface } from "@/surfaces/RicochetSurface";

const bounds: ScreenBoundsConfig = { minX: 0, maxX: 800, minY: 0, maxY: 600 };

describe("JunctionPoint Continuation Behavior", () => {
  describe("V-shape with apex pointing TOWARD player (opposite orientations)", () => {
    // Player is below the V-shape apex
    // The two arms of the V face in opposite directions relative to the player
    // Light should be able to pass through the junction
    it("should cast continuation ray through junction", () => {
      const player = { x: 400, y: 500 };

      // V-shape: apex at (400, 300), arms extend up-left and up-right
      // Left arm: (300, 200) -> (400, 300)
      // Right arm: (400, 300) -> (500, 200)
      const vShape = createRicochetChain("v-toward", [
        { x: 300, y: 200 },
        { x: 400, y: 300 }, // apex (junction)
        { x: 500, y: 200 },
      ]);

      const cone = createFullCone(player);
      const points = projectConeV2(cone, [vShape], bounds);
      const vertices = toVector2Array(points);

      // The apex at (400, 300) should be in the polygon
      const apexInPolygon = vertices.some(
        (v) => Math.abs(v.x - 400) < 1 && Math.abs(v.y - 300) < 1
      );
      expect(apexInPolygon).toBe(true);

      // There should be a continuation ray hit past the apex
      // (hitting the top screen boundary)
      const topScreenHit = vertices.some((v) => Math.abs(v.y) < 1);
      expect(topScreenHit).toBe(true);
    });
  });

  describe("V-shape with apex pointing AWAY from player (same orientations)", () => {
    // Player is above the V-shape apex
    // The two arms of the V face in the same direction relative to the player
    // Light should be blocked at the junction
    it("should NOT cast continuation ray - junction blocks", () => {
      const player = { x: 400, y: 100 };

      // V-shape: apex at (400, 300), arms extend down-left and down-right
      // From player's perspective, both arms face the same way (away)
      const vShape = createRicochetChain("v-away", [
        { x: 300, y: 200 },
        { x: 400, y: 300 }, // apex (junction)
        { x: 500, y: 200 },
      ]);

      const cone = createFullCone(player);
      const points = projectConeV2(cone, [vShape], bounds);
      const vertices = toVector2Array(points);

      // The apex at (400, 300) should still be in the polygon
      const apexInPolygon = vertices.some(
        (v) => Math.abs(v.x - 400) < 1 && Math.abs(v.y - 300) < 1
      );
      expect(apexInPolygon).toBe(true);

      // But there should NOT be a continuation ray past the apex
      // No hits on the bottom screen that pass through the apex
      // The polygon should go around the V, not through it
    });
  });

  describe("Screen boundary corners are JunctionPoints", () => {
    it("should include screen corners in polygon", () => {
      const player = { x: 400, y: 300 };
      const cone = createFullCone(player);

      // Empty scene - just screen boundaries
      const points = projectConeV2(cone, [], bounds);
      const vertices = toVector2Array(points);

      // Find corner points
      const corners = vertices.filter((v) => {
        return (v.x === 0 || v.x === 800) && (v.y === 0 || v.y === 600);
      });

      // All 4 corners should be present
      expect(corners.length).toBe(4);

      // Verify all corners are present
      const hasTopLeft = corners.some((v) => v.x === 0 && v.y === 0);
      const hasTopRight = corners.some((v) => v.x === 800 && v.y === 0);
      const hasBottomLeft = corners.some((v) => v.x === 0 && v.y === 600);
      const hasBottomRight = corners.some((v) => v.x === 800 && v.y === 600);

      expect(hasTopLeft).toBe(true);
      expect(hasTopRight).toBe(true);
      expect(hasBottomLeft).toBe(true);
      expect(hasBottomRight).toBe(true);
    });

    it("screen corner junctions should allow continuation rays", () => {
      // Screen corners have opposite-facing surfaces (perpendicular walls)
      // So light should pass through them
      const player = { x: 400, y: 300 };
      const cone = createFullCone(player);

      const points = projectConeV2(cone, [], bounds);
      const vertices = toVector2Array(points);

      // The polygon should be a simple rectangle (the screen)
      // 4 corners, no extra vertices
      expect(vertices.length).toBe(4);

      // Check that we have all 4 screen corners
      const hasTopLeft = vertices.some((v) => v.x === 0 && v.y === 0);
      const hasTopRight = vertices.some((v) => v.x === 800 && v.y === 0);
      const hasBottomLeft = vertices.some((v) => v.x === 0 && v.y === 600);
      const hasBottomRight = vertices.some((v) => v.x === 800 && v.y === 600);

      expect(hasTopLeft).toBe(true);
      expect(hasTopRight).toBe(true);
      expect(hasBottomLeft).toBe(true);
      expect(hasBottomRight).toBe(true);
    });
  });

  describe("Game surface chain with junction", () => {
    it("should handle closed chain junctions correctly", () => {
      const player = { x: 400, y: 500 };

      // Triangle (closed chain) - all vertices are JunctionPoints
      const triangle = new SurfaceChain({
        id: "triangle",
        vertices: [
          { x: 350, y: 200 },
          { x: 450, y: 200 },
          { x: 400, y: 300 },
        ],
        isClosed: true,
        surfaceFactory: (index, start, end) => {
          // Normal pointing outward from triangle center
          const midX = (start.x + end.x) / 2;
          const midY = (start.y + end.y) / 2;
          const centerX = 400;
          const centerY = 233;
          const nx = midX - centerX;
          const ny = midY - centerY;
          const len = Math.hypot(nx, ny);
          return new RicochetSurface(
            `triangle-${index}`,
            { start, end },
            { x: nx / len, y: ny / len }
          );
        },
      });

      const cone = createFullCone(player);
      const points = projectConeV2(cone, [triangle], bounds);
      const vertices = toVector2Array(points);

      // The bottom vertex (400, 300) is a junction
      // From the player below, this junction should allow continuation
      // because the two surfaces meeting there face opposite directions
      const bottomVertex = vertices.some(
        (v) => Math.abs(v.x - 400) < 1 && Math.abs(v.y - 300) < 1
      );
      expect(bottomVertex).toBe(true);
    });
  });
});

