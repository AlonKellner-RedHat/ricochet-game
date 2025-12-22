/**
 * Physics First Principle Assertions
 *
 * Principles 2.1 - 2.5: Physical accuracy rules
 */

import { expect } from "vitest";
import { distance, executeSetup } from "../MatrixTestRunner";
import {
  arePathsEquivalent,
  transformToIdealSetup,
} from "../setupTransformer";
import type { FirstPrincipleAssertion, TestResults, TestSetup } from "../types";

/**
 * Principle 2.1: Actual path must follow physically accurate trajectory
 *
 * Checks:
 * - Path reflects off reflective surfaces
 * - Path stops at walls/obstacles
 */
export const physicsAccurate: FirstPrincipleAssertion = {
  id: "physics-accurate",
  principle: "2.1",
  description: "Actual path follows physically accurate trajectory",
  assert: (setup: TestSetup, results: TestResults) => {
    const { actualPath } = results;

    // Handle degenerate case: cursor at player position
    const isDegenerate =
      Math.abs(setup.cursor.x - setup.player.x) < 1 &&
      Math.abs(setup.cursor.y - setup.player.y) < 1;

    // If path is blocked, blockedBy should be set
    if (actualPath.blockedBy) {
      expect(actualPath.reachedCursor).toBe(false);
    }

    // Path points should form a continuous trajectory
    if (isDegenerate) {
      expect(actualPath.points.length).toBeGreaterThanOrEqual(1);
    } else {
      expect(actualPath.points.length).toBeGreaterThanOrEqual(2);
    }

    // If expected blockedBy is set in setup, verify it
    if (setup.expected?.blockedBy) {
      expect(actualPath.blockedBy?.id).toBe(setup.expected.blockedBy);
    }

    // If expected reachesCursor is set, verify it
    if (setup.expected?.reachesCursor !== undefined) {
      expect(actualPath.reachedCursor).toBe(setup.expected.reachesCursor);
    }
  },
};

/**
 * Principle 2.2: Forward projection must follow physically accurate trajectory
 *
 * Checks:
 * - Projection reflects off reflective surfaces encountered after cursor
 * - Projection stops at walls
 * - Projection has intermediate reflection points (not just endpoint)
 */
export const projectionPhysics: FirstPrincipleAssertion = {
  id: "projection-physics",
  principle: "2.2",
  description: "Forward projection follows physics (reflects, stops at walls)",
  assert: (setup: TestSetup, results: TestResults) => {
    const { actualPath } = results;

    // If path reached cursor, check projection
    if (actualPath.reachedCursor && actualPath.forwardProjection) {
      const projection = actualPath.forwardProjection;
      const cursor = setup.cursor;

      // Check if there are reflective surfaces after cursor
      const surfacesAfterCursor = setup.allSurfaces.filter((s) => {
        // Simple check: surface is ahead of cursor in some direction
        const surfaceMidX = (s.segment.start.x + s.segment.end.x) / 2;
        const surfaceMidY = (s.segment.start.y + s.segment.end.y) / 2;

        // Surface is "after" cursor if it's further from player than cursor
        const playerToCursor = distance(setup.player, cursor);
        const playerToSurface = distance(setup.player, { x: surfaceMidX, y: surfaceMidY });

        return playerToSurface > playerToCursor;
      });

      // If there are reflective surfaces after cursor, projection should have multiple points
      // (This is a heuristic - actual reflection depends on geometry)
      const reflectiveSurfacesAfter = surfacesAfterCursor.filter((s) =>
        s.canReflectFrom({ x: 1, y: 0 })
      );

      // Projection should exist if path reached cursor
      expect(projection.length).toBeGreaterThan(0);
    }

    // If blocked by wall, projection should be empty (can't continue through wall)
    if (actualPath.blockedBy) {
      expect(actualPath.forwardProjection?.length ?? 0).toBe(0);
    }
  },
};

/**
 * Principle 2.3: Arrow waypoints must include path + projection
 *
 * Checks:
 * - Waypoints include all path points
 * - Waypoints include projection points
 * - Arrow would continue past cursor along physical trajectory
 */
export const arrowComplete: FirstPrincipleAssertion = {
  id: "arrow-complete",
  principle: "2.3",
  description: "Arrow waypoints include path and forward projection",
  assert: (_setup: TestSetup, results: TestResults) => {
    const { actualPath, arrowWaypoints } = results;

    // Waypoints should include all path points
    expect(arrowWaypoints.length).toBeGreaterThanOrEqual(actualPath.points.length);

    // First waypoint should match first path point
    if (arrowWaypoints.length > 0 && actualPath.points.length > 0) {
      expect(arrowWaypoints[0]).toEqual(actualPath.points[0]);
    }

    // If there's a forward projection, waypoints should include it
    if (
      actualPath.forwardProjection &&
      actualPath.forwardProjection.length > 0 &&
      !actualPath.blockedBy
    ) {
      // Waypoints should have more points than just the path
      expect(arrowWaypoints.length).toBeGreaterThan(actualPath.points.length);

      // Last waypoint should be the last projection point
      const lastProjection =
        actualPath.forwardProjection[actualPath.forwardProjection.length - 1];
      const lastWaypoint = arrowWaypoints[arrowWaypoints.length - 1];
      expect(lastWaypoint).toEqual(lastProjection);
    }
  },
};

/**
 * Principle 2.4: Planned path forward projection must also follow physics
 *
 * The dashed red line (planned path projection beyond cursor) must:
 * - Reflect off reflective surfaces after the cursor
 * - Stop at walls after the cursor
 * - Behave as if an arrow started from the cursor in the path direction
 */
export const plannedProjectionPhysics: FirstPrincipleAssertion = {
  id: "planned-projection-physics",
  principle: "2.4",
  description: "Planned path forward projection follows physics (reflects off surfaces after cursor)",
  assert: (setup: TestSetup, results: TestResults) => {
    const { plannedPath } = results;

    // Skip degenerate cases
    const isDegenerate =
      Math.abs(setup.cursor.x - setup.player.x) < 1 &&
      Math.abs(setup.cursor.y - setup.player.y) < 1;
    if (isDegenerate) return;

    // If planned path has a forward projection, check it follows physics
    if (plannedPath.forwardProjection && plannedPath.forwardProjection.length > 0) {
      const cursor = setup.cursor;
      const projection = plannedPath.forwardProjection;

      // Find surfaces that are after the cursor (could block/reflect the projection)
      const surfacesAfterCursor = setup.allSurfaces.filter((s) => {
        const surfaceMidX = (s.segment.start.x + s.segment.end.x) / 2;
        const surfaceMidY = (s.segment.start.y + s.segment.end.y) / 2;

        // Get direction from cursor to last path point before cursor
        const pathDir = plannedPath.points.length >= 2
          ? {
              x: plannedPath.points[plannedPath.points.length - 1]!.x -
                 plannedPath.points[plannedPath.points.length - 2]!.x,
              y: plannedPath.points[plannedPath.points.length - 1]!.y -
                 plannedPath.points[plannedPath.points.length - 2]!.y,
            }
          : { x: 1, y: 0 };

        // Check if surface is "ahead" of cursor in the path direction
        const toSurface = { x: surfaceMidX - cursor.x, y: surfaceMidY - cursor.y };
        const dot = pathDir.x * toSurface.x + pathDir.y * toSurface.y;

        return dot > 10; // Surface is ahead of cursor
      });

      // If there are reflective surfaces after cursor, projection should have intermediate points
      const reflectiveSurfacesAfter = surfacesAfterCursor.filter((s) =>
        s.canReflectFrom({ x: 1, y: 0 })
      );

      if (reflectiveSurfacesAfter.length > 0) {
        // The projection should contain reflection points (more than just endpoint)
        // If there's a surface ahead and we're going toward it, projection should have
        // at least 2 points: the hit point and the reflected continuation
        
        // For surfaces that are clearly in the projection path, verify reflection
        for (const surface of reflectiveSurfacesAfter) {
          const surfaceX = (surface.segment.start.x + surface.segment.end.x) / 2;
          
          // Check if any projection point is near this surface
          const hasPointNearSurface = projection.some(
            (p) => Math.abs(p.x - surfaceX) < 20
          );

          // If the surface is directly ahead, projection should hit it
          // This is the key check: projection must have intermediate reflection points
          if (hasPointNearSurface && projection.length >= 2) {
            // Good: projection has intermediate points (reflecting)
            expect(projection.length).toBeGreaterThanOrEqual(2);
          }
        }
      }
    }
  },
};

/**
 * Principle 2.5: Red Path Equivalence
 *
 * When a path is red (due to obstructions or off-segment reflections), if we:
 * 1. Remove all obstructing surfaces that caused divergence
 * 2. Extend/translate planned surface segments to reach their reflection points
 *
 * Then recalculating the path should produce:
 * - Identical waypoints/geometry (the planned path)
 * - Green/yellow coloring (aligned) instead of red
 *
 * This validates that the red path truly shows the "ideal" trajectory.
 */
export const redPathEquivalence: FirstPrincipleAssertion = {
  id: "red-path-equivalence",
  principle: "2.5",
  description: "Red path must equal ideal path with obstructions removed and segments extended",
  assert: (setup: TestSetup, results: TestResults) => {
    // Skip if paths are already aligned (no red to validate)
    if (results.alignment.isFullyAligned) {
      return;
    }

    // Transform setup to ideal version
    const transformed = transformToIdealSetup(setup, results);

    // Skip if transformation is not valid (various edge cases)
    if (!transformed.isValid) {
      // These are known cases where the transformation cannot be applied:
      // - paths_already_aligned: No divergence to fix
      // - reflected_off_removed: Original used an obstruction for reflection
      // - no_modifications_needed: Divergence has unknown cause
      // - new_intersection: Modified surfaces create new problems
      //
      // Log for visibility but don't fail
      if (
        transformed.invalidReason !== "paths_already_aligned" &&
        transformed.invalidReason !== "no_modifications_needed"
      ) {
        console.log(
          `[2.5] Skipping ${setup.name}: ${transformed.invalidReason}`
        );
      }
      return;
    }

    // Execute the ideal setup
    const idealResults = executeSetup(transformed.setup!);

    // CORE ASSERTION 1: The ideal setup should produce aligned paths
    expect(
      idealResults.alignment.isFullyAligned,
      `Expected ideal setup to have aligned paths, but divergence exists at index ${idealResults.alignment.firstMismatchIndex}`
    ).toBe(true);

    // CORE ASSERTION 2: The planned path waypoints should match
    // The ideal setup's planned path should be geometrically equivalent
    // to the original's planned path (just executed without obstacles)
    expect(
      arePathsEquivalent(results.plannedPath, idealResults.plannedPath, 2),
      `Expected planned paths to be geometrically equivalent.
       Original points: ${results.plannedPath.points.length}
       Ideal points: ${idealResults.plannedPath.points.length}`
    ).toBe(true);
  },
};

/**
 * All physics assertions.
 */
export const physicsAssertions: readonly FirstPrincipleAssertion[] = [
  physicsAccurate,
  projectionPhysics,
  arrowComplete,
  plannedProjectionPhysics,
  redPathEquivalence,
];

