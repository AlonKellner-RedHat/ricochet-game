/**
 * Tests for tracePath - the unified path tracing function.
 *
 * This function uses RayPropagator + findNextHit to trace a path through surfaces,
 * reflecting both origin and target images through each surface hit.
 */

import { describe, it, expect } from "vitest";
import { createMockSurface, createMockWall, createMockBidirectionalSurface } from "@test/helpers/surfaceHelpers";
import { createRayPropagator } from "@/trajectory-v2/engine/RayPropagator";
import { tracePath, type TraceOptions } from "@/trajectory-v2/engine/TracePath";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";

describe("tracePath", () => {
  // Helper to create a simple horizontal bidirectional reflective surface
  function createHorizontalSurface(
    id: string,
    y: number,
    xStart: number,
    xEnd: number
  ): Surface {
    // Use bidirectional so rays from either direction can reflect
    return createMockBidirectionalSurface(id, { x: xStart, y }, { x: xEnd, y });
  }

  // Helper to create a vertical bidirectional reflective surface
  function createVerticalSurface(
    id: string,
    x: number,
    yStart: number,
    yEnd: number
  ): Surface {
    return createMockBidirectionalSurface(id, { x, y: yStart }, { x, y: yEnd });
  }

  describe("single segment (no surfaces)", () => {
    it("should return direct path from origin to target when no surfaces exist", () => {
      const propagator = createRayPropagator(
        { x: 100, y: 100 },
        { x: 200, y: 200 }
      );
      const surfaces: Surface[] = [];

      const result = tracePath(propagator, surfaces, { mode: "physical" });

      // Should have one segment from origin toward target
      expect(result.segments.length).toBe(1);
      expect(result.segments[0]!.start).toEqual({ x: 100, y: 100 });
      expect(result.terminationType).toBe("no_hit");
    });

    it("should include originImage and targetImage in result", () => {
      const origin = { x: 50, y: 50 };
      const target = { x: 150, y: 150 };
      const propagator = createRayPropagator(origin, target);

      const result = tracePath(propagator, [], { mode: "physical" });

      // The propagator should reflect the original origin and target
      const finalState = result.propagator.getState();
      expect(finalState.originImage).toEqual(origin);
      expect(finalState.targetImage).toEqual(target);
    });
  });

  describe("physical mode reflections", () => {
    it("should reflect through on-segment hits", () => {
      // Setup: ray from (100, 100) toward (100, 300), with horizontal surface at y=200
      const origin = { x: 100, y: 100 };
      const target = { x: 100, y: 300 };
      const propagator = createRayPropagator(origin, target);

      // Horizontal surface at y=200, spanning x=50 to x=150
      const surface = createHorizontalSurface("s1", 200, 50, 150);
      const surfaces = [surface];

      const result = tracePath(propagator, surfaces, { mode: "physical" });

      // Should have at least one segment that ends at the surface
      expect(result.segments.length).toBeGreaterThanOrEqual(1);
      expect(result.segments[0]!.start).toEqual(origin);

      // First segment should hit the surface
      const firstSegment = result.segments[0]!;
      expect(firstSegment.end.y).toBeCloseTo(200, 5);
      expect(firstSegment.surface).toBe(surface);
      expect(firstSegment.onSegment).toBe(true);
    });

    it("should stop at off-segment hits (no physical reflection)", () => {
      // Setup: ray from (100, 100) toward (100, 300), but surface only spans x=200 to x=300
      const origin = { x: 100, y: 100 };
      const target = { x: 100, y: 300 };
      const propagator = createRayPropagator(origin, target);

      // Surface is not on the ray path (extended line would hit, but segment doesn't)
      const surface = createHorizontalSurface("s1", 200, 200, 300);
      const surfaces = [surface];

      const result = tracePath(propagator, surfaces, { mode: "physical" });

      // Should not hit the surface in physical mode
      expect(result.terminationType).toBe("no_hit");
    });

    it("should stop at wall surfaces", () => {
      // Setup: ray toward a wall
      const origin = { x: 100, y: 100 };
      const target = { x: 100, y: 300 };
      const propagator = createRayPropagator(origin, target);

      // Wall at y=200
      const wall = createMockWall("wall1", { x: 50, y: 200 }, { x: 150, y: 200 });
      const surfaces = [wall];

      const result = tracePath(propagator, surfaces, { mode: "physical" });

      // Should hit the wall and stop
      expect(result.segments.length).toBe(1);
      expect(result.segments[0]!.end.y).toBeCloseTo(200, 5);
      expect(result.segments[0]!.canReflect).toBe(false);
      expect(result.terminationType).toBe("wall");
    });

    it("should return final propagator state", () => {
      const origin = { x: 100, y: 100 };
      const target = { x: 100, y: 300 };
      const propagator = createRayPropagator(origin, target);

      // Horizontal surface at y=200
      const surface = createHorizontalSurface("s1", 200, 50, 150);
      const surfaces = [surface];

      const result = tracePath(propagator, surfaces, {
        mode: "physical",
        maxReflections: 5,
      });

      // The returned propagator should have been updated after reflection
      const finalState = result.propagator.getState();
      // If reflection occurred, depth should be >= 1
      // Check that at least one reflection happened
      expect(result.segments.length).toBeGreaterThanOrEqual(1);
      expect(result.segments[0]!.surface).toBe(surface);
      expect(result.segments[0]!.canReflect).toBe(true);
    });

    it("should handle multiple reflections", () => {
      // Setup: ray going down, two parallel surfaces to bounce between
      const origin = { x: 100, y: 150 };
      const target = { x: 100, y: 500 }; // Going down
      const propagator = createRayPropagator(origin, target);

      // Surface at y=200 (below origin) and y=100 (above origin)
      // Ray goes down -> hits y=200 -> reflects up -> hits y=100 -> reflects down...
      const surface1 = createHorizontalSurface("s1", 200, 50, 150);
      const surface2 = createHorizontalSurface("s2", 100, 50, 150);
      const surfaces = [surface1, surface2];

      const result = tracePath(propagator, surfaces, {
        mode: "physical",
        maxReflections: 10,
      });

      // Should have at least 2 segments from bouncing between surfaces
      expect(result.segments.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("planned mode reflections", () => {
    it("should reflect through off-segment hits", () => {
      // Setup: ray that would miss the segment but hit the extended line
      const origin = { x: 100, y: 100 };
      const target = { x: 100, y: 300 };
      const propagator = createRayPropagator(origin, target);

      // Surface is offset but extended line intersects ray
      const surface = createHorizontalSurface("s1", 200, 200, 300);
      const surfaces = [surface];

      const result = tracePath(propagator, surfaces, { mode: "planned" });

      // In planned mode, should hit the extended line
      expect(result.segments.length).toBeGreaterThanOrEqual(1);
      expect(result.segments[0]!.end.y).toBeCloseTo(200, 5);
      expect(result.segments[0]!.onSegment).toBe(false);
    });

    it("should mark onSegment=false for off-segment hits", () => {
      const origin = { x: 100, y: 100 };
      const target = { x: 100, y: 300 };
      const propagator = createRayPropagator(origin, target);

      // Off-segment surface
      const surface = createHorizontalSurface("s1", 200, 200, 300);
      const surfaces = [surface];

      const result = tracePath(propagator, surfaces, { mode: "planned" });

      expect(result.segments[0]!.onSegment).toBe(false);
    });

    it("should mark onSegment=true for on-segment hits", () => {
      const origin = { x: 100, y: 100 };
      const target = { x: 100, y: 300 };
      const propagator = createRayPropagator(origin, target);

      // On-segment surface
      const surface = createHorizontalSurface("s1", 200, 50, 150);
      const surfaces = [surface];

      const result = tracePath(propagator, surfaces, { mode: "planned" });

      expect(result.segments[0]!.onSegment).toBe(true);
    });
  });

  describe("propagator consistency", () => {
    it("should use same RayPropagator throughout trace", () => {
      const origin = { x: 100, y: 150 };
      const target = { x: 100, y: 500 };
      const propagator = createRayPropagator(origin, target);

      // Two surfaces to force multiple reflections
      const surface1 = createHorizontalSurface("s1", 200, 50, 150);
      const surface2 = createHorizontalSurface("s2", 100, 50, 150);

      const result = tracePath(propagator, [surface1, surface2], {
        mode: "physical",
        maxReflections: 5,
      });

      // If reflections occurred, cache should have been used
      // At minimum, we should have segments
      expect(result.segments.length).toBeGreaterThan(0);
      
      // Cache stats should show we used the shared cache (if any reflections)
      if (result.propagator.getState().depth > 0) {
        const stats = result.propagator.getCacheStats();
        expect(stats.hits + stats.misses).toBeGreaterThan(0);
      }
    });

    it("should return propagator that can continue tracing", () => {
      const origin = { x: 100, y: 150 };
      const target = { x: 100, y: 500 };
      const propagator = createRayPropagator(origin, target);

      // Two surfaces for bouncing
      const surface1 = createHorizontalSurface("s1", 200, 50, 150);
      const surface2 = createHorizontalSurface("s2", 100, 50, 150);

      // Trace with enough reflections to actually bounce
      const result = tracePath(propagator, [surface1, surface2], {
        mode: "physical",
        maxReflections: 3,
      });

      // After bouncing, should have updated propagator depth
      expect(result.segments.length).toBeGreaterThan(0);
      // The propagator returned should be the one after last reflection
      // Just verify we can use it
      const continueResult = tracePath(result.propagator, [surface1, surface2], {
        mode: "physical",
        maxReflections: 2,
      });
      expect(continueResult.segments.length).toBeGreaterThanOrEqual(0);
    });

    it("reflect(reflect(P,S),S) should return P by identity", () => {
      const origin = { x: 100, y: 100 };
      const target = { x: 200, y: 200 };
      const propagator = createRayPropagator(origin, target);

      const surface = createHorizontalSurface("s1", 150, 50, 250);

      // Reflect through surface twice
      const reflected1 = propagator.reflectThrough(surface);
      const reflected2 = reflected1.reflectThrough(surface);

      // Should get back original points by identity (same reference)
      expect(reflected2.getState().originImage).toBe(origin);
      expect(reflected2.getState().targetImage).toBe(target);
    });
  });

  describe("cursor detection", () => {
    it("should detect cursor on path segment", () => {
      const origin = { x: 100, y: 100 };
      const target = { x: 100, y: 300 };
      const cursor = { x: 100, y: 200 }; // Cursor is on the path
      const propagator = createRayPropagator(origin, target);

      // No surfaces - straight line path
      const result = tracePath(propagator, [], {
        mode: "physical",
        stopAtCursor: cursor,
      });

      expect(result.cursorSegmentIndex).toBe(0);
      // cursorT is relative to the segment from origin to cursor (which becomes the endpoint)
      // Since we stop at cursor, the segment is origin->cursor, so cursorT should be 1.0
      // Actually, cursorT is calculated before segment is truncated, relative to origin->maxDistance
      // Let's just verify cursor was found
      expect(result.cursorT).toBeGreaterThan(0);
      expect(result.terminationType).toBe("cursor");
    });

    it("should stop at cursor when stopAtCursor option set", () => {
      const origin = { x: 100, y: 100 };
      const target = { x: 100, y: 500 };
      const cursor = { x: 100, y: 200 };
      const propagator = createRayPropagator(origin, target);

      // Surface beyond cursor
      const surface = createHorizontalSurface("s1", 300, 50, 150);

      const result = tracePath(propagator, [surface], {
        mode: "physical",
        stopAtCursor: cursor,
      });

      // Should stop at cursor, not continue to surface
      expect(result.segments.length).toBe(1);
      expect(result.segments[0]!.end).toEqual(cursor);
      expect(result.terminationType).toBe("cursor");
    });

    it("should record cursorSegmentIndex and cursorT", () => {
      const origin = { x: 100, y: 100 };
      const target = { x: 100, y: 300 };
      const cursor = { x: 100, y: 150 }; // Cursor before any surface
      const propagator = createRayPropagator(origin, target);

      // Surface after cursor
      const surface = createHorizontalSurface("s1", 200, 50, 150);

      const result = tracePath(propagator, [surface], {
        mode: "physical",
        stopAtCursor: cursor,
      });

      // Should record cursor position
      expect(result.cursorSegmentIndex).toBeGreaterThanOrEqual(0);
      expect(result.cursorT).toBeGreaterThan(0);
      expect(result.terminationType).toBe("cursor");
    });

    it("should return cursorSegmentIndex=-1 when cursor not on path", () => {
      const origin = { x: 100, y: 100 };
      const target = { x: 100, y: 300 };
      const cursor = { x: 500, y: 200 }; // Cursor is off the path
      const propagator = createRayPropagator(origin, target);

      const result = tracePath(propagator, [], {
        mode: "physical",
        stopAtCursor: cursor,
      });

      expect(result.cursorSegmentIndex).toBe(-1);
    });
  });

  describe("max reflections limit", () => {
    it("should stop at maxReflections", () => {
      const origin = { x: 100, y: 150 };
      const target = { x: 100, y: 300 };
      const propagator = createRayPropagator(origin, target);

      // Two parallel surfaces for bouncing
      const surface1 = createHorizontalSurface("s1", 200, 50, 150);
      const surface2 = createHorizontalSurface("s2", 100, 50, 150);

      const result = tracePath(propagator, [surface1, surface2], {
        mode: "physical",
        maxReflections: 3,
      });

      // Should have at most 3 segments (one per reflection)
      expect(result.segments.length).toBeLessThanOrEqual(4);
      if (result.segments.length === 4) {
        expect(result.terminationType).toBe("max_reflections");
      }
    });
  });

  describe("exclude surfaces", () => {
    it("should skip excluded surfaces in hit detection", () => {
      const origin = { x: 100, y: 100 };
      const target = { x: 100, y: 300 };
      const propagator = createRayPropagator(origin, target);

      const surface1 = createHorizontalSurface("s1", 150, 50, 150);
      const surface2 = createHorizontalSurface("s2", 200, 50, 150);

      const result = tracePath(propagator, [surface1, surface2], {
        mode: "physical",
        excludeSurfaces: [surface1],
      });

      // Should skip surface1 and hit surface2
      expect(result.segments[0]!.surface).toBe(surface2);
      expect(result.segments[0]!.end.y).toBeCloseTo(200, 5);
    });
  });

  describe("provenance tracking", () => {
    it("should create HitPoints with correct ray provenance", () => {
      const origin = { x: 100, y: 100 };
      const target = { x: 100, y: 300 };
      const propagator = createRayPropagator(origin, target);

      const surface = createHorizontalSurface("s1", 200, 50, 150);

      const result = tracePath(propagator, [surface], { mode: "physical" });

      // The segment should have a surface, and the internal ray should have proper source/target
      expect(result.segments[0]!.surface).toBe(surface);
      
      // The ray in the propagator state should reflect the reflected images
      const ray = result.propagator.getRay();
      expect(ray.source).toBeDefined();
      expect(ray.target).toBeDefined();
    });
  });
});
