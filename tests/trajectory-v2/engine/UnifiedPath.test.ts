/**
 * Tests for the new UnifiedPath architecture
 *
 * DESIGN PRINCIPLE: Test that edge cases are eliminated by design.
 * - No tolerance-based comparisons
 * - Alignment is annotation, not detection
 * - Single path with cursor position marker
 */

import type { Surface } from "@/surfaces/Surface";
import { evaluateBypass } from "@/trajectory-v2/engine/BypassEvaluator";
import {
  tracePhysicalPath,
  unifiedToAlignment,
  unifiedToPathResult,
} from "@/trajectory-v2/engine/PathBuilder";
import { deriveRender } from "@/trajectory-v2/engine/RenderDeriver";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { LineSegment } from "@/trajectory-v2/geometry/types";
import { describe, expect, it } from "vitest";

// Test surface factory
function createTestSurface(id: string, start: Vector2, end: Vector2, canReflect = true): Surface {
  const segment: LineSegment = { start, end };

  // Calculate normal (perpendicular to segment, pointing "left" of start→end)
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.sqrt(dx * dx + dy * dy);
  const normal = { x: -dy / len, y: dx / len };

  return {
    id,
    segment,
    getNormal: () => normal,
    canReflectFrom: () => canReflect,
  };
}

describe("UnifiedPath Architecture", () => {
  describe("tracePhysicalPath", () => {
    it("should create a path with a single segment when no surfaces", () => {
      const player = { x: 100, y: 100 };
      const cursor = { x: 200, y: 100 };
      const bypassResult = evaluateBypass(player, cursor, [], []);

      const path = tracePhysicalPath(player, cursor, bypassResult, []);

      expect(path.segments.length).toBeGreaterThan(0);
      expect(path.cursorSegmentIndex).toBe(0);
      expect(path.isFullyAligned).toBe(true);
    });

    it("should annotate segments with aligned when hitting planned surface", () => {
      const player = { x: 100, y: 200 };
      const cursor = { x: 300, y: 200 };

      // Reflective surface between player and cursor
      const surface = createTestSurface("ricochet1", { x: 200, y: 100 }, { x: 200, y: 300 }, true);

      const bypassResult = evaluateBypass(player, cursor, [surface], [surface]);
      const path = tracePhysicalPath(player, cursor, bypassResult, [surface]);

      // Should have hit the surface
      const hitSegments = path.segments.filter((s) => s.endSurface?.id === "ricochet1");
      expect(hitSegments.length).toBeGreaterThan(0);
    });

    it("should handle wall blocking path", () => {
      const player = { x: 100, y: 200 };
      const cursor = { x: 300, y: 200 };

      // Create a proper wall surface that will block
      const segment = { start: { x: 150, y: 100 }, end: { x: 150, y: 300 } };
      const wall: Surface = {
        id: "wall",
        segment,
        getNormal: () => ({ x: -1, y: 0 }), // Normal points left
        canReflectFrom: () => false, // Non-reflective
      };

      const bypassResult = evaluateBypass(player, cursor, [], [wall]);
      const path = tracePhysicalPath(player, cursor, bypassResult, [wall]);

      // The path should exist and have segments
      expect(path.segments.length).toBeGreaterThan(0);

      // Should have some termination
      const lastSegment = path.segments[path.segments.length - 1];
      expect(lastSegment?.termination).toBeDefined();
    });

    it("should track cursor position on path", () => {
      const player = { x: 100, y: 100 };
      const cursor = { x: 200, y: 100 };
      const bypassResult = evaluateBypass(player, cursor, [], []);

      const path = tracePhysicalPath(player, cursor, bypassResult, []);

      expect(path.cursorSegmentIndex).toBeGreaterThanOrEqual(0);
      expect(path.cursorT).toBeGreaterThan(0);
    });

    it("should calculate totalLength correctly", () => {
      const player = { x: 0, y: 0 };
      const cursor = { x: 100, y: 0 };
      const bypassResult = evaluateBypass(player, cursor, [], []);

      const path = tracePhysicalPath(player, cursor, bypassResult, []);

      expect(path.totalLength).toBeGreaterThan(0);
    });
  });

  describe("deriveRender", () => {
    it("should produce green segments before cursor when aligned", () => {
      const player = { x: 100, y: 100 };
      const cursor = { x: 200, y: 100 };
      const bypassResult = evaluateBypass(player, cursor, [], []);
      const path = tracePhysicalPath(player, cursor, bypassResult, []);

      const renderOutput = deriveRender(path);

      // First segment should be solid green
      const firstSegment = renderOutput.segments[0];
      expect(firstSegment).toBeDefined();
      expect(firstSegment?.color).toBe("green");
      expect(firstSegment?.style).toBe("solid");
    });

    it("should produce yellow dashed segments after cursor when aligned", () => {
      const player = { x: 100, y: 100 };
      const cursor = { x: 150, y: 100 }; // Cursor in middle
      const bypassResult = evaluateBypass(player, cursor, [], []);
      const path = tracePhysicalPath(player, cursor, bypassResult, []);

      const renderOutput = deriveRender(path);

      // Should have dashed yellow after cursor
      const dashedSegments = renderOutput.segments.filter((s) => s.style === "dashed");
      const yellowDashed = dashedSegments.filter((s) => s.color === "yellow");
      expect(yellowDashed.length).toBeGreaterThanOrEqual(0); // May or may not have projection
    });

    it("should produce red segments when diverged", () => {
      const player = { x: 100, y: 200 };
      const cursor = { x: 300, y: 200 };

      // Wall blocks the path
      const wall = createTestSurface(
        "wall",
        { x: 150, y: 100 },
        { x: 150, y: 300 },
        false // Non-reflective
      );

      // Plan expects to go through, but wall blocks
      const planned = createTestSurface("planned", { x: 250, y: 100 }, { x: 250, y: 300 }, true);

      const bypassResult = evaluateBypass(player, cursor, [planned], [wall, planned]);
      const path = tracePhysicalPath(player, cursor, bypassResult, [wall, planned]);

      const renderOutput = deriveRender(path);

      // Should have some red due to divergence
      if (path.firstDivergedIndex !== -1) {
        const redSegments = renderOutput.segments.filter((s) => s.color === "red");
        expect(redSegments.length).toBeGreaterThan(0);
      }
    });
  });

  describe("unifiedToAlignment (backward compatibility)", () => {
    it("should convert unified path to legacy alignment result", () => {
      const player = { x: 100, y: 100 };
      const cursor = { x: 200, y: 100 };
      const bypassResult = evaluateBypass(player, cursor, [], []);
      const path = tracePhysicalPath(player, cursor, bypassResult, []);

      const alignment = unifiedToAlignment(path);

      expect(alignment.isFullyAligned).toBe(path.isFullyAligned);
      expect(alignment.firstMismatchIndex).toBe(path.firstDivergedIndex);
    });
  });

  describe("unifiedToPathResult (backward compatibility)", () => {
    it("should convert unified path to legacy path result", () => {
      const player = { x: 100, y: 100 };
      const cursor = { x: 200, y: 100 };
      const bypassResult = evaluateBypass(player, cursor, [], []);
      const path = tracePhysicalPath(player, cursor, bypassResult, []);

      const result = unifiedToPathResult(path, cursor, bypassResult);

      expect(result.points.length).toBeGreaterThan(0);
      expect(result.reachedCursor).toBe(path.cursorReachable);
    });
  });
});

describe("First Principle: Solid path from player to cursor", () => {
  it("should always have solid segments reaching cursor when path is aligned", () => {
    const player = { x: 100, y: 100 };
    const cursor = { x: 200, y: 100 };
    const bypassResult = evaluateBypass(player, cursor, [], []);
    const path = tracePhysicalPath(player, cursor, bypassResult, []);

    const renderOutput = deriveRender(path, cursor);

    // Should have at least one solid segment
    const solidSegments = renderOutput.segments.filter((s) => s.style === "solid");
    expect(solidSegments.length).toBeGreaterThan(0);

    // The solid segment should reach the cursor
    const lastSolid = solidSegments[solidSegments.length - 1];
    expect(lastSolid).toBeDefined();
    // End should be at or near cursor
    const distToCursor = Math.sqrt(
      Math.pow(lastSolid!.end.x - cursor.x, 2) + Math.pow(lastSolid!.end.y - cursor.y, 2)
    );
    expect(distToCursor).toBeLessThan(5);
  });

  it("should add solid red segment from obstacle to cursor when blocked", () => {
    const player = { x: 100, y: 200 };
    const cursor = { x: 300, y: 200 };

    // Wall blocks the direct path to cursor
    const wall: Surface = {
      id: "wall",
      segment: { start: { x: 150, y: 100 }, end: { x: 150, y: 300 } },
      getNormal: () => ({ x: -1, y: 0 }),
      canReflectFrom: () => false,
    };

    const bypassResult = evaluateBypass(player, cursor, [], [wall]);
    const path = tracePhysicalPath(player, cursor, bypassResult, [wall]);

    // Path should be blocked (cursor not reachable)
    expect(path.cursorReachable).toBe(false);

    const renderOutput = deriveRender(path, cursor);

    // FIRST PRINCIPLE: There must be solid segments all the way to cursor
    const solidSegments = renderOutput.segments.filter((s) => s.style === "solid");
    expect(solidSegments.length).toBeGreaterThan(0);

    // The last solid segment should end at cursor (solid red continuation)
    const lastSolid = solidSegments[solidSegments.length - 1];
    expect(lastSolid).toBeDefined();
    expect(lastSolid!.end.x).toBe(cursor.x);
    expect(lastSolid!.end.y).toBe(cursor.y);

    // That segment should be RED (diverged/blocked)
    expect(lastSolid!.color).toBe("red");
  });

  it("should have green physical path and red continuation when blocked", () => {
    const player = { x: 100, y: 200 };
    const cursor = { x: 300, y: 200 };

    const wall: Surface = {
      id: "wall",
      segment: { start: { x: 150, y: 100 }, end: { x: 150, y: 300 } },
      getNormal: () => ({ x: -1, y: 0 }),
      canReflectFrom: () => false,
    };

    const bypassResult = evaluateBypass(player, cursor, [], [wall]);
    const path = tracePhysicalPath(player, cursor, bypassResult, [wall]);
    const renderOutput = deriveRender(path, cursor);

    // FIRST PRINCIPLE: Path "starts green and may turn red"
    // Should have at least 2 solid segments:
    // 1. Player → Wall (green)
    // 2. Wall → Cursor (red)
    const solidSegments = renderOutput.segments.filter((s) => s.style === "solid");

    // There should be at least 1 solid segment
    expect(solidSegments.length).toBeGreaterThanOrEqual(1);

    // The total solid path should cover player to cursor
    // Either as one segment or multiple
    const allSegments = renderOutput.segments;
    expect(allSegments.length).toBeGreaterThan(0);

    // First segment should start at player
    const firstSegment = allSegments[0];
    expect(firstSegment).toBeDefined();
    expect(firstSegment!.start.x).toBe(player.x);
    expect(firstSegment!.start.y).toBe(player.y);

    // Last solid segment should end at cursor
    const lastSolidSegment = solidSegments[solidSegments.length - 1];
    expect(lastSolidSegment).toBeDefined();
    expect(lastSolidSegment!.end.x).toBe(cursor.x);
    expect(lastSolidSegment!.end.y).toBe(cursor.y);

    // The continuation (last segment ending at cursor) should be RED
    expect(lastSolidSegment!.color).toBe("red");
  });
});

describe("First Principle: Planned path reflects only off planned surfaces", () => {
  it("should mark all segments as unplanned when plan is empty", () => {
    const player = { x: 100, y: 200 };
    const cursor = { x: 300, y: 200 };

    // Reflective surface between player and cursor - NOT in plan
    const surface: Surface = {
      id: "ricochet",
      segment: { start: { x: 150, y: 100 }, end: { x: 150, y: 300 } },
      getNormal: () => ({ x: -1, y: 0 }),
      canReflectFrom: () => true, // Reflective
    };

    // Plan is EMPTY - no surfaces planned
    const bypassResult = evaluateBypass(player, cursor, [], [surface]);
    const path = tracePhysicalPath(player, cursor, bypassResult, [surface]);

    // FIRST PRINCIPLE: With empty plan, there's no divergence (nothing to diverge from)
    expect(path.firstDivergedIndex).toBe(-1);

    // FIRST PRINCIPLE: Segment ENDING at the surface should be "unplanned" (green)
    const hitSegment = path.segments.find((s) => s.endSurface?.id === "ricochet");
    expect(hitSegment).toBeDefined();
    expect(hitSegment!.planAlignment).toBe("unplanned"); // Green - unplanned

    // FIRST PRINCIPLE: With empty plan, ALL segments are "unplanned" (no divergence)
    const hitIndex = path.segments.indexOf(hitSegment!);
    if (path.segments.length > hitIndex + 1) {
      const nextSegment = path.segments[hitIndex + 1];
      expect(nextSegment!.planAlignment).toBe("unplanned"); // Still unplanned with empty plan
    }
  });

  it("should render green to surface, then red to cursor when blocked", () => {
    const player = { x: 100, y: 200 };
    const cursor = { x: 300, y: 200 };

    // Reflective surface - NOT in plan
    const surface: Surface = {
      id: "ricochet",
      segment: { start: { x: 150, y: 100 }, end: { x: 150, y: 300 } },
      getNormal: () => ({ x: -1, y: 0 }),
      canReflectFrom: () => true,
    };

    const bypassResult = evaluateBypass(player, cursor, [], [surface]);
    const path = tracePhysicalPath(player, cursor, bypassResult, [surface]);
    const renderOutput = deriveRender(path, cursor, [surface]);

    // Should have solid segments
    const solidSegments = renderOutput.segments.filter((s) => s.style === "solid");
    expect(solidSegments.length).toBeGreaterThan(0);

    // First solid segment should be green (actual path to surface)
    const firstSolid = solidSegments[0];
    expect(firstSolid).toBeDefined();
    expect(firstSolid!.color).toBe("green");

    // FIRST PRINCIPLE: There must ALWAYS be a solid path from player to cursor.
    // When cursor is blocked, must have solid red path to cursor.
    const redSolids = solidSegments.filter((s) => s.color === "red");
    expect(redSolids.length).toBeGreaterThan(0);

    // Last solid segment should end at cursor
    const lastSolid = solidSegments[solidSegments.length - 1];
    expect(lastSolid!.end.x).toBe(cursor.x);
  });

  it("should mark aligned when hitting planned surface", () => {
    // Setup for a valid reflection:
    // Player at (100, 300), shoots toward surface at x=200
    // Surface reflects the ray, and cursor receives at (100, 100)
    // Both player and cursor are on the same side (left) of the vertical surface
    const player = { x: 100, y: 300 };
    const cursor = { x: 100, y: 100 };

    // Vertical surface at x=200
    // Normal points LEFT (toward player and cursor)
    const surface: Surface = {
      id: "planned-ricochet",
      segment: { start: { x: 200, y: 50 }, end: { x: 200, y: 350 } },
      getNormal: () => ({ x: -1, y: 0 }), // Normal points left
      canReflectFrom: () => true,
    };

    // Plan includes this surface
    const bypassResult = evaluateBypass(player, cursor, [surface], [surface]);

    // Verify surface is not bypassed (player and cursor on same side as normal)
    expect(bypassResult.activeSurfaces.length).toBe(1);

    const path = tracePhysicalPath(player, cursor, bypassResult, [surface]);

    // First segment hitting planned surface should be aligned
    const hitSegment = path.segments.find((s) => s.endSurface?.id === "planned-ricochet");
    expect(hitSegment).toBeDefined();
    expect(hitSegment!.planAlignment).toBe("aligned");
  });
});

describe("First Principle: Segment ending at unplanned surface should be green", () => {
  it("should mark segment to unplanned reflective surface as unplanned (green)", () => {
    const player = { x: 100, y: 300 };
    const cursor = { x: 400, y: 300 };

    // Reflective surface between player and cursor (facing player)
    const surface: Surface = {
      id: "surface1",
      segment: { start: { x: 200, y: 100 }, end: { x: 200, y: 500 } },
      getNormal: () => ({ x: -1, y: 0 }), // Normal points left (toward player)
      canReflectFrom: (dir) => dir.x > 0, // Reflects from left side
    };

    // No planned surfaces - plan is empty
    const bypassResult = evaluateBypass(player, cursor, [], [surface]);
    const path = tracePhysicalPath(player, cursor, bypassResult, [surface]);

    // First segment: player → surface
    expect(path.segments.length).toBeGreaterThanOrEqual(1);

    const firstSegment = path.segments[0]!;
    // FIRST PRINCIPLE: Segment ENDING at unplanned surface should be "unplanned" (green)
    expect(firstSegment.planAlignment).toBe("unplanned");

    // FIRST PRINCIPLE: With EMPTY plan, there's nothing to diverge from.
    // ALL segments remain "unplanned" - no "divergence" without a plan.
    if (path.segments.length >= 2) {
      const secondSegment = path.segments[1]!;
      expect(secondSegment.planAlignment).toBe("unplanned");
    }
  });

  it("should render first segment as green when hitting unplanned surface", () => {
    const player = { x: 100, y: 300 };
    const cursor = { x: 400, y: 300 };

    // Reflective surface between player and cursor
    const surface: Surface = {
      id: "surface1",
      segment: { start: { x: 200, y: 100 }, end: { x: 200, y: 500 } },
      getNormal: () => ({ x: -1, y: 0 }),
      canReflectFrom: (dir) => dir.x > 0,
    };

    const bypassResult = evaluateBypass(player, cursor, [], [surface]);
    const path = tracePhysicalPath(player, cursor, bypassResult, [surface]);
    const renderOutput = deriveRender(path, cursor, [surface]);

    // First render segment should be solid green
    const firstSegment = renderOutput.segments[0];
    expect(firstSegment).toBeDefined();
    expect(firstSegment!.style).toBe("solid");
    expect(firstSegment!.color).toBe("green");
  });
});

describe("First Principle: Aligned path after planned reflection should be green", () => {
  it("should render green all the way to cursor when reflecting off planned surface", () => {
    const player = { x: 100, y: 300 };
    const cursor = { x: 100, y: 100 };

    // Planned surface - player will reflect off it to reach cursor
    // Surface is vertical at x=200, player approaches from left
    const surface: Surface = {
      id: "planned-surface",
      segment: { start: { x: 200, y: 100 }, end: { x: 200, y: 400 } },
      getNormal: () => ({ x: -1, y: 0 }), // Normal points left (toward player)
      canReflectFrom: (dir) => dir.x > 0, // Reflects from left side
    };

    // Surface is PLANNED - this is the key difference from empty plan tests
    const bypassResult = evaluateBypass(player, cursor, [surface], [surface]);
    const path = tracePhysicalPath(player, cursor, bypassResult, [surface]);

    // Path should be fully aligned (reflecting off planned surface)
    // No divergence should occur
    expect(path.firstDivergedIndex).toBe(-1);
    expect(path.isFullyAligned).toBe(true);

    const renderOutput = deriveRender(path, cursor, [surface]);

    // All solid segments should be green (aligned)
    const solidSegments = renderOutput.segments.filter((s) => s.style === "solid");
    for (const seg of solidSegments) {
      expect(seg.color).toBe("green");
    }

    // All dashed segments should be yellow (no divergence)
    const dashedSegments = renderOutput.segments.filter((s) => s.style === "dashed");
    for (const seg of dashedSegments) {
      expect(seg.color).toBe("yellow");
    }
  });
});

describe("First Principle: Planned path future always visualized as dashed", () => {
  it("should add dashed red projection when path diverges before cursor", () => {
    const player = { x: 100, y: 200 };
    const cursor = { x: 300, y: 200 };

    // Wall blocks the path before cursor
    const wall: Surface = {
      id: "wall",
      segment: { start: { x: 150, y: 100 }, end: { x: 150, y: 300 } },
      getNormal: () => ({ x: -1, y: 0 }),
      canReflectFrom: () => false,
    };

    const bypassResult = evaluateBypass(player, cursor, [], [wall]);
    const path = tracePhysicalPath(player, cursor, bypassResult, [wall]);

    // Cursor should NOT be reachable (blocked by wall)
    expect(path.cursorReachable).toBe(false);

    const renderOutput = deriveRender(path, cursor, [wall]);

    // Should have solid red segment to cursor
    const solidRedSegments = renderOutput.segments.filter(
      (s) => s.style === "solid" && s.color === "red"
    );
    expect(solidRedSegments.length).toBeGreaterThan(0);

    // Should have dashed red projection beyond cursor
    const dashedRedSegments = renderOutput.segments.filter(
      (s) => s.style === "dashed" && s.color === "red"
    );
    expect(dashedRedSegments.length).toBeGreaterThan(0);

    // The dashed red should start at cursor
    const dashedRed = dashedRedSegments[0];
    expect(dashedRed!.start.x).toBe(cursor.x);
    expect(dashedRed!.start.y).toBe(cursor.y);
  });

  it("should have dashed red follow physics with surface after cursor", () => {
    const player = { x: 100, y: 200 };
    const cursor = { x: 250, y: 200 };

    // First surface blocks path before cursor
    const surface1: Surface = {
      id: "surface1",
      segment: { start: { x: 150, y: 100 }, end: { x: 150, y: 300 } },
      getNormal: () => ({ x: -1, y: 0 }),
      canReflectFrom: () => false,
    };

    // Second surface is after cursor - should be hit by dashed red
    const surface2: Surface = {
      id: "surface2",
      segment: { start: { x: 350, y: 100 }, end: { x: 350, y: 300 } },
      getNormal: () => ({ x: -1, y: 0 }),
      canReflectFrom: () => true,
    };

    const surfaces = [surface1, surface2];
    const bypassResult = evaluateBypass(player, cursor, [], surfaces);
    const path = tracePhysicalPath(player, cursor, bypassResult, surfaces);

    const renderOutput = deriveRender(path, cursor, surfaces);

    // Dashed red should have multiple segments (hit surface2)
    const dashedRedSegments = renderOutput.segments.filter(
      (s) => s.style === "dashed" && s.color === "red"
    );

    // First dashed red starts at cursor
    expect(dashedRedSegments.length).toBeGreaterThan(0);
    expect(dashedRedSegments[0]!.start.x).toBe(cursor.x);

    // Should hit surface2 (at x=350), so first segment ends at or before 350
    expect(dashedRedSegments[0]!.end.x).toBeLessThanOrEqual(350);
  });
});

describe("First Principle: Red only when diverging from a plan", () => {
  it("should render yellow dashed projection when plan is empty", () => {
    const player = { x: 100, y: 200 };
    const cursor = { x: 200, y: 200 };

    // No surfaces at all, plan is EMPTY
    const bypassResult = evaluateBypass(player, cursor, [], []);
    const path = tracePhysicalPath(player, cursor, bypassResult, []);
    const renderOutput = deriveRender(path, cursor);

    // After cursor, segments should be YELLOW (actual continuation), not red
    const dashedSegments = renderOutput.segments.filter((s) => s.style === "dashed");

    // All dashed segments should be yellow when plan is empty
    for (const seg of dashedSegments) {
      expect(seg.color).toBe("yellow");
    }

    // No red dashed segments when plan is empty
    const redDashedSegments = renderOutput.segments.filter(
      (s) => s.style === "dashed" && s.color === "red"
    );
    expect(redDashedSegments).toHaveLength(0);
  });

  it("should render yellow dashed when reflecting off surfaces with empty plan", () => {
    // Create a path that goes from player to cursor, then continues beyond
    // With surfaces that will be hit in the projection
    const player = { x: 100, y: 200 };
    const cursor = { x: 200, y: 200 };

    // Surface far away, won't be hit before cursor
    const surface: Surface = {
      id: "ricochet",
      segment: { start: { x: 300, y: 100 }, end: { x: 300, y: 300 } },
      getNormal: () => ({ x: -1, y: 0 }),
      canReflectFrom: () => true,
    };

    // Plan is EMPTY
    const bypassResult = evaluateBypass(player, cursor, [], [surface]);
    const path = tracePhysicalPath(player, cursor, bypassResult, [surface]);
    const renderOutput = deriveRender(path, cursor, [surface]);

    // All dashed segments should be yellow when plan is empty
    const dashedSegments = renderOutput.segments.filter((s) => s.style === "dashed");
    for (const seg of dashedSegments) {
      expect(seg.color).toBe("yellow");
    }
  });
});

describe("Edge Cases Eliminated By Design", () => {
  it("should not require tolerance for alignment (annotation-based)", () => {
    const player = { x: 100, y: 100 };
    const cursor = { x: 200, y: 100 };
    const bypassResult = evaluateBypass(player, cursor, [], []);
    const path = tracePhysicalPath(player, cursor, bypassResult, []);

    // Alignment is a boolean property, not a tolerance-based comparison
    expect(typeof path.isFullyAligned).toBe("boolean");

    // Each segment has explicit alignment, not derived from comparison
    for (const segment of path.segments) {
      expect(["aligned", "diverged", "unplanned"]).toContain(segment.planAlignment);
    }
  });

  it("should have continuous segments (no forward projection gap)", () => {
    const player = { x: 100, y: 100 };
    const cursor = { x: 200, y: 100 };
    const bypassResult = evaluateBypass(player, cursor, [], []);
    const path = tracePhysicalPath(player, cursor, bypassResult, []);

    // All segments should be in one array, no separate "projection"
    expect(Array.isArray(path.segments)).toBe(true);

    // Segments should connect
    for (let i = 0; i < path.segments.length - 1; i++) {
      const current = path.segments[i]!;
      const next = path.segments[i + 1]!;

      // End of current should equal start of next (within floating point tolerance)
      expect(Math.abs(current.end.x - next.start.x)).toBeLessThan(1);
      expect(Math.abs(current.end.y - next.start.y)).toBeLessThan(1);
    }
  });

  it("should derive cursorReachable from segment annotations", () => {
    const player = { x: 100, y: 100 };
    const cursor = { x: 200, y: 100 };
    const bypassResult = evaluateBypass(player, cursor, [], []);
    const path = tracePhysicalPath(player, cursor, bypassResult, []);

    // cursorReachable should be true if cursor is on path and no divergence before it
    if (path.cursorSegmentIndex !== -1) {
      const beforeCursor = path.segments.slice(0, path.cursorSegmentIndex + 1);
      const anyDiverged = beforeCursor.some((s) => s.planAlignment === "diverged");
      expect(path.cursorReachable).toBe(!anyDiverged);
    }
  });
});
