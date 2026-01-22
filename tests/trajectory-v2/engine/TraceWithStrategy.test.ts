/**
 * Tests for traceWithStrategy - the shared outer loop for path tracing.
 *
 * This is the ONE loop used by all path types:
 * - Actual path (physical strategy)
 * - Planned path (planned strategy)
 * - Physics projection after divergence
 *
 * The loop is the same - only the strategy differs.
 */

import { describe, it, expect } from "vitest";
import { traceWithStrategy, type TraceStrategyOptions } from "@/trajectory-v2/engine/TracePath";
import { createPhysicalStrategy, createPlannedStrategy } from "@/trajectory-v2/engine/HitDetectionStrategy";
import { createRayPropagator } from "@/trajectory-v2/engine/RayPropagator";
import { createMockSurface, createMockWall } from "@test/helpers/surfaceHelpers";

describe("traceWithStrategy", () => {
  it("should use the strategy's findNextHit for each iteration", () => {
    // Two parallel mirrors that create multiple reflections
    // mirror1 at x=100, normal pointing RIGHT (toward +x)
    const mirror1 = createMockSurface(
      "mirror1",
      { x: 100, y: 400 },  // from top to bottom → normal points right
      { x: 100, y: 0 }
    );
    // mirror2 at x=300, normal pointing LEFT (toward -x)
    const mirror2 = createMockSurface(
      "mirror2",
      { x: 300, y: 0 },   // from bottom to top → normal points left
      { x: 300, y: 400 }
    );

    const propagator = createRayPropagator(
      { x: 150, y: 200 }, // between mirrors
      { x: 400, y: 200 }  // target to the right
    );

    const strategy = createPhysicalStrategy([mirror1, mirror2]);
    const options: TraceStrategyOptions = {};

    const result = traceWithStrategy(propagator, strategy, options);

    // Should have hit mirror2, reflected to mirror1, then to mirror2 again, etc.
    // With 5 max reflections, we should get multiple segments
    expect(result.segments.length).toBeGreaterThanOrEqual(2);

    // First segment should end at mirror2
    expect(result.segments[0]!.surface?.id).toBe("mirror2");

    // Second segment should end at mirror1
    if (result.segments.length > 1) {
      expect(result.segments[1]!.surface?.id).toBe("mirror1");
    }
  });

  it("should reflect propagator through hit surface", () => {
    // mirror at x=200, normal pointing LEFT (toward -x) - reflects rays coming from left
    const mirror = createMockSurface(
      "mirror",
      { x: 200, y: 0 },
      { x: 200, y: 400 }
    );
    // wall at x=100, behind the player
    const wall = createMockWall(
      "wall",
      { x: 100, y: 0 },
      { x: 100, y: 400 }
    );

    const propagator = createRayPropagator(
      { x: 150, y: 200 },
      { x: 300, y: 200 }
    );

    const strategy = createPhysicalStrategy([mirror, wall]);
    const result = traceWithStrategy(propagator, strategy, {});

    // Should hit mirror, reflect, then hit wall
    expect(result.segments.length).toBe(2);
    expect(result.segments[0]!.surface?.id).toBe("mirror");
    expect(result.segments[1]!.surface?.id).toBe("wall");

    // Check that segments are connected
    expect(result.segments[0]!.end.x).toBeCloseTo(result.segments[1]!.start.x);
    expect(result.segments[0]!.end.y).toBeCloseTo(result.segments[1]!.start.y);
  });

  it("should stop when strategy returns null", () => {
    // No surfaces at all
    const propagator = createRayPropagator(
      { x: 100, y: 200 },
      { x: 300, y: 200 }
    );

    const strategy = createPhysicalStrategy([]);
    const result = traceWithStrategy(propagator, strategy, {});

    // Should have one segment going to maxDistance
    expect(result.segments.length).toBe(1);
    expect(result.terminationType).toBe("no_hit");

    // Segment should extend in direction of target
    const seg = result.segments[0]!;
    expect(seg.end.x).toBeGreaterThan(seg.start.x);
  });

  it("should stop when hit.canReflect is false", () => {
    const wall = createMockWall(
      "wall",
      { x: 200, y: 0 },
      { x: 200, y: 400 }
    );

    const propagator = createRayPropagator(
      { x: 100, y: 200 },
      { x: 300, y: 200 }
    );

    const strategy = createPhysicalStrategy([wall]);
    const result = traceWithStrategy(propagator, strategy, {});

    // Should hit wall and stop (not reflect)
    expect(result.segments.length).toBe(1);
    expect(result.terminationType).toBe("wall");
    expect(result.segments[0]!.canReflect).toBe(false);
  });

  it("should return final propagator state for continuation", () => {
    // mirror at x=200, normal pointing LEFT - reflects rays coming from left
    const mirror = createMockSurface(
      "mirror",
      { x: 200, y: 0 },
      { x: 200, y: 400 }
    );

    const propagator = createRayPropagator(
      { x: 100, y: 200 },
      { x: 300, y: 200 }
    );

    const strategy = createPhysicalStrategy([mirror]);
    const result = traceWithStrategy(propagator, strategy, {});

    // The returned propagator should have been reflected through the mirror
    expect(result.propagator).toBeDefined();
    
    // Propagator state should reflect the reflection
    const state = result.propagator.getState();
    expect(state.depth).toBe(1);
    expect(state.lastSurface?.id).toBe("mirror");
    expect(state.startLine).not.toBeNull();
  });

  it("should stop at cursor when stopAtCursor is provided", () => {
    const propagator = createRayPropagator(
      { x: 100, y: 200 },
      { x: 500, y: 200 }
    );

    const cursor = { x: 300, y: 200 };

    const strategy = createPhysicalStrategy([]);
    const result = traceWithStrategy(propagator, strategy, {
      stopAtCursor: cursor,
    });

    // Should stop at cursor
    expect(result.segments.length).toBe(1);
    expect(result.terminationType).toBe("cursor");
    expect(result.segments[0]!.end.x).toBeCloseTo(cursor.x);
    expect(result.segments[0]!.end.y).toBeCloseTo(cursor.y);
  });

  it("should reject off-segment hits in planned strategy (uses physical mode)", () => {
    // Surface with small segment that ray would miss
    const surface = createMockSurface(
      "planned-surface",
      { x: 200, y: 50 },  // segment from y=50 to y=150
      { x: 200, y: 150 }
    );

    const propagator = createRayPropagator(
      { x: 100, y: 200 }, // ray at y=200 would miss segment
      { x: 300, y: 200 }
    );

    // Physical strategy should NOT hit
    const physicalStrategy = createPhysicalStrategy([surface]);
    const physicalResult = traceWithStrategy(propagator, physicalStrategy, {});
    expect(physicalResult.terminationType).toBe("no_hit");

    // Planned strategy also should NOT hit (now uses physical mode)
    const plannedStrategy = createPlannedStrategy([surface]);
    const plannedResult = traceWithStrategy(propagator, plannedStrategy, {});
    // Both strategies now behave the same for off-segment hits
    expect(plannedResult.terminationType).toBe("no_hit");
  });

  describe("continueFromPosition", () => {
    it("should start first segment from continueFromPosition", () => {
      // Setup: player at (0,0), target at (200, 0), wall at x=150
      // Use continueFromPosition at (100, 0) - between player and wall
      const wall = createMockWall(
        "wall",
        { x: 150, y: -100 },
        { x: 150, y: 100 }
      );

      const propagator = createRayPropagator(
        { x: 0, y: 0 },   // origin image (player)
        { x: 200, y: 0 }  // target image (cursor)
      );

      const continueFrom = { x: 100, y: 0 }; // Mid-point on the ray

      const strategy = createPhysicalStrategy([wall]);
      const result = traceWithStrategy(propagator, strategy, {
        continueFromPosition: continueFrom,
      });

      // First segment should start from continueFromPosition, not from origin
      expect(result.segments.length).toBe(1);
      expect(result.segments[0]!.start.x).toBeCloseTo(100); // continueFrom.x
      expect(result.segments[0]!.start.y).toBeCloseTo(0);
      expect(result.segments[0]!.end.x).toBeCloseTo(150);   // wall position
    });

    it("should continue with same ray direction after continueFromPosition", () => {
      // Two walls: one at x=150, one at x=50 (behind continueFrom)
      // Ray goes from origin(0,0) toward target(200,0)
      // Continue from (100, 0) - should NOT hit wall at x=50 (behind)
      const wallAhead = createMockWall(
        "wall-ahead",
        { x: 150, y: -100 },
        { x: 150, y: 100 }
      );
      const wallBehind = createMockWall(
        "wall-behind",
        { x: 50, y: -100 },
        { x: 50, y: 100 }
      );

      const propagator = createRayPropagator(
        { x: 0, y: 0 },
        { x: 200, y: 0 }
      );

      const strategy = createPhysicalStrategy([wallAhead, wallBehind]);
      const result = traceWithStrategy(propagator, strategy, {
        continueFromPosition: { x: 100, y: 0 },
      });

      // Should only hit wall-ahead, not wall-behind
      expect(result.segments.length).toBe(1);
      expect(result.segments[0]!.surface?.id).toBe("wall-ahead");
    });

    it("should allow continuation after cursor without creating new propagator", () => {
      // Player at (0,0), cursor at (100,0), wall at (200,0)
      // First trace to cursor, then continue past it using continueFromPosition
      const wall = createMockWall(
        "wall",
        { x: 200, y: -100 },
        { x: 200, y: 100 }
      );

      const propagator = createRayPropagator(
        { x: 0, y: 0 },
        { x: 300, y: 0 }
      );

      const cursor = { x: 100, y: 0 };

      const strategy = createPhysicalStrategy([wall]);

      // First trace: stop at cursor
      const toCursor = traceWithStrategy(propagator, strategy, {
        stopAtCursor: cursor,
      });

      expect(toCursor.terminationType).toBe("cursor");
      expect(toCursor.segments[0]!.end.x).toBeCloseTo(100);

      // Continue from cursor using SAME propagator (not a new one!)
      const fromCursor = traceWithStrategy(toCursor.propagator, strategy, {
        continueFromPosition: cursor,
      });

      // Should continue and hit wall
      expect(fromCursor.segments.length).toBe(1);
      expect(fromCursor.segments[0]!.start.x).toBeCloseTo(100); // starts from cursor
      expect(fromCursor.segments[0]!.end.x).toBeCloseTo(200);   // ends at wall
      expect(fromCursor.segments[0]!.surface?.id).toBe("wall");
    });
  });
});
