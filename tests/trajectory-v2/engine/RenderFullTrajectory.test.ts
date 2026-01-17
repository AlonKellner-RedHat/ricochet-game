/**
 * Tests for renderFullTrajectory - renders FullTrajectoryResult into segments.
 *
 * This function takes the 4 sections from FullTrajectoryResult and converts
 * them to RenderSegments with appropriate colors and styles:
 * - merged: GREEN (solid before cursor, dashed after)
 * - physicalDivergent: YELLOW dashed
 * - plannedToCursor: RED solid
 * - physicalFromCursor: RED dashed
 */

import { describe, it, expect } from "vitest";
import {
  renderFullTrajectory,
  type RenderSegment,
} from "@/trajectory-v2/engine/DualPathRenderer";
import type { FullTrajectoryResult } from "@/trajectory-v2/engine/FullTrajectoryCalculator";
import type { TraceSegment } from "@/trajectory-v2/engine/TracePath";
import type { Vector2 } from "@/types";

// Helper to create a minimal TraceSegment
function createSegment(
  start: Vector2,
  end: Vector2,
  surface: { id: string } | null = null
): TraceSegment {
  return {
    start,
    end,
    surface: surface as any,
    onSegment: true,
    canReflect: true,
  };
}

describe("renderFullTrajectory", () => {
  describe("fully aligned path", () => {
    it("should render merged as solid green before cursor", () => {
      const trajectory: FullTrajectoryResult = {
        merged: [
          createSegment({ x: 100, y: 200 }, { x: 200, y: 200 }),
          createSegment({ x: 200, y: 200 }, { x: 300, y: 200 }),
        ],
        physicalDivergent: [],
        plannedToCursor: [],
        physicalFromCursor: [],
        divergencePoint: null,
        isFullyAligned: true,
      };

      const cursor: Vector2 = { x: 300, y: 200 };
      const result = renderFullTrajectory(trajectory, cursor);

      // All merged segments before cursor should be solid green
      const solidGreen = result.filter(s => s.style === "solid" && s.color === "green");
      expect(solidGreen.length).toBeGreaterThanOrEqual(1);
    });

    it("should render merged as dashed yellow after cursor", () => {
      // Cursor in the middle, with path continuing beyond
      const trajectory: FullTrajectoryResult = {
        merged: [
          createSegment({ x: 100, y: 200 }, { x: 200, y: 200 }),
          createSegment({ x: 200, y: 200 }, { x: 400, y: 200 }),
        ],
        physicalDivergent: [],
        plannedToCursor: [],
        physicalFromCursor: [],
        divergencePoint: null,
        isFullyAligned: true,
      };

      const cursor: Vector2 = { x: 250, y: 200 }; // Cursor in middle of second segment
      const result = renderFullTrajectory(trajectory, cursor);

      // Should have dashed yellow after cursor
      const dashedYellow = result.filter(s => s.style === "dashed" && s.color === "yellow");
      expect(dashedYellow.length).toBeGreaterThan(0);
    });
  });

  describe("diverged path", () => {
    it("should render physicalDivergent as dashed yellow", () => {
      const trajectory: FullTrajectoryResult = {
        merged: [
          createSegment({ x: 100, y: 200 }, { x: 150, y: 200 }),
        ],
        physicalDivergent: [
          createSegment({ x: 150, y: 200 }, { x: 200, y: 300 }),
        ],
        plannedToCursor: [
          createSegment({ x: 150, y: 200 }, { x: 300, y: 200 }),
        ],
        physicalFromCursor: [],
        divergencePoint: { x: 150, y: 200 },
        isFullyAligned: false,
      };

      const cursor: Vector2 = { x: 300, y: 200 };
      const result = renderFullTrajectory(trajectory, cursor);

      // physicalDivergent should be dashed yellow
      const dashedYellow = result.filter(s => s.style === "dashed" && s.color === "yellow");
      expect(dashedYellow.length).toBeGreaterThan(0);
    });

    it("should render plannedToCursor as solid red", () => {
      const trajectory: FullTrajectoryResult = {
        merged: [
          createSegment({ x: 100, y: 200 }, { x: 150, y: 200 }),
        ],
        physicalDivergent: [],
        plannedToCursor: [
          createSegment({ x: 150, y: 200 }, { x: 300, y: 200 }),
        ],
        physicalFromCursor: [],
        divergencePoint: { x: 150, y: 200 },
        isFullyAligned: false,
      };

      const cursor: Vector2 = { x: 300, y: 200 };
      const result = renderFullTrajectory(trajectory, cursor);

      // plannedToCursor should be solid red
      const solidRed = result.filter(s => s.style === "solid" && s.color === "red");
      expect(solidRed.length).toBeGreaterThan(0);
    });

    it("should render physicalFromCursor as dashed red", () => {
      const trajectory: FullTrajectoryResult = {
        merged: [
          createSegment({ x: 100, y: 200 }, { x: 150, y: 200 }),
        ],
        physicalDivergent: [],
        plannedToCursor: [
          createSegment({ x: 150, y: 200 }, { x: 300, y: 200 }),
        ],
        physicalFromCursor: [
          createSegment({ x: 300, y: 200 }, { x: 500, y: 200 }),
        ],
        divergencePoint: { x: 150, y: 200 },
        isFullyAligned: false,
      };

      const cursor: Vector2 = { x: 300, y: 200 };
      const result = renderFullTrajectory(trajectory, cursor);

      // physicalFromCursor should be dashed red
      const dashedRed = result.filter(s => s.style === "dashed" && s.color === "red");
      expect(dashedRed.length).toBeGreaterThan(0);
    });
  });

  describe("empty plan with obstruction", () => {
    it("should have green merged to obstruction", () => {
      const trajectory: FullTrajectoryResult = {
        merged: [
          createSegment({ x: 100, y: 200 }, { x: 150, y: 200 }),
        ],
        physicalDivergent: [],
        plannedToCursor: [
          createSegment({ x: 150, y: 200 }, { x: 300, y: 200 }),
        ],
        physicalFromCursor: [
          createSegment({ x: 300, y: 200 }, { x: 500, y: 200 }),
        ],
        divergencePoint: { x: 150, y: 200 },
        isFullyAligned: false,
      };

      const cursor: Vector2 = { x: 300, y: 200 };
      const result = renderFullTrajectory(trajectory, cursor);

      // First segment should be green (merged)
      const greenSegments = result.filter(s => s.color === "green");
      expect(greenSegments.length).toBe(1);
      expect(greenSegments[0]!.start.x).toBe(100);
      expect(greenSegments[0]!.end.x).toBe(150);
    });

    it("should have red solid to cursor", () => {
      const trajectory: FullTrajectoryResult = {
        merged: [
          createSegment({ x: 100, y: 200 }, { x: 150, y: 200 }),
        ],
        physicalDivergent: [],
        plannedToCursor: [
          createSegment({ x: 150, y: 200 }, { x: 300, y: 200 }),
        ],
        physicalFromCursor: [],
        divergencePoint: { x: 150, y: 200 },
        isFullyAligned: false,
      };

      const cursor: Vector2 = { x: 300, y: 200 };
      const result = renderFullTrajectory(trajectory, cursor);

      const solidRed = result.filter(s => s.style === "solid" && s.color === "red");
      expect(solidRed.length).toBe(1);
      expect(solidRed[0]!.start.x).toBe(150);
      expect(solidRed[0]!.end.x).toBe(300);
    });
  });

  describe("aligned path with continuation - no red", () => {
    it("should render solid green before cursor, dashed yellow after, no red", () => {
      // This is the aligned case: cursor reached without divergence
      // Physical continuation after cursor should be yellow, not red
      const trajectory: FullTrajectoryResult = {
        merged: [
          createSegment({ x: 100, y: 500 }, { x: 200, y: 500 }), // player to cursor
          createSegment({ x: 200, y: 500 }, { x: 300, y: 500 }), // cursor to wall
        ],
        physicalDivergent: [],
        plannedToCursor: [],
        physicalFromCursor: [],
        divergencePoint: null,
        isFullyAligned: true,
      };

      const cursor: Vector2 = { x: 200, y: 500 };
      const result = renderFullTrajectory(trajectory, cursor);

      // Before cursor: solid green
      const solidGreen = result.filter(s => s.style === "solid" && s.color === "green");
      expect(solidGreen.length).toBeGreaterThan(0);
      expect(solidGreen[0]!.end.x).toBeCloseTo(200); // ends at cursor

      // After cursor: dashed yellow
      const dashedYellow = result.filter(s => s.style === "dashed" && s.color === "yellow");
      expect(dashedYellow.length).toBeGreaterThan(0);
      expect(dashedYellow[0]!.start.x).toBeCloseTo(200); // starts at cursor

      // NO red at all when aligned
      const redSegments = result.filter(s => s.color === "red");
      expect(redSegments.length).toBe(0);
    });

    it("should split cursor segment correctly", () => {
      // Cursor is in the MIDDLE of a segment
      const trajectory: FullTrajectoryResult = {
        merged: [
          createSegment({ x: 100, y: 500 }, { x: 300, y: 500 }), // player through cursor to wall
        ],
        physicalDivergent: [],
        plannedToCursor: [],
        physicalFromCursor: [],
        divergencePoint: null,
        isFullyAligned: true,
      };

      const cursor: Vector2 = { x: 200, y: 500 }; // middle of segment
      const result = renderFullTrajectory(trajectory, cursor);

      // Should split into: solid green (100->200) and dashed yellow (200->300)
      expect(result.length).toBe(2);
      
      expect(result[0]).toMatchObject({
        start: { x: 100, y: 500 },
        end: { x: 200, y: 500 },
        style: "solid",
        color: "green",
      });
      
      expect(result[1]).toMatchObject({
        start: { x: 200, y: 500 },
        end: { x: 300, y: 500 },
        style: "dashed",
        color: "yellow",
      });
    });
  });

  describe("segment ordering", () => {
    it("should produce segments in correct order for rendering", () => {
      const trajectory: FullTrajectoryResult = {
        merged: [
          createSegment({ x: 100, y: 200 }, { x: 150, y: 200 }),
        ],
        physicalDivergent: [
          createSegment({ x: 150, y: 200 }, { x: 100, y: 300 }),
        ],
        plannedToCursor: [
          createSegment({ x: 150, y: 200 }, { x: 300, y: 200 }),
        ],
        physicalFromCursor: [
          createSegment({ x: 300, y: 200 }, { x: 500, y: 200 }),
        ],
        divergencePoint: { x: 150, y: 200 },
        isFullyAligned: false,
      };

      const cursor: Vector2 = { x: 300, y: 200 };
      const result = renderFullTrajectory(trajectory, cursor);

      // Should have segments for: merged, physicalDivergent, plannedToCursor, physicalFromCursor
      expect(result.length).toBeGreaterThanOrEqual(4);

      // Check colors are present
      const colors = new Set(result.map(s => s.color));
      expect(colors.has("green")).toBe(true);
      expect(colors.has("yellow")).toBe(true);
      expect(colors.has("red")).toBe(true);
    });
  });
});
