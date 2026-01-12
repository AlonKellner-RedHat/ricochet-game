/**
 * Hypothesis Tests for Directional Blocking
 *
 * Tests the CW/CCW blocking model for collinear surfaces.
 * Focuses on the full-demo scene at (581, 81) where the original bug occurred.
 */

import { describe, it, expect } from "vitest";
import { getSceneById } from "@/debug/debugScenes";
import {
  createFullCone,
  projectConeV2,
  computeSurfaceOrientation,
  type SurfaceOrientation,
} from "@/trajectory-v2/visibility/ConeProjectionV2";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import type { SurfaceChain } from "@/trajectory-v2/geometry/SurfaceChain";
import { isJunctionPoint } from "@/trajectory-v2/geometry/SurfaceChain";
import { isEndpoint, isHitPoint } from "@/trajectory-v2/geometry/SourcePoint";

describe("Collinear surface directional blocking", () => {
  // The problematic position from the full-demo scene
  const PLAYER_X = 581;
  const PLAYER_Y = 81;
  const origin = { x: PLAYER_X, y: PLAYER_Y };

  function setupFullDemoScene() {
    const sceneConfig = getSceneById("full-demo");
    if (!sceneConfig) throw new Error("full-demo scene not found");

    const screenChain = createScreenBoundaryChain({
      minX: 0,
      maxX: 1280,
      minY: 0,
      maxY: 720,
    });

    const allChains: SurfaceChain[] = [...sceneConfig.chains, screenChain];
    return { scene: sceneConfig, allChains, screenChain };
  }

  it("identifies the collinear surface in full-demo scene", () => {
    const { allChains } = setupFullDemoScene();

    // Compute orientations for all surfaces
    const collinearSurfaces: Array<{
      surface: { id: string };
      orientation: SurfaceOrientation;
    }> = [];

    for (const chain of allChains) {
      for (const surface of chain.getSurfaces()) {
        const orientation = computeSurfaceOrientation(surface, origin);
        if (orientation.crossProduct === 0) {
          collinearSurfaces.push({ surface, orientation });
        }
      }
    }

    console.log("Collinear surfaces at (581, 81):");
    for (const { surface } of collinearSurfaces) {
      console.log(`  - ${surface.id}`);
    }

    // The bug was that chain2 surface was collinear at this position
    // We expect to find at least one collinear surface
    expect(collinearSurfaces.length).toBeGreaterThan(0);
  });

  it("correctly identifies blocking status for collinear junction", () => {
    const { allChains } = setupFullDemoScene();

    // Compute orientations
    const orientations = new Map<string, SurfaceOrientation>();
    for (const chain of allChains) {
      for (const surface of chain.getSurfaces()) {
        orientations.set(surface.id, computeSurfaceOrientation(surface, origin));
      }
    }

    // Find junctions with collinear adjacent surfaces
    const collinearJunctions: Array<{
      junction: ReturnType<SurfaceChain["getJunctionPoints"]>[0];
      beforeCross: number;
      afterCross: number;
    }> = [];

    for (const chain of allChains) {
      for (const junction of chain.getJunctionPoints()) {
        const before = junction.getSurfaceBefore();
        const after = junction.getSurfaceAfter();
        const beforeOrientation = orientations.get(before.id);
        const afterOrientation = orientations.get(after.id);

        if (
          beforeOrientation?.crossProduct === 0 ||
          afterOrientation?.crossProduct === 0
        ) {
          collinearJunctions.push({
            junction,
            beforeCross: beforeOrientation?.crossProduct ?? 0,
            afterCross: afterOrientation?.crossProduct ?? 0,
          });
        }
      }
    }

    console.log("Junctions with collinear surfaces:");
    for (const { junction, beforeCross, afterCross } of collinearJunctions) {
      const xy = junction.computeXY();
      const status = junction.getBlockingStatus(orientations);
      const shadowOrder = junction.getShadowBoundaryOrder(orientations);
      console.log(`  - ${junction.getKey()} at (${xy.x}, ${xy.y})`);
      console.log(`    before cross: ${beforeCross}, after cross: ${afterCross}`);
      console.log(`    blocking: CW=${status.isCWBlocking}, CCW=${status.isCCWBlocking}`);
      console.log(`    shadowOrder: ${shadowOrder}`);
    }

    // Verify collinear junctions have correct blocking based on non-collinear surface
    for (const { junction, beforeCross, afterCross } of collinearJunctions) {
      const status = junction.getBlockingStatus(orientations);

      // If BOTH surfaces are collinear, junction should have no blocking
      if (beforeCross === 0 && afterCross === 0) {
        expect(status.isCWBlocking).toBe(false);
        expect(status.isCCWBlocking).toBe(false);
      }
      // If only one is collinear, blocking should come from the non-collinear one
      else {
        // Should have at least one direction blocked (from non-collinear surface)
        expect(status.isCWBlocking || status.isCCWBlocking).toBe(true);
      }
    }
  });

  it("generates valid visibility polygon for full-demo at (581, 81)", () => {
    const { allChains } = setupFullDemoScene();

    // Compute orientations for later reference
    const orientations = new Map<string, SurfaceOrientation>();
    for (const chain of allChains) {
      for (const surface of chain.getSurfaces()) {
        orientations.set(surface.id, computeSurfaceOrientation(surface, origin));
      }
    }

    const cone = createFullCone(origin);
    const sourcePoints = projectConeV2(cone, allChains);

    console.log("Visibility polygon vertices:");
    for (let i = 0; i < sourcePoints.length; i++) {
      const sp = sourcePoints[i]!;
      const xy = sp.computeXY();
      const type = isJunctionPoint(sp)
        ? "Junction"
        : isEndpoint(sp)
          ? "Endpoint"
          : isHitPoint(sp)
            ? "HitPoint"
            : "Origin";
      console.log(`  [${i}] ${type}[${sp.getKey()}] at (${xy.x.toFixed(1)}, ${xy.y.toFixed(1)})`);
    }

    // Basic sanity check
    expect(sourcePoints.length).toBeGreaterThan(3);
  });

  it("orders collinear points correctly based on blocking direction", () => {
    const { allChains } = setupFullDemoScene();

    // Compute orientations
    const orientations = new Map<string, SurfaceOrientation>();
    for (const chain of allChains) {
      for (const surface of chain.getSurfaces()) {
        orientations.set(surface.id, computeSurfaceOrientation(surface, origin));
      }
    }

    const cone = createFullCone(origin);
    const sourcePoints = projectConeV2(cone, allChains);

    // Find consecutive collinear points (same angle from origin)
    const collinearGroups: Array<{
      startIndex: number;
      points: typeof sourcePoints;
    }> = [];

    for (let i = 0; i < sourcePoints.length; i++) {
      const current = sourcePoints[i]!;
      const next = sourcePoints[(i + 1) % sourcePoints.length]!;

      const currXY = current.computeXY();
      const nextXY = next.computeXY();

      // Check if collinear using cross product
      const cross =
        (currXY.x - origin.x) * (nextXY.y - origin.y) -
        (currXY.y - origin.y) * (nextXY.x - origin.x);

      if (cross === 0 && i !== (i + 1) % sourcePoints.length) {
        // Find all points in this collinear group
        const group = [current];
        let j = (i + 1) % sourcePoints.length;
        while (j !== i) {
          const pt = sourcePoints[j]!;
          const ptXY = pt.computeXY();
          const c =
            (currXY.x - origin.x) * (ptXY.y - origin.y) -
            (currXY.y - origin.y) * (ptXY.x - origin.x);
          if (c === 0) {
            group.push(pt);
          } else {
            break;
          }
          j = (j + 1) % sourcePoints.length;
        }

        if (group.length >= 2) {
          collinearGroups.push({ startIndex: i, points: group });
          i += group.length - 1; // Skip ahead
        }
      }
    }

    console.log("Collinear point groups:");
    for (const { startIndex, points } of collinearGroups) {
      console.log(`  Group at index ${startIndex}:`);
      for (const pt of points) {
        const xy = pt.computeXY();
        const dist = Math.sqrt((xy.x - origin.x) ** 2 + (xy.y - origin.y) ** 2);
        console.log(`    - ${pt.getKey()} at dist=${dist.toFixed(1)}`);
      }
    }

    // The key test: collinear groups should be ordered by shadow boundary order
    // If the first point is CCW blocking → far-before-near (descending distance)
    // If the first point is CW blocking → near-before-far (ascending distance)
    for (const { points } of collinearGroups) {
      if (points.length < 2) continue;

      const firstPoint = points[0]!;
      const status = firstPoint.getBlockingStatus(orientations);

      const distances = points.map((pt) => {
        const xy = pt.computeXY();
        return Math.sqrt((xy.x - origin.x) ** 2 + (xy.y - origin.y) ** 2);
      });

      if (status.isCCWBlocking && !status.isCWBlocking) {
        // Far-before-near: distances should be descending
        for (let i = 0; i < distances.length - 1; i++) {
          expect(distances[i]).toBeGreaterThanOrEqual(distances[i + 1]!);
        }
      } else if (status.isCWBlocking && !status.isCCWBlocking) {
        // Near-before-far: distances should be ascending
        for (let i = 0; i < distances.length - 1; i++) {
          expect(distances[i]).toBeLessThanOrEqual(distances[i + 1]!);
        }
      }
    }
  });
});
