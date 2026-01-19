/**
 * ArcHitPointProvenance.test.ts
 *
 * Tests for ArcHitPoint provenance-based keys.
 * ArcHitPoints should have stable keys based on their ray source,
 * not floating-point coordinates.
 */

import { describe, expect, it } from "vitest";
import {
  ArcHitPoint,
  startOf,
  endOf,
} from "@/trajectory-v2/geometry/SourcePoint";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

// =============================================================================
// TEST HELPERS
// =============================================================================

function createTestSurface(id: string, start: Vector2, end: Vector2): Surface {
  return {
    id,
    segment: { start, end },
    surfaceType: "test",
    onArrowHit: () => ({ type: "blocked" }),
    isPlannable: () => false,
    getVisualProperties: () => ({ color: 0, alpha: 1, lineWidth: 1 }),
    getNormal: () => ({ x: 0, y: 1 }),
    canReflectFrom: () => true,
  } as Surface;
}

// =============================================================================
// TESTS
// =============================================================================

describe("ArcHitPoint Provenance", () => {
  const surface = createTestSurface(
    "mirror-left-0",
    { x: 250, y: 550 },
    { x: 250, y: 150 }
  );

  describe("key stability with ray source", () => {
    it("should have stable key based on ray source, not coordinates", () => {
      const sourceEndpoint = endOf(surface); // (250, 150)

      // Two ArcHitPoints with slightly different coordinates
      // (simulating floating-point differences from different origins)
      const rlp1 = new ArcHitPoint(
        { x: 257.1356239447631, y: 116.58183324070785 },
        sourceEndpoint
      );
      const rlp2 = new ArcHitPoint(
        { x: 257.1356219945502, y: 116.58184237410796 },
        sourceEndpoint
      );

      // Same source = same key, even with different coordinates
      expect(rlp1.getKey()).toBe(rlp2.getKey());
    });

    it("should include ray source key in the ArcHitPoint key", () => {
      const sourceEndpoint = endOf(surface);
      const rlp = new ArcHitPoint(
        { x: 257.13, y: 116.58 },
        sourceEndpoint
      );

      expect(rlp.getKey()).toContain(sourceEndpoint.getKey());
    });

    it("should have different keys for different ray sources", () => {
      const startEndpoint = startOf(surface);
      const endEndpoint = endOf(surface);

      const rlp1 = new ArcHitPoint({ x: 100, y: 200 }, startEndpoint);
      const rlp2 = new ArcHitPoint({ x: 100, y: 200 }, endEndpoint);

      // Same coordinates but different sources = different keys
      expect(rlp1.getKey()).not.toBe(rlp2.getKey());
    });

    it("should fallback to coordinate-based key without ray source", () => {
      const rlp = new ArcHitPoint({ x: 100.5, y: 200.5 });

      // Without source, uses coordinates
      expect(rlp.getKey()).toBe("arc_hit:100.5,200.5");
    });
  });

  describe("raySource property", () => {
    it("should store the ray source", () => {
      const sourceEndpoint = endOf(surface);
      const rlp = new ArcHitPoint({ x: 100, y: 200 }, sourceEndpoint);

      expect(rlp.raySource).toBe(sourceEndpoint);
    });

    it("should have undefined raySource when not provided", () => {
      const rlp = new ArcHitPoint({ x: 100, y: 200 });

      expect(rlp.raySource).toBeUndefined();
    });
  });

  describe("getExcludedSurfaceIds for arc hit points", () => {
    it("should return empty array (no surfaces excluded)", () => {
      const sourceEndpoint = endOf(surface);
      const rlp = new ArcHitPoint({ x: 100, y: 200 }, sourceEndpoint);

      // ArcHitPoints don't exclude surfaces, but when casting TOWARD them,
      // the range limit itself should be excluded (handled by caller)
      expect(rlp.getExcludedSurfaceIds()).toEqual([]);
    });
  });
});
