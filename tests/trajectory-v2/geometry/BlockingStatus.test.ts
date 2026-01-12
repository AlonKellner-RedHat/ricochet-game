/**
 * BlockingStatus Tests (TDD)
 *
 * Tests for the directional blocking model where each point has
 * isCWBlocking and isCCWBlocking based on surface orientation.
 */

import { describe, it, expect } from "vitest";
import { WallSurface } from "@/surfaces/WallSurface";
import {
  Endpoint,
  OriginPoint,
  HitPoint,
  type OrientationInfo,
} from "@/trajectory-v2/geometry/SourcePoint";
import { SurfaceChain } from "@/trajectory-v2/geometry/SurfaceChain";
import { computeSurfaceOrientation } from "@/trajectory-v2/visibility/ConeProjectionV2";

// =============================================================================
// PHASE 1: Endpoint Blocking from Surface Orientation
// =============================================================================

describe("BlockingStatus", () => {
  describe("Endpoint blocking from surface orientation", () => {
    // Origin at (0, 0) for all tests
    const ORIGIN = { x: 0, y: 0 };

    it("CCW surface start endpoint is CCW blocking only", () => {
      // Surface from (100, 0) to (0, 100) - seen CCW from origin
      // crossProduct > 0: (100, 0) × (0, 100) = 100*100 - 0*0 = 10000 > 0
      const surface = new WallSurface("test-ccw", {
        start: { x: 100, y: 0 },
        end: { x: 0, y: 100 },
      });
      const orientations = new Map<string, OrientationInfo>([
        [surface.id, computeSurfaceOrientation(surface, ORIGIN)],
      ]);

      const startEndpoint = new Endpoint(surface, "start");
      const status = startEndpoint.getBlockingStatus(orientations);

      expect(status.isCWBlocking).toBe(false);
      expect(status.isCCWBlocking).toBe(true);
    });

    it("CCW surface end endpoint is CW blocking only", () => {
      // Same CCW surface - end endpoint
      const surface = new WallSurface("test-ccw", {
        start: { x: 100, y: 0 },
        end: { x: 0, y: 100 },
      });
      const orientations = new Map<string, OrientationInfo>([
        [surface.id, computeSurfaceOrientation(surface, ORIGIN)],
      ]);

      const endEndpoint = new Endpoint(surface, "end");
      const status = endEndpoint.getBlockingStatus(orientations);

      expect(status.isCWBlocking).toBe(true);
      expect(status.isCCWBlocking).toBe(false);
    });

    it("CW surface start endpoint is CW blocking only", () => {
      // Surface from (0, 100) to (100, 0) - seen CW from origin
      // crossProduct < 0: (0, 100) × (100, 0) = 0*0 - 100*100 = -10000 < 0
      const surface = new WallSurface("test-cw", {
        start: { x: 0, y: 100 },
        end: { x: 100, y: 0 },
      });
      const orientations = new Map<string, OrientationInfo>([
        [surface.id, computeSurfaceOrientation(surface, ORIGIN)],
      ]);

      const startEndpoint = new Endpoint(surface, "start");
      const status = startEndpoint.getBlockingStatus(orientations);

      expect(status.isCWBlocking).toBe(true);
      expect(status.isCCWBlocking).toBe(false);
    });

    it("CW surface end endpoint is CCW blocking only", () => {
      // Same CW surface - end endpoint
      const surface = new WallSurface("test-cw", {
        start: { x: 0, y: 100 },
        end: { x: 100, y: 0 },
      });
      const orientations = new Map<string, OrientationInfo>([
        [surface.id, computeSurfaceOrientation(surface, ORIGIN)],
      ]);

      const endEndpoint = new Endpoint(surface, "end");
      const status = endEndpoint.getBlockingStatus(orientations);

      expect(status.isCWBlocking).toBe(false);
      expect(status.isCCWBlocking).toBe(true);
    });

    it("collinear surface endpoint has no blocking", () => {
      // Surface from (100, 100) to (200, 200) - collinear with origin
      // crossProduct = 0: (100, 100) × (200, 200) = 100*200 - 100*200 = 0
      const surface = new WallSurface("test-collinear", {
        start: { x: 100, y: 100 },
        end: { x: 200, y: 200 },
      });
      const orientations = new Map<string, OrientationInfo>([
        [surface.id, computeSurfaceOrientation(surface, ORIGIN)],
      ]);

      const startEndpoint = new Endpoint(surface, "start");
      const endEndpoint = new Endpoint(surface, "end");

      const startStatus = startEndpoint.getBlockingStatus(orientations);
      const endStatus = endEndpoint.getBlockingStatus(orientations);

      expect(startStatus.isCWBlocking).toBe(false);
      expect(startStatus.isCCWBlocking).toBe(false);
      expect(endStatus.isCWBlocking).toBe(false);
      expect(endStatus.isCCWBlocking).toBe(false);
    });
  });

  describe("OriginPoint blocking", () => {
    it("OriginPoint has no blocking in either direction", () => {
      const origin = new OriginPoint({ x: 100, y: 100 });
      const orientations = new Map<string, OrientationInfo>();

      const status = origin.getBlockingStatus(orientations);

      expect(status.isCWBlocking).toBe(false);
      expect(status.isCCWBlocking).toBe(false);
    });
  });

  describe("HitPoint blocking", () => {
    it("HitPoint is fully blocking (both CW and CCW)", () => {
      const surface = new WallSurface("test", {
        start: { x: 100, y: 0 },
        end: { x: 0, y: 100 },
      });
      const ray = { from: { x: 0, y: 0 }, to: { x: 50, y: 50 } };
      const hitPoint = new HitPoint(ray, surface, 1.0, 0.5);
      const orientations = new Map<string, OrientationInfo>();

      const status = hitPoint.getBlockingStatus(orientations);

      expect(status.isCWBlocking).toBe(true);
      expect(status.isCCWBlocking).toBe(true);
    });
  });
});

// =============================================================================
// PHASE 2: JunctionPoint Blocking Aggregation
// =============================================================================

describe("JunctionPoint blocking aggregation", () => {
  const ORIGIN = { x: 0, y: 0 };

  it("junction between two CCW surfaces is fully blocking", () => {
    // Create a chain with two surfaces, both CCW from origin
    // Surface 1: (100, 0) → (50, 50) - CCW
    // Surface 2: (50, 50) → (0, 100) - CCW
    const chain = new SurfaceChain({
      vertices: [
        { x: 100, y: 0 },
        { x: 50, y: 50 }, // junction
        { x: 0, y: 100 },
      ],
      isClosed: false,
      surfaceFactory: (i, s, e) =>
        new WallSurface(`surf-${i}`, { start: s, end: e }),
    });

    const surfaces = chain.getSurfaces();
    const orientations = new Map<string, OrientationInfo>();
    for (const surface of surfaces) {
      orientations.set(surface.id, computeSurfaceOrientation(surface, ORIGIN));
    }

    // Verify both surfaces are CCW
    expect(orientations.get("surf-0")!.crossProduct).toBeGreaterThan(0);
    expect(orientations.get("surf-1")!.crossProduct).toBeGreaterThan(0);

    const junction = chain.getJunctionPoints()[0]!;
    const status = junction.getBlockingStatus(orientations);

    // Before surface ends here (CW contribution from CCW surface)
    // After surface starts here (CCW contribution from CCW surface)
    expect(status.isCWBlocking).toBe(true);
    expect(status.isCCWBlocking).toBe(true);
  });

  it("junction between CCW-before and CW-after is CW blocking only", () => {
    // Create a chain where before is CCW and after is CW
    // Need to pick vertices carefully to avoid collinearity
    // Surface 0: (100, 0) → (50, 50) - CCW (ends here → CW contribution)
    // Surface 1: (50, 50) → (0, 0) - CW (starts here → CW contribution)
    // crossProduct for (50,50) × (0,0) from origin (0,0) = undefined
    // Let's use: (50, 50) → (100, 25) which is CW
    // crossProduct: (50, 50) × (100, 25) = 50*25 - 50*100 = 1250 - 5000 = -3750 < 0 → CW
    const chain = new SurfaceChain({
      vertices: [
        { x: 100, y: 0 },
        { x: 50, y: 50 }, // junction
        { x: 100, y: 25 },
      ],
      isClosed: false,
      surfaceFactory: (i, s, e) =>
        new WallSurface(`surf-${i}`, { start: s, end: e }),
    });

    const surfaces = chain.getSurfaces();
    const orientations = new Map<string, OrientationInfo>();
    for (const surface of surfaces) {
      orientations.set(surface.id, computeSurfaceOrientation(surface, ORIGIN));
    }

    // Verify surface 0 is CCW and surface 1 is CW
    expect(orientations.get("surf-0")!.crossProduct).toBeGreaterThan(0);
    expect(orientations.get("surf-1")!.crossProduct).toBeLessThan(0);

    const junction = chain.getJunctionPoints()[0]!;
    const status = junction.getBlockingStatus(orientations);

    // Before: CCW surface ends here → CW contribution
    // After: CW surface starts here → CW contribution
    expect(status.isCWBlocking).toBe(true);
    expect(status.isCCWBlocking).toBe(false);
  });

  it("junction with collinear before surface uses only after contribution", () => {
    // Create a chain where before is collinear and after is CCW
    // Surface 1: (50, 50) → (100, 100) - collinear (no contribution)
    // Surface 2: (100, 100) → (50, 150) - CCW (starts here → CCW contribution)
    const chain = new SurfaceChain({
      vertices: [
        { x: 50, y: 50 },
        { x: 100, y: 100 }, // junction - collinear point
        { x: 50, y: 150 },
      ],
      isClosed: false,
      surfaceFactory: (i, s, e) =>
        new WallSurface(`surf-${i}`, { start: s, end: e }),
    });

    const surfaces = chain.getSurfaces();
    const orientations = new Map<string, OrientationInfo>();
    for (const surface of surfaces) {
      orientations.set(surface.id, computeSurfaceOrientation(surface, ORIGIN));
    }

    // Verify surface 0 is collinear and surface 1 is CCW
    expect(orientations.get("surf-0")!.crossProduct).toBe(0);
    expect(orientations.get("surf-1")!.crossProduct).toBeGreaterThan(0);

    const junction = chain.getJunctionPoints()[0]!;
    const status = junction.getBlockingStatus(orientations);

    // Before: collinear → no contribution
    // After: CCW surface starts here → CCW contribution
    expect(status.isCWBlocking).toBe(false);
    expect(status.isCCWBlocking).toBe(true);
  });

  it("junction between two collinear surfaces has no blocking", () => {
    // Create a chain where both surfaces are collinear
    // Surface 1: (50, 50) → (100, 100) - collinear
    // Surface 2: (100, 100) → (150, 150) - collinear
    const chain = new SurfaceChain({
      vertices: [
        { x: 50, y: 50 },
        { x: 100, y: 100 }, // junction
        { x: 150, y: 150 },
      ],
      isClosed: false,
      surfaceFactory: (i, s, e) =>
        new WallSurface(`surf-${i}`, { start: s, end: e }),
    });

    const surfaces = chain.getSurfaces();
    const orientations = new Map<string, OrientationInfo>();
    for (const surface of surfaces) {
      orientations.set(surface.id, computeSurfaceOrientation(surface, ORIGIN));
    }

    // Verify both surfaces are collinear
    expect(orientations.get("surf-0")!.crossProduct).toBe(0);
    expect(orientations.get("surf-1")!.crossProduct).toBe(0);

    const junction = chain.getJunctionPoints()[0]!;
    const status = junction.getBlockingStatus(orientations);

    expect(status.isCWBlocking).toBe(false);
    expect(status.isCCWBlocking).toBe(false);
  });
});

// =============================================================================
// PHASE 3: Shadow Boundary Order from Blocking Status
// =============================================================================

describe("Shadow boundary order from blocking status", () => {
  const ORIGIN = { x: 0, y: 0 };

  it("CCW-only blocking point has far-before-near order", () => {
    // CCW surface start endpoint is CCW blocking only
    const surface = new WallSurface("test-ccw", {
      start: { x: 100, y: 0 },
      end: { x: 0, y: 100 },
    });
    const orientations = new Map<string, OrientationInfo>([
      [surface.id, computeSurfaceOrientation(surface, ORIGIN)],
    ]);

    const startEndpoint = new Endpoint(surface, "start");
    const order = startEndpoint.getShadowBoundaryOrder(orientations);

    // CCW blocking = entering shadow = far-before-near = positive
    expect(order).toBeGreaterThan(0);
  });

  it("CW-only blocking point has near-before-far order", () => {
    // CCW surface end endpoint is CW blocking only
    const surface = new WallSurface("test-ccw", {
      start: { x: 100, y: 0 },
      end: { x: 0, y: 100 },
    });
    const orientations = new Map<string, OrientationInfo>([
      [surface.id, computeSurfaceOrientation(surface, ORIGIN)],
    ]);

    const endEndpoint = new Endpoint(surface, "end");
    const order = endEndpoint.getShadowBoundaryOrder(orientations);

    // CW blocking = exiting shadow = near-before-far = negative
    expect(order).toBeLessThan(0);
  });

  it("non-blocking point has zero order", () => {
    // Collinear surface endpoint has no blocking
    const surface = new WallSurface("test-collinear", {
      start: { x: 100, y: 100 },
      end: { x: 200, y: 200 },
    });
    const orientations = new Map<string, OrientationInfo>([
      [surface.id, computeSurfaceOrientation(surface, ORIGIN)],
    ]);

    const endpoint = new Endpoint(surface, "start");
    const order = endpoint.getShadowBoundaryOrder(orientations);

    expect(order).toBe(0);
  });
});
