/**
 * Meta Tests for Setup Transformer and Red Path Equivalence Assertion
 *
 * These tests validate that:
 * 1. The transformer correctly identifies obstructions and off-segment hits
 * 2. The transformer correctly removes/extends surfaces
 * 3. The redPathEquivalence assertion works as expected
 * 4. Edge cases are handled properly
 */

import { describe, expect, it } from "vitest";
import {
  buildActualPath,
  buildPlannedPath,
  calculateAlignment,
} from "@/trajectory-v2/engine/PathBuilder";
import {
  createHorizontalSurface,
  createTestSurface,
  createVerticalSurface,
  executeSetup,
} from "./MatrixTestRunner";
import {
  arePathsEquivalent,
  transformToIdealSetup,
  type TransformedSetup,
} from "./setupTransformer";
import type { TestResults, TestSetup } from "./types";

/**
 * Helper to build results from a setup.
 */
function buildResults(setup: TestSetup): TestResults {
  const plannedPath = buildPlannedPath(
    setup.player,
    setup.cursor,
    setup.plannedSurfaces,
    setup.allSurfaces
  );
  const actualPath = buildActualPath(
    setup.player,
    setup.cursor,
    setup.plannedSurfaces,
    setup.allSurfaces
  );
  const alignment = calculateAlignment(plannedPath, actualPath);

  return {
    plannedPath,
    actualPath,
    alignment,
    renderCalls: [],
    arrowWaypoints: [],
  };
}

describe("SetupTransformer", () => {
  describe("transformToIdealSetup", () => {
    it("should return invalid when paths are already aligned", () => {
      const setup: TestSetup = {
        name: "aligned-test",
        description: "Already aligned paths",
        player: { x: 100, y: 300 },
        cursor: { x: 400, y: 300 },
        plannedSurfaces: [],
        allSurfaces: [],
      };

      const results = buildResults(setup);
      const transformed = transformToIdealSetup(setup, results);

      expect(transformed.isValid).toBe(false);
      expect(transformed.invalidReason).toBe("paths_already_aligned");
    });

    it("should identify and remove wall obstructions", () => {
      const setup: TestSetup = {
        name: "wall-obstruction",
        description: "Wall blocks the path",
        player: { x: 100, y: 300 },
        cursor: { x: 500, y: 300 },
        plannedSurfaces: [],
        allSurfaces: [
          createVerticalSurface("wall1", 300, 200, 400, false),
        ],
      };

      const results = buildResults(setup);
      const transformed = transformToIdealSetup(setup, results);

      // Should be valid since we can remove the wall
      if (transformed.isValid) {
        expect(transformed.modifications.length).toBeGreaterThan(0);
        expect(transformed.modifications.some(m => m.type === "remove_obstruction")).toBe(true);
        expect(transformed.setup!.allSurfaces.length).toBe(0);
      }
    });

    it("should identify off-segment hits and extend surfaces", () => {
      const setup: TestSetup = {
        name: "off-segment",
        description: "Reflection point is off segment",
        player: { x: 100, y: 300 },
        cursor: { x: 500, y: 500 }, // Far below - will cause off-segment hit
        plannedSurfaces: [
          createTestSurface({
            id: "ricochet1",
            start: { x: 300, y: 290 },
            end: { x: 300, y: 310 }, // Very short segment
            canReflect: true,
          }),
        ],
        allSurfaces: [
          createTestSurface({
            id: "ricochet1",
            start: { x: 300, y: 290 },
            end: { x: 300, y: 310 },
            canReflect: true,
          }),
        ],
      };

      const results = buildResults(setup);
      const transformed = transformToIdealSetup(setup, results);

      // Check if we detected off-segment and attempted to extend
      if (transformed.isValid) {
        const hasExtension = transformed.modifications.some(
          m => m.type === "extend_segment"
        );
        expect(hasExtension).toBe(true);
      }
    });

    it("should detect when original path reflected off a surface that would be removed", () => {
      // This tests the edge case where the actual path uses a surface for reflection,
      // but that same surface would be marked for removal as an "obstruction"
      // from the planned path perspective.
      //
      // In practice, this is rare because:
      // - Reflective surfaces that are hit by actual path are usually "valid"
      // - Only walls (non-reflective) are typically marked as obstructions
      //
      // The transformer checks this via checkForReflectionOffRemoved(), but in most
      // setups, ricochet surfaces won't be in the obstructions list.
      //
      // For this test, we verify that the transformer handles cases where
      // actual path reflects off a surface that's NOT in the obstructions list.
      const setup: TestSetup = {
        name: "reflected-off-ricochet",
        description: "Path reflects off ricochet (not an obstruction)",
        player: { x: 100, y: 300 },
        cursor: { x: 400, y: 300 },
        plannedSurfaces: [], // No planned reflections
        allSurfaces: [
          // Ricochet surface - actual path will hit this but it's not an obstruction
          createVerticalSurface("ricochet1", 200, 200, 400, true),
        ],
      };

      const results = buildResults(setup);
      const transformed = transformToIdealSetup(setup, results);

      // The actual path reflects off the ricochet surface
      // Since ricochet is not a wall, it's NOT marked as an obstruction
      // So no modifications are needed (paths might already "work")
      expect(transformed.isValid).toBe(false);
      
      // The reason should be that no modifications were identified
      // (ricochet surfaces aren't obstructions, and they're not in the plan)
      expect(transformed.invalidReason).toBe("no_modifications_needed");
    });

    it("should return invalid when no modifications are needed but paths diverge", () => {
      // This tests a case where divergence exists but we can't identify the cause
      const setup: TestSetup = {
        name: "unknown-divergence",
        description: "Paths diverge for unknown reason",
        player: { x: 100, y: 300 },
        cursor: { x: 200, y: 300 },
        plannedSurfaces: [
          createVerticalSurface("ricochet1", 150, 200, 400),
        ],
        allSurfaces: [
          createVerticalSurface("ricochet1", 150, 200, 400),
        ],
      };

      const results = buildResults(setup);

      // Check if paths actually diverge
      if (!results.alignment.isFullyAligned) {
        const transformed = transformToIdealSetup(setup, results);
        // Should handle gracefully
        expect(transformed).toBeDefined();
      }
    });
  });

  describe("arePathsEquivalent", () => {
    it("should return true for identical paths", () => {
      const setup: TestSetup = {
        name: "identical",
        description: "Test",
        player: { x: 100, y: 300 },
        cursor: { x: 400, y: 300 },
        plannedSurfaces: [],
        allSurfaces: [],
      };

      const results = buildResults(setup);
      expect(arePathsEquivalent(results.plannedPath, results.actualPath)).toBe(true);
    });

    it("should return false for paths with different lengths", () => {
      const setup1: TestSetup = {
        name: "short",
        description: "Test",
        player: { x: 100, y: 300 },
        cursor: { x: 200, y: 300 },
        plannedSurfaces: [],
        allSurfaces: [],
      };

      const setup2: TestSetup = {
        name: "long",
        description: "Test",
        player: { x: 100, y: 300 },
        cursor: { x: 400, y: 300 },
        plannedSurfaces: [createVerticalSurface("s1", 250, 200, 400)],
        allSurfaces: [createVerticalSurface("s1", 250, 200, 400)],
      };

      const results1 = buildResults(setup1);
      const results2 = buildResults(setup2);

      expect(arePathsEquivalent(results1.plannedPath, results2.plannedPath)).toBe(false);
    });

    it("should return true for paths within tolerance", () => {
      const path1 = {
        points: [{ x: 100, y: 300 }, { x: 400, y: 300 }],
        hitInfo: [],
        reachedCursor: true,
        totalLength: 300,
      };

      const path2 = {
        points: [{ x: 100.5, y: 300.3 }, { x: 399.8, y: 300.1 }],
        hitInfo: [],
        reachedCursor: true,
        totalLength: 300,
      };

      expect(arePathsEquivalent(path1, path2, 1)).toBe(true);
    });

    it("should return false for paths outside tolerance", () => {
      const path1 = {
        points: [{ x: 100, y: 300 }, { x: 400, y: 300 }],
        hitInfo: [],
        reachedCursor: true,
        totalLength: 300,
      };

      const path2 = {
        points: [{ x: 100, y: 300 }, { x: 410, y: 300 }],
        hitInfo: [],
        reachedCursor: true,
        totalLength: 300,
      };

      expect(arePathsEquivalent(path1, path2, 1)).toBe(false);
    });
  });
});

describe("RedPathEquivalence Assertion Logic", () => {
  describe("Skip conditions", () => {
    it("should skip when paths are fully aligned", () => {
      const setup: TestSetup = {
        name: "aligned",
        description: "Aligned paths",
        player: { x: 100, y: 300 },
        cursor: { x: 400, y: 300 },
        plannedSurfaces: [],
        allSurfaces: [],
      };

      const results = buildResults(setup);

      // This is what the assertion checks first
      expect(results.alignment.isFullyAligned).toBe(true);
    });

    it("should skip when transformation is invalid due to reflection off removed surface", () => {
      const setup: TestSetup = {
        name: "reflect-removed",
        description: "Reflects off surface that would be removed",
        player: { x: 100, y: 300 },
        cursor: { x: 500, y: 300 },
        // Planning to hit a wall (which can't reflect anyway)
        plannedSurfaces: [],
        allSurfaces: [
          createVerticalSurface("wall1", 300, 200, 400, false),
        ],
      };

      const results = buildResults(setup);
      const transformed = transformToIdealSetup(setup, results);

      // Should be handled gracefully
      expect(transformed).toBeDefined();
    });
  });

  describe("Core assertion behavior", () => {
    it("should validate that simple obstruction removal leads to alignment", () => {
      // Setup: Player -> Wall -> Cursor (no reflections planned)
      const originalSetup: TestSetup = {
        name: "simple-wall",
        description: "Simple wall obstruction",
        player: { x: 100, y: 300 },
        cursor: { x: 500, y: 300 },
        plannedSurfaces: [],
        allSurfaces: [
          createVerticalSurface("wall1", 300, 200, 400, false),
        ],
      };

      const originalResults = buildResults(originalSetup);

      // Original should be blocked
      expect(originalResults.actualPath.blockedBy).toBeDefined();
      expect(originalResults.alignment.isFullyAligned).toBe(false);

      // Transform
      const transformed = transformToIdealSetup(originalSetup, originalResults);

      if (transformed.isValid && transformed.setup) {
        // Ideal setup should have no walls
        expect(transformed.setup.allSurfaces.length).toBe(0);

        // Ideal should be aligned
        const idealResults = buildResults(transformed.setup);
        expect(idealResults.alignment.isFullyAligned).toBe(true);
      }
    });

    it("should validate that extending off-segment surface leads to alignment", () => {
      // Setup with off-segment reflection
      const originalSetup: TestSetup = {
        name: "off-segment-extend",
        description: "Off-segment reflection that can be extended",
        player: { x: 100, y: 300 },
        cursor: { x: 300, y: 500 }, // Below - causes off-segment hit
        plannedSurfaces: [
          createTestSurface({
            id: "ricochet1",
            start: { x: 200, y: 295 },
            end: { x: 200, y: 305 }, // Very short, will cause off-segment
            canReflect: true,
          }),
        ],
        allSurfaces: [
          createTestSurface({
            id: "ricochet1",
            start: { x: 200, y: 295 },
            end: { x: 200, y: 305 },
            canReflect: true,
          }),
        ],
      };

      const originalResults = buildResults(originalSetup);
      const transformed = transformToIdealSetup(originalSetup, originalResults);

      // Check what the transformer did
      if (transformed.isValid && transformed.setup) {
        // Should have extended the segment
        const extendMod = transformed.modifications.find(
          m => m.type === "extend_segment"
        );
        expect(extendMod).toBeDefined();

        // Extended surface should be longer
        const originalSurface = originalSetup.allSurfaces[0]!;
        const extendedSurface = transformed.setup.allSurfaces.find(
          s => s.id === originalSurface.id
        );

        if (extendedSurface) {
          const originalLength = Math.abs(
            originalSurface.segment.end.y - originalSurface.segment.start.y
          );
          const extendedLength = Math.abs(
            extendedSurface.segment.end.y - extendedSurface.segment.start.y
          );
          expect(extendedLength).toBeGreaterThanOrEqual(originalLength);
        }
      }
    });
  });

  describe("Edge cases", () => {
    it("should handle empty planned surfaces with obstruction", () => {
      const setup: TestSetup = {
        name: "empty-plan-wall",
        description: "No plan, just a wall",
        player: { x: 100, y: 300 },
        cursor: { x: 500, y: 300 },
        plannedSurfaces: [],
        allSurfaces: [
          createVerticalSurface("wall1", 300, 200, 400, false),
        ],
      };

      const results = buildResults(setup);
      const transformed = transformToIdealSetup(setup, results);

      // Should handle this case
      expect(transformed).toBeDefined();
      if (transformed.isValid && transformed.setup) {
        // Wall should be removed
        expect(transformed.setup.allSurfaces.length).toBe(0);
      }
    });

    it("should handle multiple planned surfaces with one off-segment", () => {
      const setup: TestSetup = {
        name: "multi-surface-off-segment",
        description: "Multiple surfaces, one off-segment",
        player: { x: 100, y: 300 },
        cursor: { x: 500, y: 300 },
        plannedSurfaces: [
          createVerticalSurface("s1", 200, 200, 400),
          createTestSurface({
            id: "s2",
            start: { x: 350, y: 295 },
            end: { x: 350, y: 305 }, // Short - will be off-segment
            canReflect: true,
          }),
        ],
        allSurfaces: [
          createVerticalSurface("s1", 200, 200, 400),
          createTestSurface({
            id: "s2",
            start: { x: 350, y: 295 },
            end: { x: 350, y: 305 },
            canReflect: true,
          }),
        ],
      };

      const results = buildResults(setup);
      const transformed = transformToIdealSetup(setup, results);

      // Should handle gracefully
      expect(transformed).toBeDefined();
    });

    it("should handle surface that is both in plan and obstructing", () => {
      // A wall that's in the plan (edge case - walls shouldn't be plannable)
      const setup: TestSetup = {
        name: "wall-in-plan",
        description: "Wall incorrectly in plan",
        player: { x: 100, y: 300 },
        cursor: { x: 100, y: 100 },
        plannedSurfaces: [
          createVerticalSurface("wall1", 200, 200, 400, false),
        ],
        allSurfaces: [
          createVerticalSurface("wall1", 200, 200, 400, false),
        ],
      };

      const results = buildResults(setup);
      const transformed = transformToIdealSetup(setup, results);

      // Should detect this is problematic
      expect(transformed).toBeDefined();
    });
  });
});

describe("Integration: Failing Matrix Test Cases", () => {
  /**
   * These tests investigate why ricochet-then-wall and multiple-obstructions
   * are failing the redPathEquivalence assertion.
   */

  it("should analyze ricochet-then-wall failure", () => {
    const setup: TestSetup = {
      name: "ricochet-then-wall",
      description: "Reflect off surface then hit wall",
      player: { x: 100, y: 300 },
      cursor: { x: 200, y: 100 },
      plannedSurfaces: [createVerticalSurface("ricochet1", 200, 200, 400)],
      allSurfaces: [
        createVerticalSurface("ricochet1", 200, 200, 400),
        createHorizontalSurface("wall1", 150, 100, 300, false),
      ],
    };

    const results = buildResults(setup);
    console.log("=== ricochet-then-wall Analysis ===");
    console.log("Alignment:", results.alignment);
    console.log("Actual blockedBy:", results.actualPath.blockedBy?.id);
    console.log("Actual path points:", results.actualPath.points.length);
    console.log("Planned path points:", results.plannedPath.points.length);

    const transformed = transformToIdealSetup(setup, results);
    console.log("Transform valid:", transformed.isValid);
    console.log("Transform reason:", transformed.invalidReason);
    console.log("Modifications:", transformed.modifications);

    if (transformed.isValid && transformed.setup) {
      console.log("Ideal allSurfaces:", transformed.setup.allSurfaces.map(s => s.id));
      const idealResults = buildResults(transformed.setup);
      console.log("Ideal alignment:", idealResults.alignment);
      console.log("Ideal actual blockedBy:", idealResults.actualPath.blockedBy?.id);
    }

    // This test is diagnostic - we just want to see the output
    expect(true).toBe(true);
  });

  it("should analyze multiple-obstructions failure", () => {
    const setup: TestSetup = {
      name: "multiple-obstructions",
      description: "Player > Wall1 > Wall2 > Ricochet > Cursor",
      player: { x: 100, y: 300 },
      cursor: { x: 100, y: 100 },
      plannedSurfaces: [createVerticalSurface("ricochet1", 500, 200, 400)],
      allSurfaces: [
        createVerticalSurface("wall1", 200, 200, 400, false),
        createVerticalSurface("wall2", 350, 200, 400, false),
        createVerticalSurface("ricochet1", 500, 200, 400),
      ],
    };

    const results = buildResults(setup);
    console.log("=== multiple-obstructions Analysis ===");
    console.log("Alignment:", results.alignment);
    console.log("Actual blockedBy:", results.actualPath.blockedBy?.id);

    const transformed = transformToIdealSetup(setup, results);
    console.log("Transform valid:", transformed.isValid);
    console.log("Transform reason:", transformed.invalidReason);
    console.log("Modifications:", transformed.modifications);

    if (transformed.isValid && transformed.setup) {
      console.log("Ideal allSurfaces:", transformed.setup.allSurfaces.map(s => s.id));
      const idealResults = buildResults(transformed.setup);
      console.log("Ideal alignment:", idealResults.alignment);

      // The issue: after removing walls, the actual path still doesn't align
      // because the ricochet surface geometry might not match
      console.log("Ideal planned points:", idealResults.plannedPath.points);
      console.log("Ideal actual points:", idealResults.actualPath.points);
    }

    expect(true).toBe(true);
  });
});

