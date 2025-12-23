/**
 * Tests for ImageChain Ray Interface
 *
 * TDD tests for ray-based methods in ImageChain.
 * These rays form the foundation for unified trajectory/visibility calculation.
 */

import { describe, it, expect } from "vitest";
import { createImageChain } from "@/trajectory-v2/engine/ImageChain";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import { intersectRaySegment, type Segment } from "@/trajectory-v2/geometry/RayCore";

// Helper to create a test surface
function createTestSurface(
  id: string,
  start: Vector2,
  end: Vector2,
  canReflect = true
): Surface {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  return {
    id,
    segment: { start, end },
    surfaceType: canReflect ? "ricochet" : "wall",
    onArrowHit: () => ({ type: canReflect ? "reflect" : "stop" }),
    isPlannable: () => canReflect,
    getVisualProperties: () => ({ color: 0xffffff, lineWidth: 2, alpha: 1 }),
    getNormal: () => ({ x: -dy / len, y: dx / len }),
    canReflectFrom: () => canReflect,
  };
}

describe("ImageChain Ray Interface", () => {
  describe("getRay", () => {
    it("returns ray from player to cursor for empty plan", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 500, y: 300 };

      const chain = createImageChain(player, cursor, []);
      const ray = chain.getRay(0);

      expect(ray.source).toEqual(player);
      expect(ray.target).toEqual(cursor);
    });

    it("returns ray from playerImage[0] to cursorImage[1] for single surface", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 150, y: 300 };
      const surface = createTestSurface("s1", { x: 300, y: 100 }, { x: 300, y: 400 });

      const chain = createImageChain(player, cursor, [surface]);
      const ray = chain.getRay(0);

      // Ray should go from player toward cursor image (reflected across surface)
      // Cursor at (150, 300) reflected across x=300 gives image at (450, 300)
      expect(ray.source.x).toBeCloseTo(100, 5);
      expect(ray.source.y).toBeCloseTo(300, 5);
      expect(ray.target.x).toBeCloseTo(450, 5);
      expect(ray.target.y).toBeCloseTo(300, 5);
    });

    it("ray intersects surface at the reflection point", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 150, y: 300 };
      const surface = createTestSurface("s1", { x: 300, y: 100 }, { x: 300, y: 400 });

      const chain = createImageChain(player, cursor, [surface]);
      const ray = chain.getRay(0);
      const reflectionPoint = chain.getReflectionPoint(0);

      // Intersect ray with surface segment
      const segment: Segment = { start: surface.segment.start, end: surface.segment.end };
      const hit = intersectRaySegment(ray, segment);

      expect(hit).not.toBeNull();
      expect(hit!.point.x).toBeCloseTo(reflectionPoint.x, 5);
      expect(hit!.point.y).toBeCloseTo(reflectionPoint.y, 5);
    });

    it("works with two surfaces", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 600, y: 300 };
      const surface1 = createTestSurface("s1", { x: 300, y: 100 }, { x: 300, y: 500 });
      const surface2 = createTestSurface("s2", { x: 500, y: 100 }, { x: 500, y: 500 });

      const chain = createImageChain(player, cursor, [surface1, surface2]);

      // First ray: from player to cursorImage[2]
      const ray0 = chain.getRay(0);
      expect(ray0.source.x).toBeCloseTo(100, 5);

      // Second ray: from playerImage[1] to cursorImage[1]
      const ray1 = chain.getRay(1);
      // playerImage[1] = player reflected across surface1 = (500, 300)
      expect(ray1.source.x).toBeCloseTo(500, 5);
    });
  });

  describe("getReflectedRay", () => {
    it("returns ray going from reflection point toward cursor for single surface", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 150, y: 300 };
      const surface = createTestSurface("s1", { x: 300, y: 100 }, { x: 300, y: 400 });

      const chain = createImageChain(player, cursor, [surface]);
      const reflectedRay = chain.getReflectedRay(0);
      const reflectionPoint = chain.getReflectionPoint(0);

      // Reflected ray should start at reflection point
      expect(reflectedRay.source.x).toBeCloseTo(reflectionPoint.x, 5);
      expect(reflectedRay.source.y).toBeCloseTo(reflectionPoint.y, 5);

      // And point toward the cursor
      const dirToCursor = {
        x: cursor.x - reflectionPoint.x,
        y: cursor.y - reflectionPoint.y,
      };
      const rayDir = {
        x: reflectedRay.target.x - reflectedRay.source.x,
        y: reflectedRay.target.y - reflectedRay.source.y,
      };

      // Directions should be parallel (cross product near zero)
      const cross = dirToCursor.x * rayDir.y - dirToCursor.y * rayDir.x;
      expect(Math.abs(cross)).toBeLessThan(0.01);

      // And point in same direction (dot product positive)
      const dot = dirToCursor.x * rayDir.x + dirToCursor.y * rayDir.y;
      expect(dot).toBeGreaterThan(0);
    });

    it("reflected ray direction is physical reflection of incoming ray", () => {
      const player: Vector2 = { x: 100, y: 200 };
      const cursor: Vector2 = { x: 200, y: 200 };
      // Vertical surface - should reverse x direction
      const surface = createTestSurface("s1", { x: 300, y: 0 }, { x: 300, y: 400 });

      const chain = createImageChain(player, cursor, [surface]);
      const incomingRay = chain.getRay(0);
      const reflectedRay = chain.getReflectedRay(0);

      // Incoming ray goes rightward (positive x direction)
      const inDx = incomingRay.target.x - incomingRay.source.x;
      expect(inDx).toBeGreaterThan(0);

      // Reflected ray should go leftward (negative x direction)
      const outDx = reflectedRay.target.x - reflectedRay.source.x;
      expect(outDx).toBeLessThan(0);
    });
  });

  describe("getAllRays", () => {
    it("returns single ray for empty plan", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 500, y: 300 };

      const chain = createImageChain(player, cursor, []);
      const rays = chain.getAllRays();

      expect(rays.length).toBe(1);
      expect(rays[0]!.source).toEqual(player);
      expect(rays[0]!.target).toEqual(cursor);
    });

    it("returns two rays for single surface plan", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 150, y: 300 };
      const surface = createTestSurface("s1", { x: 300, y: 100 }, { x: 300, y: 400 });

      const chain = createImageChain(player, cursor, [surface]);
      const rays = chain.getAllRays();

      expect(rays.length).toBe(2);

      // First ray: player to reflection point
      expect(rays[0]!.source.x).toBeCloseTo(100, 5);
      expect(rays[0]!.source.y).toBeCloseTo(300, 5);

      // Second ray: reflection point to cursor
      expect(rays[1]!.target.x).toBeCloseTo(150, 5);
      expect(rays[1]!.target.y).toBeCloseTo(300, 5);

      // Rays should connect: ray[0].target ≈ ray[1].source
      expect(rays[0]!.target.x).toBeCloseTo(rays[1]!.source.x, 5);
      expect(rays[0]!.target.y).toBeCloseTo(rays[1]!.source.y, 5);
    });

    it("returns n+1 rays for n surface plan", () => {
      const player: Vector2 = { x: 100, y: 300 };
      const cursor: Vector2 = { x: 800, y: 300 };
      const surface1 = createTestSurface("s1", { x: 300, y: 100 }, { x: 300, y: 500 });
      const surface2 = createTestSurface("s2", { x: 500, y: 100 }, { x: 500, y: 500 });

      const chain = createImageChain(player, cursor, [surface1, surface2]);
      const rays = chain.getAllRays();

      expect(rays.length).toBe(3);

      // All rays should connect
      for (let i = 0; i < rays.length - 1; i++) {
        const currentEnd = rays[i]!.target;
        const nextStart = rays[i + 1]!.source;
        expect(currentEnd.x).toBeCloseTo(nextStart.x, 5);
        expect(currentEnd.y).toBeCloseTo(nextStart.y, 5);
      }

      // First ray starts at player
      expect(rays[0]!.source.x).toBeCloseTo(100, 5);

      // Last ray ends at cursor
      expect(rays[rays.length - 1]!.target.x).toBeCloseTo(800, 5);
    });
  });
});

