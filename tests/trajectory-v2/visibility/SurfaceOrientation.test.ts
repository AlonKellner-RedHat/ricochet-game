/**
 * Tests for SurfaceOrientation - the unified source of truth for
 * ray ordering, entering/exiting classification, and shadow boundary.
 *
 * First Principles:
 * - A visibility polygon represents light spreading from origin
 * - The cross product determines which endpoint comes first in CCW
 * - This single calculation drives ALL derived decisions
 */

import { describe, it, expect } from "vitest";
import type { Surface } from "@/surfaces/Surface";
import {
  computeSurfaceOrientation,
  getShadowBoundaryOrderFromOrientation,
  type SurfaceOrientation,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

// Helper to create test surfaces
function createSurface(
  id: string,
  start: Vector2,
  end: Vector2
): Surface {
  return {
    id,
    segment: { start, end },
    canReflect: true,
  };
}

describe("SurfaceOrientation", () => {
  describe("computeSurfaceOrientation", () => {
    it("returns start first when end is CCW from start (positive cross)", () => {
      // Vertical surface with end above start
      // Origin below and to the RIGHT: cross product is positive
      // (origin→start) × (origin→end) = (100-150, 200-300) × (100-150, 100-300)
      //                                = (-50, -100) × (-50, -200)
      //                                = (-50)(-200) - (-100)(-50) = 10000 - 5000 = 5000 > 0
      const surface = createSurface("v1", { x: 100, y: 200 }, { x: 100, y: 100 });
      const origin = { x: 150, y: 300 };

      const orientation = computeSurfaceOrientation(surface, origin);

      // Positive cross → start comes first
      expect(orientation.crossProduct).toBeGreaterThan(0);
      expect(orientation.firstEndpoint).toBe("start");
    });

    it("returns end first when end is CW from start (negative cross)", () => {
      // Same vertical surface, but origin is to the LEFT
      // (origin→start) × (origin→end) = (100-50, 200-300) × (100-50, 100-300)
      //                                = (50, -100) × (50, -200)
      //                                = (50)(-200) - (-100)(50) = -10000 + 5000 = -5000 < 0
      const surface = createSurface("v2", { x: 100, y: 200 }, { x: 100, y: 100 });
      const origin = { x: 50, y: 300 };

      const orientation = computeSurfaceOrientation(surface, origin);

      // Negative cross → end comes first
      expect(orientation.crossProduct).toBeLessThan(0);
      expect(orientation.firstEndpoint).toBe("end");
    });

    it("uses deterministic ordering when collinear (zero cross) - start always wins", () => {
      // Origin directly in line with the surface
      const surface = createSurface("col", { x: 100, y: 100 }, { x: 100, y: 300 });
      const origin = { x: 100, y: 400 }; // On the same vertical line

      const orientation = computeSurfaceOrientation(surface, origin);

      expect(orientation.crossProduct).toBe(0);
      // When collinear (cross = 0), we use deterministic ordering: start always first
      // This avoids floating-point issues and maintains stability
      expect(orientation.firstEndpoint).toBe("start");
    });

    it("returns consistent results for player slightly left vs right of vertical surface", () => {
      // The bug case: vertical surface at x=850, player nearly below
      const surface = createSurface("ricochet-4", { x: 850, y: 350 }, { x: 850, y: 500 });

      // Player slightly to the left
      const originLeft = { x: 849.5, y: 666 };
      const orientationLeft = computeSurfaceOrientation(surface, originLeft);

      // Player slightly to the right
      const originRight = { x: 850.5, y: 666 };
      const orientationRight = computeSurfaceOrientation(surface, originRight);

      // The orientations should be OPPOSITE (player on different sides)
      expect(orientationLeft.firstEndpoint).not.toBe(orientationRight.firstEndpoint);

      // But each should be internally consistent!
      // Left of surface: end (500) is CCW from start (350), so start first
      expect(orientationLeft.crossProduct).toBeGreaterThan(0);
      expect(orientationLeft.firstEndpoint).toBe("start");

      // Right of surface: end (500) is CW from start (350), so end first
      expect(orientationRight.crossProduct).toBeLessThan(0);
      expect(orientationRight.firstEndpoint).toBe("end");
    });

    it("handles horizontal surface with player above", () => {
      const surface = createSurface("h1", { x: 100, y: 200 }, { x: 200, y: 200 });
      const origin = { x: 150, y: 100 }; // Above

      const orientation = computeSurfaceOrientation(surface, origin);

      // End (200, 200) is CW from start (100, 200) when viewed from above
      expect(orientation.crossProduct).toBeLessThan(0);
      expect(orientation.firstEndpoint).toBe("end");
    });

    it("handles horizontal surface with player below", () => {
      const surface = createSurface("h2", { x: 100, y: 200 }, { x: 200, y: 200 });
      const origin = { x: 150, y: 300 }; // Below

      const orientation = computeSurfaceOrientation(surface, origin);

      // End (200, 200) is CCW from start (100, 200) when viewed from below
      expect(orientation.crossProduct).toBeGreaterThan(0);
      expect(orientation.firstEndpoint).toBe("start");
    });

    it("handles diagonal surface", () => {
      const surface = createSurface("d1", { x: 100, y: 100 }, { x: 200, y: 200 });
      const origin = { x: 50, y: 150 };

      const orientation = computeSurfaceOrientation(surface, origin);

      // Should have a definite orientation
      expect(orientation.crossProduct).not.toBe(0);
    });
  });

  describe("getShadowBoundaryOrderFromOrientation", () => {
    it("returns positive for first endpoint (entering = continuation before)", () => {
      const surface = createSurface("s1", { x: 850, y: 350 }, { x: 850, y: 500 });
      const orientation: SurfaceOrientation = {
        surface,
        firstEndpoint: "start",
        crossProduct: 100,
      };

      // Create a mock endpoint for the start
      const startEndpoint = {
        type: "endpoint" as const,
        surface,
        which: "start" as const,
        computeXY: () => ({ x: 850, y: 350 }),
        getKey: () => "endpoint:s1:start",
        equals: () => false,
      };

      const order = getShadowBoundaryOrderFromOrientation(startEndpoint, orientation);

      // First endpoint = entering = continuation before endpoint = positive
      expect(order).toBeGreaterThan(0);
    });

    it("returns negative for second endpoint (exiting = endpoint before continuation)", () => {
      const surface = createSurface("s2", { x: 850, y: 350 }, { x: 850, y: 500 });
      const orientation: SurfaceOrientation = {
        surface,
        firstEndpoint: "start",
        crossProduct: 100,
      };

      // Create a mock endpoint for the end
      const endEndpoint = {
        type: "endpoint" as const,
        surface,
        which: "end" as const,
        computeXY: () => ({ x: 850, y: 500 }),
        getKey: () => "endpoint:s2:end",
        equals: () => false,
      };

      const order = getShadowBoundaryOrderFromOrientation(endEndpoint, orientation);

      // Second endpoint = exiting = endpoint before continuation = negative
      expect(order).toBeLessThan(0);
    });

    it("is consistent with orientation - first is always entering", () => {
      const surface = createSurface("s3", { x: 100, y: 100 }, { x: 200, y: 200 });

      // When end is first
      const orientationEndFirst: SurfaceOrientation = {
        surface,
        firstEndpoint: "end",
        crossProduct: -100,
      };

      const endEndpoint = {
        type: "endpoint" as const,
        surface,
        which: "end" as const,
        computeXY: () => ({ x: 200, y: 200 }),
        getKey: () => "endpoint:s3:end",
        equals: () => false,
      };

      const startEndpoint = {
        type: "endpoint" as const,
        surface,
        which: "start" as const,
        computeXY: () => ({ x: 100, y: 100 }),
        getKey: () => "endpoint:s3:start",
        equals: () => false,
      };

      // End is first = entering
      expect(getShadowBoundaryOrderFromOrientation(endEndpoint, orientationEndFirst)).toBeGreaterThan(0);
      // Start is second = exiting
      expect(getShadowBoundaryOrderFromOrientation(startEndpoint, orientationEndFirst)).toBeLessThan(0);
    });
  });

  describe("Invariant: orientation drives all decisions consistently", () => {
    it("ray order and shadow boundary agree for left-of-surface player", () => {
      const surface = createSurface("inv1", { x: 850, y: 350 }, { x: 850, y: 500 });
      const origin = { x: 849.5, y: 666 };

      const orientation = computeSurfaceOrientation(surface, origin);

      // Check that orientation gives consistent answers
      // First endpoint should have positive shadow boundary order (entering)
      // Second endpoint should have negative shadow boundary order (exiting)

      const startEndpoint = {
        type: "endpoint" as const,
        surface,
        which: "start" as const,
        computeXY: () => ({ x: 850, y: 350 }),
        getKey: () => "endpoint:inv1:start",
        equals: () => false,
      };

      const endEndpoint = {
        type: "endpoint" as const,
        surface,
        which: "end" as const,
        computeXY: () => ({ x: 850, y: 500 }),
        getKey: () => "endpoint:inv1:end",
        equals: () => false,
      };

      const startOrder = getShadowBoundaryOrderFromOrientation(startEndpoint, orientation);
      const endOrder = getShadowBoundaryOrderFromOrientation(endEndpoint, orientation);

      // The first endpoint should have positive order, second should have negative
      if (orientation.firstEndpoint === "start") {
        expect(startOrder).toBeGreaterThan(0);
        expect(endOrder).toBeLessThan(0);
      } else {
        expect(endOrder).toBeGreaterThan(0);
        expect(startOrder).toBeLessThan(0);
      }

      // And they should be opposite signs (one entering, one exiting)
      expect(startOrder * endOrder).toBeLessThan(0);
    });

    it("ray order and shadow boundary agree for right-of-surface player", () => {
      const surface = createSurface("inv2", { x: 850, y: 350 }, { x: 850, y: 500 });
      const origin = { x: 850.5, y: 666 };

      const orientation = computeSurfaceOrientation(surface, origin);

      const startEndpoint = {
        type: "endpoint" as const,
        surface,
        which: "start" as const,
        computeXY: () => ({ x: 850, y: 350 }),
        getKey: () => "endpoint:inv2:start",
        equals: () => false,
      };

      const endEndpoint = {
        type: "endpoint" as const,
        surface,
        which: "end" as const,
        computeXY: () => ({ x: 850, y: 500 }),
        getKey: () => "endpoint:inv2:end",
        equals: () => false,
      };

      const startOrder = getShadowBoundaryOrderFromOrientation(startEndpoint, orientation);
      const endOrder = getShadowBoundaryOrderFromOrientation(endEndpoint, orientation);

      // The first endpoint should have positive order, second should have negative
      if (orientation.firstEndpoint === "start") {
        expect(startOrder).toBeGreaterThan(0);
        expect(endOrder).toBeLessThan(0);
      } else {
        expect(endOrder).toBeGreaterThan(0);
        expect(startOrder).toBeLessThan(0);
      }

      // And they should be opposite signs
      expect(startOrder * endOrder).toBeLessThan(0);
    });
  });
});

