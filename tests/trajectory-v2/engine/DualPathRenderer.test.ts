/**
 * Tests for DualPathRenderer - TDD First
 *
 * FIRST PRINCIPLES (from principles-audit.md):
 * - C1: Green = aligned portion
 * - C2: Red = planned divergence
 * - C3: Yellow = actual continuation
 * - C4: Solid = before cursor
 * - C5: Dashed = after cursor
 * - C6: Red only when discrepancy exists
 *
 * DESIGN PRINCIPLE: Rendering is trivial once you have two independent paths.
 * Color is a pure function of (segmentIndex, divergenceIndex, cursorIndex, pathType).
 */

import { describe, it, expect } from "vitest";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import {
  renderDualPath,
  type RenderablePath,
  type DivergenceForRender,
  type RenderSegment,
} from "@/trajectory-v2/engine/DualPathRenderer";

// Type aliases
type ActualPath = RenderablePath;
type PlannedPath = RenderablePath;
type DivergenceInfo = DivergenceForRender;

describe("DualPathRenderer", () => {
  describe("Aligned Path (no divergence)", () => {
    it("C1: should render all segments as green", () => {
      const actual: ActualPath = {
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 200, y: 0 },
        ],
        cursorIndex: 1,
        cursorT: 1,
      };

      const planned: PlannedPath = {
        waypoints: actual.waypoints,
        cursorIndex: 1,
        cursorT: 1,
      };

      const divergence: DivergenceInfo = {
        segmentIndex: -1,
        point: null,
        isAligned: true,
      };

      const cursor = { x: 200, y: 0 };
      const segments = renderDualPath(actual, planned, divergence, cursor);

      // All segments should be green (aligned)
      const greenSegments = segments.filter(s => s.color === "green");
      const redSegments = segments.filter(s => s.color === "red");

      expect(redSegments.length).toBe(0); // No red when aligned
      expect(greenSegments.length).toBeGreaterThan(0);
    });

    it("C5: should render segments after cursor as dashed yellow", () => {
      const actual: ActualPath = {
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 200, y: 0 },
          { x: 300, y: 0 },
        ],
        cursorIndex: 1, // Cursor at end of segment 1 (x=100 to x=200)
        cursorT: 0.5,   // Cursor in middle of segment
      };

      const planned: PlannedPath = {
        waypoints: actual.waypoints,
        cursorIndex: 1,
        cursorT: 0.5,
      };

      const divergence: DivergenceInfo = {
        segmentIndex: -1,
        point: null,
        isAligned: true,
      };

      const cursor = { x: 150, y: 0 };
      const segments = renderDualPath(actual, planned, divergence, cursor);

      // Should have dashed yellow segments after cursor
      const dashedYellow = segments.filter(s => s.style === "dashed" && s.color === "yellow");
      expect(dashedYellow.length).toBeGreaterThan(0);
    });
  });

  describe("Diverged Path", () => {
    it("C1: should render before divergence as green", () => {
      const actual: ActualPath = {
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 150, y: 50 }, // Diverges
        ],
        cursorIndex: -1, // Cursor not on actual path
        cursorT: 0,
      };

      const planned: PlannedPath = {
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 200, y: 0 },
        ],
        cursorIndex: 1,
        cursorT: 1,
      };

      const divergence: DivergenceInfo = {
        segmentIndex: 2,
        point: { x: 100, y: 0 },
        isAligned: false,
      };

      const cursor = { x: 200, y: 0 };
      const segments = renderDualPath(actual, planned, divergence, cursor);

      // First segment should be green (before divergence)
      const firstGreen = segments.find(s => s.color === "green");
      expect(firstGreen).toBeDefined();
      expect(firstGreen!.start).toEqual({ x: 0, y: 0 });
    });

    it("C2: should render planned after divergence as red", () => {
      const actual: ActualPath = {
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 150, y: 50 },
        ],
        cursorIndex: -1,
        cursorT: 0,
      };

      const planned: PlannedPath = {
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 200, y: 0 },
        ],
        cursorIndex: 1,
        cursorT: 1,
      };

      const divergence: DivergenceInfo = {
        segmentIndex: 2,
        point: { x: 100, y: 0 },
        isAligned: false,
      };

      const cursor = { x: 200, y: 0 };
      const segments = renderDualPath(actual, planned, divergence, cursor);

      // Should have red segments (planned path after divergence)
      const redSegments = segments.filter(s => s.color === "red");
      expect(redSegments.length).toBeGreaterThan(0);
    });

    it("C3: should render actual after divergence as yellow", () => {
      const actual: ActualPath = {
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 150, y: 50 },
        ],
        cursorIndex: -1,
        cursorT: 0,
      };

      const planned: PlannedPath = {
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 200, y: 0 },
        ],
        cursorIndex: 1,
        cursorT: 1,
      };

      const divergence: DivergenceInfo = {
        segmentIndex: 2,
        point: { x: 100, y: 0 },
        isAligned: false,
      };

      const cursor = { x: 200, y: 0 };
      const segments = renderDualPath(actual, planned, divergence, cursor);

      // Should have yellow segments (actual path after divergence)
      const yellowSegments = segments.filter(s => s.color === "yellow");
      expect(yellowSegments.length).toBeGreaterThan(0);
    });

    it("C6: no red when isAligned=true", () => {
      const actual: ActualPath = {
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
        ],
        cursorIndex: 0,
        cursorT: 1,
      };

      const planned: PlannedPath = {
        waypoints: actual.waypoints,
        cursorIndex: 0,
        cursorT: 1,
      };

      const divergence: DivergenceInfo = {
        segmentIndex: -1,
        point: null,
        isAligned: true,
      };

      const cursor = { x: 100, y: 0 };
      const segments = renderDualPath(actual, planned, divergence, cursor);

      const redSegments = segments.filter(s => s.color === "red");
      expect(redSegments.length).toBe(0);
    });
  });

  describe("Cursor Splitting", () => {
    it("should split segment at cursor position", () => {
      const actual: ActualPath = {
        waypoints: [
          { x: 0, y: 0 },
          { x: 200, y: 0 },
        ],
        cursorIndex: 0,
        cursorT: 0.5, // Cursor at middle of segment
      };

      const planned: PlannedPath = {
        waypoints: actual.waypoints,
        cursorIndex: 0,
        cursorT: 0.5,
      };

      const divergence: DivergenceInfo = {
        segmentIndex: -1,
        point: null,
        isAligned: true,
      };

      const cursor = { x: 100, y: 0 };
      const segments = renderDualPath(actual, planned, divergence, cursor);

      // Should have at least 2 segments: before cursor and after
      expect(segments.length).toBeGreaterThanOrEqual(2);

      // First segment should be solid green ending at cursor
      const solidGreen = segments.find(s => s.style === "solid" && s.color === "green");
      expect(solidGreen).toBeDefined();
      expect(solidGreen!.end).toEqual(cursor);
    });

    it("should handle cursor at segment start", () => {
      const actual: ActualPath = {
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 200, y: 0 },
        ],
        cursorIndex: 0,
        cursorT: 0, // Cursor at start of first segment
      };

      const planned: PlannedPath = {
        waypoints: actual.waypoints,
        cursorIndex: 0,
        cursorT: 0,
      };

      const divergence: DivergenceInfo = {
        segmentIndex: -1,
        point: null,
        isAligned: true,
      };

      const cursor = { x: 0, y: 0 };
      const segments = renderDualPath(actual, planned, divergence, cursor);

      // All segments should be dashed (after cursor)
      const solidSegments = segments.filter(s => s.style === "solid");
      // May have zero-length solid segment at start, or none
      expect(solidSegments.length).toBeLessThanOrEqual(1);
    });

    it("should handle cursor at segment end", () => {
      const actual: ActualPath = {
        waypoints: [
          { x: 0, y: 0 },
          { x: 100, y: 0 },
          { x: 200, y: 0 },
        ],
        cursorIndex: 1,
        cursorT: 1, // Cursor at end of segment 1
      };

      const planned: PlannedPath = {
        waypoints: actual.waypoints,
        cursorIndex: 1,
        cursorT: 1,
      };

      const divergence: DivergenceInfo = {
        segmentIndex: -1,
        point: null,
        isAligned: true,
      };

      const cursor = { x: 200, y: 0 };
      const segments = renderDualPath(actual, planned, divergence, cursor);

      // Should have solid segments before cursor
      const solidSegments = segments.filter(s => s.style === "solid");
      expect(solidSegments.length).toBeGreaterThan(0);
    });
  });

  describe("Edge Cases", () => {
    it("should handle empty paths", () => {
      const actual: ActualPath = {
        waypoints: [],
        cursorIndex: -1,
        cursorT: 0,
      };

      const planned: PlannedPath = {
        waypoints: [],
        cursorIndex: -1,
        cursorT: 0,
      };

      const divergence: DivergenceInfo = {
        segmentIndex: -1,
        point: null,
        isAligned: true,
      };

      const cursor = { x: 0, y: 0 };
      const segments = renderDualPath(actual, planned, divergence, cursor);

      expect(segments.length).toBe(0);
    });

    it("should handle single-waypoint path", () => {
      const actual: ActualPath = {
        waypoints: [{ x: 100, y: 100 }],
        cursorIndex: -1,
        cursorT: 0,
      };

      const planned: PlannedPath = {
        waypoints: [{ x: 100, y: 100 }],
        cursorIndex: -1,
        cursorT: 0,
      };

      const divergence: DivergenceInfo = {
        segmentIndex: -1,
        point: null,
        isAligned: true,
      };

      const cursor = { x: 100, y: 100 };
      const segments = renderDualPath(actual, planned, divergence, cursor);

      // No segments (need at least 2 waypoints for a segment)
      expect(segments.length).toBe(0);
    });
  });
});

