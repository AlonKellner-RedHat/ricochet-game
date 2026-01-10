/**
 * TDD Tests for Provenance-Based Polygon Edge Validation
 *
 * Tests the edge validation logic that uses SourcePoint provenance
 * instead of epsilon-based geometric checks.
 */

import { describe, expect, it } from "vitest";
import { Endpoint, HitPoint, OriginPoint, type SourcePoint } from "@/trajectory-v2/geometry/SourcePoint";
import { SurfaceChain, createRicochetChain } from "@/trajectory-v2/geometry/SurfaceChain";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Ray } from "@/trajectory-v2/geometry/types";

// Import functions we'll implement
import {
  getSourceSurfaceIds,
  sharesAnySurface,
  validateEdgeByProvenance,
} from "./polygon-edges-provenance";

/**
 * Helper to create a test surface.
 */
function createSurface(id: string, start: Vector2, end: Vector2): Surface {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const normalX = len > 0 ? -dy / len : 0;
  const normalY = len > 0 ? dx / len : 0;

  return {
    id,
    segment: { start, end },
    surfaceType: "ricochet",
    onArrowHit: () => ({ type: "reflect" }),
    isPlannable: () => true,
    getVisualProperties: () => ({ color: 0x00ff00, lineWidth: 2, alpha: 1 }),
    getNormal: () => ({ x: normalX, y: normalY }),
    canReflectFrom: () => true,
  };
}

/**
 * Helper to create a ray.
 */
function createRay(from: Vector2, to: Vector2): Ray {
  return { from, to };
}

/**
 * Helper to create a HitPoint.
 */
function createHitPoint(surface: Surface, s: number, origin: Vector2): HitPoint {
  // Calculate hit position on surface
  const hitX = surface.segment.start.x + (surface.segment.end.x - surface.segment.start.x) * s;
  const hitY = surface.segment.start.y + (surface.segment.end.y - surface.segment.start.y) * s;
  const hitPos = { x: hitX, y: hitY };
  
  // Create ray from origin to hit position
  const ray = createRay(origin, hitPos);
  
  return new HitPoint(ray, surface, 1, s);
}

describe("Provenance-Based Edge Validation", () => {
  // Test surfaces
  const surfaceA = createSurface("surface-A", { x: 100, y: 100 }, { x: 200, y: 100 });
  const surfaceB = createSurface("surface-B", { x: 200, y: 100 }, { x: 200, y: 200 });
  
  // Origin for creating hit points
  const testOrigin: Vector2 = { x: 50, y: 50 };

  describe("getSourceSurfaceIds", () => {
    it("should return surface ID for HitPoint", () => {
      const hit = createHitPoint(surfaceA, 0.5, testOrigin);
      const ids = getSourceSurfaceIds(hit);
      expect(ids).toEqual(["surface-A"]);
    });

    it("should return surface ID for Endpoint", () => {
      const endpoint = new Endpoint(surfaceA, 0);
      const ids = getSourceSurfaceIds(endpoint);
      expect(ids).toEqual(["surface-A"]);
    });

    it("should return empty array for OriginPoint", () => {
      const origin = new OriginPoint({ x: 50, y: 50 });
      const ids = getSourceSurfaceIds(origin);
      expect(ids).toEqual([]);
    });

    it("should return both surface IDs for JunctionPoint", () => {
      // Create a chain with two surfaces meeting at (200, 100)
      const chain = createRicochetChain("test-chain", [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 200 },
      ], false);
      const junctions = chain.getJunctionPoints();
      expect(junctions.length).toBe(1);

      const junction = junctions[0]!;
      const ids = getSourceSurfaceIds(junction);
      expect(ids).toHaveLength(2);
      // Both surfaces should be included
      expect(ids[0]).toContain("test-chain");
      expect(ids[1]).toContain("test-chain");
    });
  });

  describe("sharesAnySurface", () => {
    it("should return true for HitPoints on same surface", () => {
      const hit1 = createHitPoint(surfaceA, 0.3, testOrigin);
      const hit2 = createHitPoint(surfaceA, 0.7, testOrigin);
      expect(sharesAnySurface(hit1, hit2)).toBe(true);
    });

    it("should return false for HitPoints on different surfaces", () => {
      const hit1 = createHitPoint(surfaceA, 0.5, testOrigin);
      const hit2 = createHitPoint(surfaceB, 0.5, testOrigin);
      expect(sharesAnySurface(hit1, hit2)).toBe(false);
    });

    it("should return true for JunctionPoint and HitPoint on adjacent surface", () => {
      const chain = createRicochetChain("test-chain", [
        { x: 100, y: 100 },
        { x: 200, y: 100 },
        { x: 200, y: 200 },
      ], false);
      const junction = chain.getJunctionPoints()[0]!;
      const surfaces = chain.getSurfaces();
      const hit = createHitPoint(surfaces[0]!, 0.5, testOrigin);
      expect(sharesAnySurface(junction, hit)).toBe(true);
    });

    it("should return false for OriginPoint and any other point", () => {
      const origin = new OriginPoint({ x: 50, y: 50 });
      const hit = createHitPoint(surfaceA, 0.5, testOrigin);
      expect(sharesAnySurface(origin, hit)).toBe(false);
    });
  });

  describe("validateEdgeByProvenance", () => {
    const origin: Vector2 = { x: 50, y: 50 };

    describe("Ray edges (HitPoint ↔ Endpoint/JunctionPoint)", () => {
      it("should validate HitPoint to Endpoint on same surface", () => {
        const hit = createHitPoint(surfaceA, 0.5, origin);
        const endpoint = new Endpoint(surfaceA, 1);
        const result = validateEdgeByProvenance(hit, endpoint, origin);
        expect(result.valid).toBe(true);
      });

      it("should validate HitPoint to JunctionPoint on same surface", () => {
        const chain = createRicochetChain("test-chain", [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 200, y: 200 },
        ], false);
        const junction = chain.getJunctionPoints()[0]!;
        const surfaces = chain.getSurfaces();
        const hit = createHitPoint(surfaces[0]!, 0.5, origin);
        const result = validateEdgeByProvenance(hit, junction, origin);
        expect(result.valid).toBe(true);
      });
    });

    describe("Boundary rays (OriginPoint ↔ HitPoint)", () => {
      it("should validate OriginPoint to HitPoint", () => {
        const originPt = new OriginPoint({ x: 100, y: 100 });
        const hit = createHitPoint(surfaceA, 0.5, origin);
        const result = validateEdgeByProvenance(originPt, hit, origin);
        expect(result.valid).toBe(true);
      });

      it("should validate HitPoint to OriginPoint (reverse order)", () => {
        const originPt = new OriginPoint({ x: 100, y: 100 });
        const hit = createHitPoint(surfaceA, 0.5, origin);
        const result = validateEdgeByProvenance(hit, originPt, origin);
        expect(result.valid).toBe(true);
      });
    });

    describe("Surface edges (same-surface points)", () => {
      it("should validate two HitPoints on same surface", () => {
        const hit1 = createHitPoint(surfaceA, 0.3, origin);
        const hit2 = createHitPoint(surfaceA, 0.7, origin);
        const result = validateEdgeByProvenance(hit1, hit2, origin);
        expect(result.valid).toBe(true);
      });

      it("should validate Endpoint to Endpoint on same surface", () => {
        const ep1 = new Endpoint(surfaceA, 0);
        const ep2 = new Endpoint(surfaceA, 1);
        const result = validateEdgeByProvenance(ep1, ep2, origin);
        expect(result.valid).toBe(true);
      });

      it("should reject HitPoints on different surfaces", () => {
        const hit1 = createHitPoint(surfaceA, 0.5, origin);
        const hit2 = createHitPoint(surfaceB, 0.5, origin);
        const result = validateEdgeByProvenance(hit1, hit2, origin);
        expect(result.valid).toBe(false);
        expect(result.reason).toContain("different surfaces");
      });
    });

    describe("Junction edges", () => {
      it("should validate JunctionPoint to HitPoint on adjacent surface", () => {
        const chain = createRicochetChain("test-chain", [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 200, y: 200 },
        ], false);
        const junction = chain.getJunctionPoints()[0]!;
        const surfaces = chain.getSurfaces();
        const hit = createHitPoint(surfaces[1]!, 0.5, origin);
        const result = validateEdgeByProvenance(junction, hit, origin);
        expect(result.valid).toBe(true);
      });

      it("should validate JunctionPoint to Endpoint on adjacent surface", () => {
        const chain = createRicochetChain("test-chain", [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 200, y: 200 },
        ], false);
        const junction = chain.getJunctionPoints()[0]!;
        const surfaces = chain.getSurfaces();
        const endpoint = new Endpoint(surfaces[0]!, 0);
        const result = validateEdgeByProvenance(junction, endpoint, origin);
        expect(result.valid).toBe(true);
      });
    });

    describe("Window edges (OriginPoint pairs)", () => {
      it("should validate OriginPoint to OriginPoint (window edge)", () => {
        const op1 = new OriginPoint({ x: 100, y: 100 });
        const op2 = new OriginPoint({ x: 200, y: 100 });
        const result = validateEdgeByProvenance(op1, op2, origin);
        expect(result.valid).toBe(true);
      });
    });

    describe("OriginPoint to Endpoint/JunctionPoint (window boundary)", () => {
      it("should validate OriginPoint to Endpoint", () => {
        const op = new OriginPoint({ x: 100, y: 100 });
        const endpoint = new Endpoint(surfaceA, 0);
        const result = validateEdgeByProvenance(op, endpoint, origin);
        expect(result.valid).toBe(true);
      });

      it("should validate OriginPoint to JunctionPoint", () => {
        const chain = createRicochetChain("test-chain", [
          { x: 100, y: 100 },
          { x: 200, y: 100 },
          { x: 200, y: 200 },
        ], false);
        const junction = chain.getJunctionPoints()[0]!;
        const op = new OriginPoint({ x: 200, y: 100 });
        const result = validateEdgeByProvenance(op, junction, origin);
        expect(result.valid).toBe(true);
      });
    });
  });
});
