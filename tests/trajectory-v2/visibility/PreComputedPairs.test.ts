/**
 * Unit tests for PreComputedPairs class
 *
 * Tests all three types of pairs that get stored:
 * 1. Surface orientation pairs (start vs end endpoints)
 * 2. Endpoint + Continuation pairs
 * 3. Junction + Continuation pairs
 */

import { RicochetSurface } from "@/surfaces/RicochetSurface";
import {
  Endpoint,
  HitPoint,
  OriginPoint,
} from "@/trajectory-v2/geometry/SourcePoint";
import {
  createRicochetChain,
} from "@/trajectory-v2/geometry/SurfaceChain";
import { PreComputedPairs } from "@/trajectory-v2/visibility/ConeProjectionV2";
import { describe, expect, it } from "vitest";

describe("PreComputedPairs", () => {
  describe("basic operations", () => {
    it("stores and retrieves a pair order", () => {
      const pairs = new PreComputedPairs();
      const a = new OriginPoint({ x: 0, y: 0 });
      const b = new OriginPoint({ x: 100, y: 0 });

      pairs.set(a, b, -1);

      expect(pairs.get(a, b)).toBe(-1);
    });

    it("returns undefined for non-existent pairs", () => {
      const pairs = new PreComputedPairs();
      const a = new OriginPoint({ x: 0, y: 0 });
      const b = new OriginPoint({ x: 100, y: 0 });

      expect(pairs.get(a, b)).toBeUndefined();
    });

    it("handles reverse lookup by negating the order", () => {
      const pairs = new PreComputedPairs();
      const a = new OriginPoint({ x: 0, y: 0 });
      const b = new OriginPoint({ x: 100, y: 0 });

      pairs.set(a, b, -1); // a before b

      // When looking up (b, a), should return 1 (b after a, i.e., a before b)
      expect(pairs.get(b, a)).toBe(1);
    });

    it("handles reverse lookup for positive order", () => {
      const pairs = new PreComputedPairs();
      const a = new OriginPoint({ x: 0, y: 0 });
      const b = new OriginPoint({ x: 100, y: 0 });

      pairs.set(a, b, 1); // b before a

      // When looking up (b, a), should return -1
      expect(pairs.get(b, a)).toBe(-1);
    });

    it("tracks size correctly", () => {
      const pairs = new PreComputedPairs();
      const a = new OriginPoint({ x: 0, y: 0 });
      const b = new OriginPoint({ x: 100, y: 0 });
      const c = new OriginPoint({ x: 200, y: 0 });

      expect(pairs.size).toBe(0);

      pairs.set(a, b, -1);
      expect(pairs.size).toBe(1);

      pairs.set(b, c, 1);
      expect(pairs.size).toBe(2);
    });

    it("has() returns true for stored pairs", () => {
      const pairs = new PreComputedPairs();
      const a = new OriginPoint({ x: 0, y: 0 });
      const b = new OriginPoint({ x: 100, y: 0 });

      expect(pairs.has(a, b)).toBe(false);

      pairs.set(a, b, -1);

      expect(pairs.has(a, b)).toBe(true);
      expect(pairs.has(b, a)).toBe(true); // Reverse lookup
    });
  });

  describe("Type 1: Surface orientation pairs", () => {
    it("stores start vs end endpoint order from surface orientation", () => {
      const pairs = new PreComputedPairs();
      const surface = new RicochetSurface("test-surface", {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      });

      const startEndpoint = new Endpoint(surface, "start");
      const endEndpoint = new Endpoint(surface, "end");

      // Simulate: cross product > 0, start comes before end
      pairs.set(startEndpoint, endEndpoint, -1);

      expect(pairs.get(startEndpoint, endEndpoint)).toBe(-1);
      expect(pairs.get(endEndpoint, startEndpoint)).toBe(1);
    });

    it("stores multiple surface orientations", () => {
      const pairs = new PreComputedPairs();
      
      const surface1 = new RicochetSurface("surface-1", {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      });
      const surface2 = new RicochetSurface("surface-2", {
        start: { x: 100, y: 0 },
        end: { x: 100, y: 100 },
      });

      const s1Start = new Endpoint(surface1, "start");
      const s1End = new Endpoint(surface1, "end");
      const s2Start = new Endpoint(surface2, "start");
      const s2End = new Endpoint(surface2, "end");

      // Surface 1: start before end
      pairs.set(s1Start, s1End, -1);
      // Surface 2: end before start
      pairs.set(s2Start, s2End, 1);

      expect(pairs.get(s1Start, s1End)).toBe(-1);
      expect(pairs.get(s2Start, s2End)).toBe(1);
      expect(pairs.size).toBe(2);
    });
  });

  describe("Type 2: Endpoint + Continuation pairs", () => {
    it("stores endpoint and its continuation hit order", () => {
      const pairs = new PreComputedPairs();
      
      const surface = new RicochetSurface("test-surface", {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      });
      const endpoint = new Endpoint(surface, "end");
      
      // Continuation ray hits another surface
      const hitSurface = new RicochetSurface("hit-surface", {
        start: { x: 0, y: 100 },
        end: { x: 200, y: 100 },
      });
      const ray = { from: { x: 50, y: 50 }, to: { x: 100, y: 100 } };
      const continuation = new HitPoint(ray, hitSurface, 0.5, 0.5);

      // Shadow boundary: endpoint before continuation
      pairs.set(endpoint, continuation, -1);

      expect(pairs.get(endpoint, continuation)).toBe(-1);
      expect(pairs.get(continuation, endpoint)).toBe(1);
    });
  });

  describe("Type 3: Junction + Continuation pairs", () => {
    it("stores junction and its continuation hit order", () => {
      const pairs = new PreComputedPairs();
      
      // Create a V-shape chain
      const chain = createRicochetChain("test-v", [
        { x: 80, y: 100 },
        { x: 100, y: 50 }, // apex
        { x: 120, y: 100 },
      ]);
      const junctions = chain.getJunctionPoints();
      const apex = junctions[0]!;

      // Continuation ray hits ceiling
      const ceiling = new RicochetSurface("ceiling", {
        start: { x: 0, y: 0 },
        end: { x: 200, y: 0 },
      });
      const ray = { from: { x: 150, y: 100 }, to: { x: 100, y: -100 } };
      const continuation = new HitPoint(ray, ceiling, 0.5, 0.5);

      // Case 1: Junction before continuation (exiting)
      pairs.set(apex, continuation, -1);
      expect(pairs.get(apex, continuation)).toBe(-1);
    });

    it("stores continuation before junction order", () => {
      const pairs = new PreComputedPairs();
      
      const chain = createRicochetChain("test-v", [
        { x: 80, y: 100 },
        { x: 100, y: 50 },
        { x: 120, y: 100 },
      ]);
      const apex = chain.getJunctionPoints()[0]!;

      const ceiling = new RicochetSurface("ceiling", {
        start: { x: 0, y: 0 },
        end: { x: 200, y: 0 },
      });
      const ray = { from: { x: 50, y: 100 }, to: { x: 100, y: -100 } };
      const continuation = new HitPoint(ray, ceiling, 0.5, 0.5);

      // Case 2: Continuation before junction (entering)
      pairs.set(apex, continuation, 1);
      expect(pairs.get(apex, continuation)).toBe(1);
      expect(pairs.get(continuation, apex)).toBe(-1);
    });
  });

  describe("cross-type pairs", () => {
    it("handles pairs between different point types", () => {
      const pairs = new PreComputedPairs();

      const origin = new OriginPoint({ x: 0, y: 0 });
      const surface = new RicochetSurface("test", {
        start: { x: 10, y: 10 },
        end: { x: 100, y: 10 },
      });
      const endpoint = new Endpoint(surface, "start");
      const ray = { from: { x: 0, y: 0 }, to: { x: 50, y: 50 } };
      const hitPoint = new HitPoint(ray, surface, 0.5, 0.5);

      pairs.set(origin, endpoint, -1);
      pairs.set(endpoint, hitPoint, 1);

      expect(pairs.get(origin, endpoint)).toBe(-1);
      expect(pairs.get(endpoint, hitPoint)).toBe(1);
    });
  });
});

