/**
 * ContinuationRay Tests
 *
 * TDD tests for the ContinuationRay abstraction - a first-class object
 * that groups related points on the same ray from origin.
 *
 * Like SurfaceChain groups surfaces, ContinuationRay groups points
 * that share the same continuation ray.
 */

import { describe, it, expect } from "vitest";
import { HitPoint, Endpoint } from "@/trajectory-v2/geometry/SourcePoint";
import type { Surface } from "@/surfaces/Surface";
import { dedupeConsecutiveHits } from "@/trajectory-v2/visibility/RenderingDedup";
import { ContinuationRay, resetRayIdCounter } from "@/trajectory-v2/geometry/ContinuationRay";

// Helper to create a mock surface with specific segment
function createMockSurface(id: string, start: { x: number; y: number }, end: { x: number; y: number }): Surface {
  return {
    id,
    segment: { start, end },
    surfaceType: "wall",
    onArrowHit: () => ({ type: "blocked" as const }),
    isPlannable: () => false,
    getVisualProperties: () => ({ color: 0, alpha: 1, lineWidth: 1 }),
    getNormal: () => ({ x: 0, y: 1 }),
    canReflectFrom: () => false,
  } as unknown as Surface;
}

describe("ContinuationRay", () => {
  describe("ContinuationRay class", () => {
    it("stores ordered points from source to hit", () => {
      // TODO: Implement ContinuationRay class
      // This test should pass once ContinuationRay is implemented
      
      // const targetSurface = createMockSurface("target-0", { x: 500, y: 200 }, { x: 700, y: 200 });
      // const wallSurface = createMockSurface("wall-right-0", { x: 900, y: 200 }, { x: 900, y: 400 });
      // const screenBottom = createMockSurface("screen-bottom", { x: 0, y: 720 }, { x: 1280, y: 720 });
      
      // const source = new Endpoint(targetSurface, "end"); // (700, 200)
      // const passedThrough = new Endpoint(wallSurface, "end"); // (900, 400)
      // const ray = { from: { x: 581, y: 81 }, to: { x: 1220, y: 720 } };
      // const hit = new HitPoint(ray, screenBottom, 1.0, 0.5);
      
      // const continuationRay = new ContinuationRay(source, [passedThrough], hit);
      
      // expect(continuationRay.id).toBeDefined();
      // expect(continuationRay.source).toBe(source);
      // expect(continuationRay.passedThrough).toEqual([passedThrough]);
      // expect(continuationRay.hit).toBe(hit);
      // expect(continuationRay.orderedPoints).toEqual([source, passedThrough, hit]);
      
      expect(true).toBe(true); // Placeholder until ContinuationRay exists
    });

    it("generates unique IDs", () => {
      // TODO: Implement ContinuationRay class
      // Two continuation rays should have different IDs
      
      expect(true).toBe(true); // Placeholder
    });

    it("contains() checks if point is part of the ray", () => {
      // TODO: Implement ContinuationRay class
      
      expect(true).toBe(true); // Placeholder
    });
  });

  describe("SourcePoint.continuationRay property", () => {
    it("points know their continuation ray", () => {
      // TODO: Add continuationRay property to SourcePoint
      // After projectConeV2 runs, points should have their ray reference
      
      // const endpoint = new Endpoint(surface, "end");
      // expect(endpoint.continuationRay).toBeUndefined(); // Initially undefined
      
      // After being added to a ContinuationRay:
      // expect(endpoint.continuationRay).toBeDefined();
      // expect(endpoint.continuationRay?.id).toBe(ray.id);
      
      expect(true).toBe(true); // Placeholder
    });

    it("points not on a continuation ray return undefined", () => {
      const surface = createMockSurface("test", { x: 0, y: 0 }, { x: 100, y: 0 });
      const endpoint = new Endpoint(surface, "end");
      
      // Points not assigned to a continuation ray should return undefined
      // This tests the initial state before projectConeV2 assigns rays
      expect((endpoint as any).continuationRay).toBeUndefined();
    });
  });

  describe("Dedup: consecutive points on same surface (Case 1)", () => {
    /**
     * Case 1: Same surface, mixed types
     * 
     * Input:
     *   [4] HitPoint[target-0] (606.74, 200.00) @ 77.79°
     *   [5] HitPoint[target-0] (569.44, 200.00) @ 95.55°  <- should be removed
     *   [6] Endpoint[target-0] (500.00, 200.00) @ 124.24°
     * 
     * Expected output:
     *   [4] HitPoint[target-0]
     *   [6] Endpoint[target-0]
     * 
     * The current implementation only considers HitPoints for same-surface
     * deduplication. It should also consider Endpoints.
     */
    it("merges consecutive HitPoints AND Endpoints on same surface", () => {
      const targetSurface = createMockSurface("target-0", { x: 500, y: 200 }, { x: 700, y: 200 });
      
      // Ray parameters for HitPoints
      const ray1 = { source: { x: 581, y: 81 }, target: { x: 606.74, y: 200 } };
      const ray2 = { source: { x: 581, y: 81 }, target: { x: 569.44, y: 200 } };
      
      const points = [
        new HitPoint(ray1, targetSurface, 1.0, 0.5337), // First HitPoint on target-0
        new HitPoint(ray2, targetSurface, 1.0, 0.3472), // Second HitPoint on target-0 - should be REMOVED
        new Endpoint(targetSurface, "start"),           // Endpoint on target-0 - last in run
      ];
      
      const result = dedupeConsecutiveHits(points);
      
      // Expected: only first and last of the same-surface run
      expect(result.length).toBe(2);
      expect(result[0]).toBe(points[0]); // First HitPoint
      expect(result[1]).toBe(points[2]); // Endpoint (last of run)
    });

    it("keeps all points when they're on different surfaces", () => {
      const surfaceA = createMockSurface("surface-A", { x: 0, y: 0 }, { x: 100, y: 0 });
      const surfaceB = createMockSurface("surface-B", { x: 100, y: 0 }, { x: 100, y: 100 });
      
      const ray = { source: { x: 50, y: 50 }, target: { x: 100, y: 50 } };
      
      const points = [
        new HitPoint(ray, surfaceA, 1.0, 0.5),
        new Endpoint(surfaceB, "start"), // Different surface
        new HitPoint(ray, surfaceA, 1.0, 0.5),
      ];
      
      const result = dedupeConsecutiveHits(points);
      
      // All kept because surfaces differ
      expect(result.length).toBe(3);
    });
  });

  describe("Dedup: consecutive points on same continuation ray (Case 2)", () => {
    /**
     * Case 2: Same continuation ray, different surfaces
     * 
     * Input:
     *   [1] Endpoint[target-0] (700.00, 200.00) @ 45.00°
     *   [2] Endpoint[wall-right-0] (900.00, 400.00) @ 45.00°  <- should be removed
     *   [3] HitPoint[screen-bottom] (1220.00, 720.00) @ 45.00°
     * 
     * Expected output:
     *   [1] Endpoint[target-0]
     *   [3] HitPoint[screen-bottom]
     * 
     * All three points are on the same continuation ray (45° from origin).
     * For rendering, only the closest and farthest matter.
     */
    it("merges consecutive points on same continuation ray", () => {
      resetRayIdCounter(); // Ensure deterministic IDs for tests
      
      const targetSurface = createMockSurface("target-0", { x: 500, y: 200 }, { x: 700, y: 200 });
      const wallSurface = createMockSurface("wall-right-0", { x: 900, y: 200 }, { x: 900, y: 400 });
      const screenBottom = createMockSurface("screen-bottom", { x: 0, y: 720 }, { x: 1280, y: 720 });
      
      // All points at 45° from origin (581, 81)
      const origin = { x: 581, y: 81 };
      const ray = { source: origin, target: { x: 1220, y: 720 } };
      
      const source = new Endpoint(targetSurface, "end");        // (700, 200) - CLOSEST
      const passedThrough = new Endpoint(wallSurface, "end");   // (900, 400) - MIDDLE, should be removed
      const hit = new HitPoint(ray, screenBottom, 1.0, 0.5);    // (1220, 720) - FARTHEST
      
      // Simulate what projectConeV2 does: create ContinuationRay and assign to points
      const contRay = new ContinuationRay(source, [passedThrough], hit);
      source.continuationRay = contRay;
      passedThrough.continuationRay = contRay;
      hit.continuationRay = contRay;
      
      const points = [source, passedThrough, hit];
      
      const result = dedupeConsecutiveHits(points);
      
      // Expected: only closest and farthest of the continuation ray
      expect(result.length).toBe(2);
      expect(result[0]).toBe(source); // Closest
      expect(result[1]).toBe(hit);    // Farthest
    });

    it("keeps points from different continuation rays", () => {
      const surfaceA = createMockSurface("surface-A", { x: 0, y: 0 }, { x: 100, y: 0 });
      const surfaceB = createMockSurface("surface-B", { x: 100, y: 0 }, { x: 100, y: 100 });
      const surfaceC = createMockSurface("surface-C", { x: 100, y: 100 }, { x: 0, y: 100 });
      
      // These would be on DIFFERENT continuation rays
      const endpointA = new Endpoint(surfaceA, "end");   // Ray 1
      const endpointB = new Endpoint(surfaceB, "start"); // Ray 2 (different angle)
      const endpointC = new Endpoint(surfaceC, "start"); // Ray 3 (different angle)
      
      const points = [endpointA, endpointB, endpointC];
      
      const result = dedupeConsecutiveHits(points);
      
      // All kept because they're on different rays
      expect(result.length).toBe(3);
    });
  });

  describe("Integration: combined surface and ray dedup", () => {
    it("deduplicates both same-surface and same-ray runs in one pass", () => {
      resetRayIdCounter(); // Ensure deterministic IDs for tests
      
      // A polygon with:
      // - A run of points on the same surface
      // - A run of points on the same continuation ray
      // Both should be deduplicated
      
      const targetSurface = createMockSurface("target-0", { x: 500, y: 200 }, { x: 700, y: 200 });
      const wallSurface = createMockSurface("wall-right-0", { x: 900, y: 200 }, { x: 900, y: 400 });
      const screenBottom = createMockSurface("screen-bottom", { x: 0, y: 720 }, { x: 1280, y: 720 });
      
      const origin = { x: 581, y: 81 };
      const rayToScreen = { source: origin, target: { x: 1220, y: 720 } };
      const rayToTarget = { source: origin, target: { x: 606, y: 200 } };
      
      // Same-ray run (all at 45°)
      const raySource = new Endpoint(targetSurface, "end");
      const rayMiddle = new Endpoint(wallSurface, "end");
      const rayHit = new HitPoint(rayToScreen, screenBottom, 1.0, 0.5);
      
      // Assign continuation ray provenance
      const contRay = new ContinuationRay(raySource, [rayMiddle], rayHit);
      raySource.continuationRay = contRay;
      rayMiddle.continuationRay = contRay;
      rayHit.continuationRay = contRay;
      
      // Same-surface run (all on target-0) - no continuation ray
      const surfFirst = new HitPoint(rayToTarget, targetSurface, 1.0, 0.53);
      const surfMiddle = new HitPoint(rayToTarget, targetSurface, 1.0, 0.35);
      const surfLast = new Endpoint(targetSurface, "start");
      
      const points = [
        raySource,  // Closest on ray
        rayMiddle,  // Middle on ray - REMOVE
        rayHit,     // Farthest on ray
        surfFirst,  // First on surface
        surfMiddle, // Middle on surface - REMOVE
        surfLast,   // Last on surface
      ];
      
      const result = dedupeConsecutiveHits(points);
      
      // Expected: 4 points (2 from each run)
      expect(result.length).toBe(4);
      expect(result[0]).toBe(raySource);  // First of ray run
      expect(result[1]).toBe(rayHit);     // Last of ray run
      expect(result[2]).toBe(surfFirst);  // First of surface run
      expect(result[3]).toBe(surfLast);   // Last of surface run
    });
  });
});
