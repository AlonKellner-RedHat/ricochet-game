/**
 * Unit tests for isBlocking method on SourcePoint types
 *
 * Definition: isBlocking() = true means NO continuation ray is cast
 *
 * OCP: Each point type implements its own blocking behavior:
 * - OriginPoint: never blocks (window endpoints pass light)
 * - Endpoint: never blocks (continuation ray IS cast from endpoints)
 * - HitPoint: always blocks (surface hit - no continuation)
 * - JunctionPoint: depends on surface orientations
 */

import { RicochetSurface } from "@/surfaces/RicochetSurface";
import {
  Endpoint,
  HitPoint,
  type OrientationInfo,
  OriginPoint,
} from "@/trajectory-v2/geometry/SourcePoint";
import {
  createRicochetChain,
  JunctionPoint,
} from "@/trajectory-v2/geometry/SurfaceChain";
import { describe, expect, it } from "vitest";

describe("SourcePoint.isBlocking", () => {
  // Empty orientations map for types that don't use it
  const emptyOrientations = new Map<string, OrientationInfo>();

  describe("OriginPoint", () => {
    it("never blocks (window endpoints pass light)", () => {
      const origin = new OriginPoint({ x: 100, y: 200 });
      expect(origin.isBlocking(emptyOrientations)).toBe(false);
    });

    it("returns false regardless of orientation map contents", () => {
      const origin = new OriginPoint({ x: 0, y: 0 });
      const orientations = new Map<string, OrientationInfo>([
        ["some-surface", { crossProduct: 100 }],
      ]);
      expect(origin.isBlocking(orientations)).toBe(false);
    });
  });

  describe("Endpoint", () => {
    it("never blocks (continuation ray is cast)", () => {
      const surface = new RicochetSurface("test-surface", {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      });
      const startEndpoint = new Endpoint(surface, "start");
      const endEndpoint = new Endpoint(surface, "end");

      // Endpoints never block - a continuation ray IS cast from them
      expect(startEndpoint.isBlocking(emptyOrientations)).toBe(false);
      expect(endEndpoint.isBlocking(emptyOrientations)).toBe(false);
    });
  });

  describe("HitPoint", () => {
    it("always blocks (surface hit)", () => {
      const surface = new RicochetSurface("test-surface", {
        start: { x: 0, y: 0 },
        end: { x: 100, y: 0 },
      });
      const ray = { source: { x: 50, y: 100 }, target: { x: 50, y: -100 } };
      const hitPoint = new HitPoint(ray, surface, 0.5, 0.5);

      expect(hitPoint.isBlocking(emptyOrientations)).toBe(true);
    });
  });

  describe("JunctionPoint", () => {
    // Create a V-shape chain for testing
    // Apex at (100, 50), arms at (80, 100) and (120, 100)
    const chain = createRicochetChain("test-v", [
      { x: 80, y: 100 },
      { x: 100, y: 50 }, // apex
      { x: 120, y: 100 },
    ]);
    const junctions = chain.getJunctionPoints();
    const apex = junctions[0]; // The apex junction

    it("blocks when surfaces have SAME orientation (both positive cross)", () => {
      // Player below the V - both surfaces face away
      const orientations = new Map<string, OrientationInfo>([
        [chain.getSurfaces()[0]!.id, { crossProduct: 100 }], // before surface
        [chain.getSurfaces()[1]!.id, { crossProduct: 200 }], // after surface
      ]);
      expect(apex!.isBlocking(orientations)).toBe(true);
    });

    it("blocks when surfaces have SAME orientation (both negative cross)", () => {
      // Player above the V - both surfaces face toward
      const orientations = new Map<string, OrientationInfo>([
        [chain.getSurfaces()[0]!.id, { crossProduct: -100 }],
        [chain.getSurfaces()[1]!.id, { crossProduct: -200 }],
      ]);
      expect(apex!.isBlocking(orientations)).toBe(true);
    });

    it("does NOT block when surfaces have OPPOSITE orientations (light passes)", () => {
      // Player to the side of V - one surface faces toward, other away
      const orientations = new Map<string, OrientationInfo>([
        [chain.getSurfaces()[0]!.id, { crossProduct: 100 }], // before: positive
        [chain.getSurfaces()[1]!.id, { crossProduct: -200 }], // after: negative
      ]);
      expect(apex!.isBlocking(orientations)).toBe(false);
    });

    it("does NOT block when surfaces have OPPOSITE orientations (reversed)", () => {
      const orientations = new Map<string, OrientationInfo>([
        [chain.getSurfaces()[0]!.id, { crossProduct: -100 }], // before: negative
        [chain.getSurfaces()[1]!.id, { crossProduct: 200 }], // after: positive
      ]);
      expect(apex!.isBlocking(orientations)).toBe(false);
    });

    it("blocks when orientations are missing (safe default)", () => {
      // Empty map - should block as safe default
      expect(apex!.isBlocking(emptyOrientations)).toBe(true);
    });
  });
});

