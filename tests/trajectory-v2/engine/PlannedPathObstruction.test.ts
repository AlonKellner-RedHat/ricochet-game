/**
 * Planned Path Obstruction Tests
 *
 * Tests for the calculatePlannedPathFromPoint function and
 * the planned path visualization when obstructed.
 */

import type { Surface } from "@/surfaces/Surface";
import { evaluateBypass } from "@/trajectory-v2/engine/BypassEvaluator";
import { tracePhysicalPath } from "@/trajectory-v2/engine/PathBuilder";
import { calculatePlannedPathFromPoint, deriveRender } from "@/trajectory-v2/engine/RenderDeriver";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import { describe, expect, it } from "vitest";

/**
 * Create a vertical surface at x position.
 */
function createVerticalSurface(id: string, x: number, yMin: number, yMax: number): Surface {
  return {
    id,
    segment: { start: { x, y: yMin }, end: { x, y: yMax } },
    surfaceType: "ricochet",
    onArrowHit: () => ({ type: "reflect" }),
    isPlannable: () => true,
    getVisualProperties: () => ({ color: 0xffffff, lineWidth: 2, alpha: 1 }),
    getNormal: () => ({ x: -1, y: 0 }), // Points left
    canReflectFrom: () => true,
  } as unknown as Surface;
}

describe("calculatePlannedPathFromPoint", () => {
  it("should calculate path from divergence point to planned surface and back to cursor", () => {
    // Setup: player(100) > obstruction(200) > cursor(300) > planned(400)
    const divergencePoint: Vector2 = { x: 200, y: 300 };
    const cursor: Vector2 = { x: 300, y: 300 };
    const plannedSurface = createVerticalSurface("planned1", 400, 100, 500);

    const segments = calculatePlannedPathFromPoint(divergencePoint, cursor, [plannedSurface], []);

    console.log("Planned path segments:", segments);

    // Should have at least 2 segments: to surface, then back toward cursor
    expect(segments.length).toBeGreaterThanOrEqual(2);

    // First segment should go from divergence to planned surface
    const firstSeg = segments[0]!;
    expect(firstSeg.start.x).toBeCloseTo(200, 0); // divergence point
    expect(firstSeg.end.x).toBeCloseTo(400, 0); // planned surface

    // Second segment should go from planned surface toward cursor
    const secondSeg = segments[1]!;
    expect(secondSeg.start.x).toBeCloseTo(400, 0); // planned surface
    // After reflection, going back toward cursor (which is at x=300)
    // The direction should be leftward
    expect(secondSeg.end.x).toBeLessThan(400);
  });

  it("should return empty array when no planned surfaces", () => {
    const divergencePoint: Vector2 = { x: 200, y: 300 };
    const cursor: Vector2 = { x: 300, y: 300 };

    const segments = calculatePlannedPathFromPoint(divergencePoint, cursor, [], []);

    expect(segments).toEqual([]);
  });
});

/**
 * Create a horizontal surface at y position.
 *
 * IMPORTANT: The normal direction is determined by segment direction.
 * - normalDirection "up": segment goes right-to-left, normal points up (y: -1)
 * - normalDirection "down": segment goes left-to-right, normal points down (y: +1)
 *
 * canReflectFrom uses dot product: returns true when dot(incoming, normal) < 0
 */
function createHorizontalSurface(
  id: string,
  y: number,
  xMin: number,
  xMax: number,
  canReflect = true,
  normalDirection: "up" | "down" = "up"
): Surface {
  // For normal pointing "up" (y: -1), segment must go right-to-left
  // For normal pointing "down" (y: +1), segment must go left-to-right
  const segment =
    normalDirection === "up"
      ? { start: { x: xMax, y }, end: { x: xMin, y } } // Right-to-left, normal up
      : { start: { x: xMin, y }, end: { x: xMax, y } }; // Left-to-right, normal down

  const normal = normalDirection === "up" ? { x: 0, y: -1 } : { x: 0, y: 1 };

  return {
    id,
    segment,
    surfaceType: canReflect ? "ricochet" : "wall",
    onArrowHit: () => ({ type: canReflect ? "reflect" : "stop" }),
    isPlannable: () => canReflect,
    getVisualProperties: () => ({ color: 0xffffff, lineWidth: 2, alpha: 1 }),
    getNormal: () => normal,
    // Use dot product like actual RicochetSurface
    canReflectFrom: (dir: Vector2) => {
      if (!canReflect) return false;
      // dot(incoming, normal) < 0 means approaching from front
      return dir.x * normal.x + dir.y * normal.y < 0;
    },
  } as unknown as Surface;
}

describe("deriveRender with obstruction", () => {
  it("should render red path to planned surface when obstructed", () => {
    // Setup: player(100) > obstruction(200) > cursor(300) > planned(400)
    const player: Vector2 = { x: 100, y: 300 };
    const cursor: Vector2 = { x: 300, y: 300 };
    const obstruction = createVerticalSurface("obstruction", 200, 100, 500);
    const plannedSurface = createVerticalSurface("planned1", 400, 100, 500);

    const bypassResult = evaluateBypass(
      player,
      cursor,
      [plannedSurface],
      [obstruction, plannedSurface]
    );

    console.log("Bypass result:", {
      activeSurfaces: bypassResult.activeSurfaces.map((s) => s.id),
      bypassedSurfaces: bypassResult.bypassedSurfaces.map((b) => b.surface.id),
    });

    const unifiedPath = tracePhysicalPath(player, cursor, bypassResult, [
      obstruction,
      plannedSurface,
    ]);

    console.log("Unified path:", {
      segmentCount: unifiedPath.segments.length,
      firstDivergedIndex: unifiedPath.firstDivergedIndex,
      cursorReachable: unifiedPath.cursorReachable,
      segments: unifiedPath.segments.map((s) => ({
        start: s.start,
        end: s.end,
        alignment: s.planAlignment,
      })),
    });

    const renderOutput = deriveRender(
      unifiedPath,
      cursor,
      [obstruction, plannedSurface],
      bypassResult.activeSurfaces
    );

    console.log("Render output:", {
      segmentCount: renderOutput.segments.length,
      segments: renderOutput.segments.map((s) => ({
        start: s.start,
        end: s.end,
        color: s.color,
        style: s.style,
      })),
    });

    // Should have red segments that reach the planned surface (x=400)
    const redSegments = renderOutput.segments.filter((s) => s.color === "red");
    expect(redSegments.length).toBeGreaterThan(0);

    // At least one red segment should reach x=400 (planned surface)
    const reachesPlannedSurface = redSegments.some(
      (seg) => Math.abs(seg.start.x - 400) < 5 || Math.abs(seg.end.x - 400) < 5
    );
    expect(reachesPlannedSurface).toBe(true);
  });

  it("should handle user-reported scenario: horizontal wall blocking path to horizontal planned surface", () => {
    // User's exact setup:
    // player (100, 0)
    // other-surface, non-reflective (0, 50)->(200, 50)
    // cursor (0, 55)
    // planned-surface, reflective, facing down (50, 200)->(150, 200)

    const player: Vector2 = { x: 100, y: 0 };
    const cursor: Vector2 = { x: 0, y: 55 };

    // Non-reflective wall at y=50
    const wall = createHorizontalSurface("wall", 50, 0, 200, false);

    // Reflective surface at y=200, facing down (normal pointing toward player at y=0)
    const plannedSurface = createHorizontalSurface("planned1", 200, 50, 150, true, "up");

    console.log("=== User scenario ===");
    console.log("Player:", player);
    console.log("Cursor:", cursor);
    console.log("Wall segment:", wall.segment);
    console.log("Planned surface segment:", plannedSurface.segment);
    console.log("Planned surface normal:", plannedSurface.getNormal());

    const bypassResult = evaluateBypass(player, cursor, [plannedSurface], [wall, plannedSurface]);

    console.log("Bypass result:", {
      activeSurfaces: bypassResult.activeSurfaces.map((s) => s.id),
      bypassedSurfaces: bypassResult.bypassedSurfaces.map((b) => ({
        id: b.surface.id,
        reason: b.reason,
      })),
    });

    const unifiedPath = tracePhysicalPath(player, cursor, bypassResult, [wall, plannedSurface]);

    console.log("Unified path:", {
      segmentCount: unifiedPath.segments.length,
      firstDivergedIndex: unifiedPath.firstDivergedIndex,
      cursorReachable: unifiedPath.cursorReachable,
      segments: unifiedPath.segments.map((s) => ({
        start: s.start,
        end: s.end,
        alignment: s.planAlignment,
        endSurface: s.endSurface?.id,
      })),
    });

    const renderOutput = deriveRender(
      unifiedPath,
      cursor,
      [wall, plannedSurface],
      bypassResult.activeSurfaces
    );

    console.log("Render output:", {
      segmentCount: renderOutput.segments.length,
      segments: renderOutput.segments.map((s) => ({
        start: s.start,
        end: s.end,
        color: s.color,
        style: s.style,
      })),
    });

    // Should have green segment from player toward planned surface
    const greenSegments = renderOutput.segments.filter((s) => s.color === "green");
    expect(greenSegments.length).toBeGreaterThan(0);

    // First green segment should start at player
    expect(greenSegments[0]!.start.x).toBeCloseTo(100, 0);
    expect(greenSegments[0]!.start.y).toBeCloseTo(0, 0);

    // Should have red segments showing planned path to surface
    const redSegments = renderOutput.segments.filter((s) => s.color === "red");
    expect(redSegments.length).toBeGreaterThan(0);

    // At least one red segment should reach y=200 (planned surface)
    const reachesPlannedSurface = redSegments.some(
      (seg) => Math.abs(seg.start.y - 200) < 5 || Math.abs(seg.end.y - 200) < 5
    );
    expect(reachesPlannedSurface).toBe(true);
  });

  it("should render planned path with reflections when cursor is past the wall (y=52)", () => {
    // Test Case 1: Cursor past the wall
    // - player: (100, 0)
    // - wall: non-reflective at y=50, from (0,50) to (200,50)
    // - cursor: (0, 52) - past the wall from player's perspective
    // - planned-surface: reflective at y=200, from (50,200) to (150,200), facing up (normal toward player)
    //
    // Expected:
    // - Solid green: player → wall (divergence point)
    // - Solid red: wall → planned-surface → cursor (following plan)
    // - Dashed red: projection from cursor, blocked by wall at y=50

    const player: Vector2 = { x: 100, y: 0 };
    const cursor: Vector2 = { x: 0, y: 52 }; // Past the wall

    const wall = createHorizontalSurface("wall", 50, 0, 200, false);
    const plannedSurface = createHorizontalSurface("planned1", 200, 50, 150, true, "up");

    console.log("=== Test Case 1: Cursor past wall (y=52) ===");

    const bypassResult = evaluateBypass(player, cursor, [plannedSurface], [wall, plannedSurface]);

    const unifiedPath = tracePhysicalPath(player, cursor, bypassResult, [wall, plannedSurface]);

    console.log(
      "Unified path segments:",
      unifiedPath.segments.map((s) => ({
        start: s.start,
        end: s.end,
        alignment: s.planAlignment,
        endSurface: s.endSurface?.id,
      }))
    );

    const renderOutput = deriveRender(
      unifiedPath,
      cursor,
      [wall, plannedSurface],
      bypassResult.activeSurfaces
    );

    console.log(
      "Render segments:",
      renderOutput.segments.map((s) => ({
        start: `(${s.start.x.toFixed(1)}, ${s.start.y.toFixed(1)})`,
        end: `(${s.end.x.toFixed(1)}, ${s.end.y.toFixed(1)})`,
        color: s.color,
        style: s.style,
      }))
    );

    // 1. Should have green segment from player to wall
    const greenSegments = renderOutput.segments.filter((s) => s.color === "green");
    expect(greenSegments.length).toBeGreaterThan(0);
    expect(greenSegments[0]!.start.y).toBeCloseTo(0, 0); // Starts at player

    // 2. Should have solid red segments reaching y=200 (planned surface)
    const solidRedSegments = renderOutput.segments.filter(
      (s) => s.color === "red" && s.style === "solid"
    );
    expect(solidRedSegments.length).toBeGreaterThan(0);

    // Verify red path reaches the planned surface (y=200)
    const reachesPlannedSurface = solidRedSegments.some(
      (seg) => Math.abs(seg.start.y - 200) < 5 || Math.abs(seg.end.y - 200) < 5
    );
    expect(reachesPlannedSurface).toBe(true);

    // 3. All solid red segments should form a connected path (no gaps)
    // First solid red should start near the divergence point (wall)
    // There should be a segment that goes TO the planned surface and one that comes BACK
    const hasIngoingToSurface = solidRedSegments.some((seg) => seg.end.y > 100); // Goes toward y=200
    const hasOutgoingFromSurface = solidRedSegments.some((seg) => seg.start.y > 100); // Comes from y=200
    expect(hasIngoingToSurface).toBe(true);
    expect(hasOutgoingFromSurface).toBe(true);

    // 4. Should have dashed red projection after cursor (blocked by wall)
    const dashedRedSegments = renderOutput.segments.filter(
      (s) => s.color === "red" && s.style === "dashed"
    );
    expect(dashedRedSegments.length).toBeGreaterThan(0);
  });

  it("should render planned path with reflections when cursor is before the wall (y=48)", () => {
    // Test Case 2: Cursor before the wall
    // - player: (100, 0)
    // - wall: non-reflective at y=50, from (0,50) to (200,50)
    // - cursor: (0, 48) - before the wall from player's perspective
    // - planned-surface: reflective at y=200, from (50,200) to (150,200), facing up (normal toward player)
    //
    // Expected:
    // - Solid green: player → wall (divergence point)
    // - Solid red: wall → planned-surface → cursor (SAME as Case 1)
    // - Dashed red: projection from cursor, reaches floor at y=0 (NOT blocked by wall)

    const player: Vector2 = { x: 100, y: 0 };
    const cursor: Vector2 = { x: 0, y: 48 }; // Before the wall

    const wall = createHorizontalSurface("wall", 50, 0, 200, false);
    const plannedSurface = createHorizontalSurface("planned1", 200, 50, 150, true, "up");

    console.log("=== Test Case 2: Cursor before wall (y=48) ===");

    const bypassResult = evaluateBypass(player, cursor, [plannedSurface], [wall, plannedSurface]);

    const unifiedPath = tracePhysicalPath(player, cursor, bypassResult, [wall, plannedSurface]);

    console.log(
      "Unified path segments:",
      unifiedPath.segments.map((s) => ({
        start: s.start,
        end: s.end,
        alignment: s.planAlignment,
        endSurface: s.endSurface?.id,
      }))
    );

    const renderOutput = deriveRender(
      unifiedPath,
      cursor,
      [wall, plannedSurface],
      bypassResult.activeSurfaces
    );

    console.log(
      "Render segments:",
      renderOutput.segments.map((s) => ({
        start: `(${s.start.x.toFixed(1)}, ${s.start.y.toFixed(1)})`,
        end: `(${s.end.x.toFixed(1)}, ${s.end.y.toFixed(1)})`,
        color: s.color,
        style: s.style,
      }))
    );

    // 1. Should have green segment from player to wall
    const greenSegments = renderOutput.segments.filter((s) => s.color === "green");
    expect(greenSegments.length).toBeGreaterThan(0);
    expect(greenSegments[0]!.start.y).toBeCloseTo(0, 0); // Starts at player

    // 2. Should have solid red segments reaching y=200 (planned surface)
    const solidRedSegments = renderOutput.segments.filter(
      (s) => s.color === "red" && s.style === "solid"
    );
    expect(solidRedSegments.length).toBeGreaterThan(0);

    // Verify red path reaches the planned surface (y=200)
    const reachesPlannedSurface = solidRedSegments.some(
      (seg) => Math.abs(seg.start.y - 200) < 5 || Math.abs(seg.end.y - 200) < 5
    );
    expect(reachesPlannedSurface).toBe(true);

    // 3. All solid red segments should form a connected path (no gaps)
    const hasIngoingToSurface = solidRedSegments.some((seg) => seg.end.y > 100);
    const hasOutgoingFromSurface = solidRedSegments.some((seg) => seg.start.y > 100);
    expect(hasIngoingToSurface).toBe(true);
    expect(hasOutgoingFromSurface).toBe(true);

    // 4. Should have dashed red projection after cursor
    // Unlike Case 1, this projection should reach y=0 (floor), NOT be blocked by wall
    const dashedRedSegments = renderOutput.segments.filter(
      (s) => s.color === "red" && s.style === "dashed"
    );
    expect(dashedRedSegments.length).toBeGreaterThan(0);

    // The dashed path should continue past the cursor and reach y=0 (floor)
    // Since the cursor is at y=48, the projection goes back toward y=0
    const dashedPathReachesFloor = dashedRedSegments.some(
      (seg) => seg.end.y < 10 || seg.start.y < 10
    );
    expect(dashedPathReachesFloor).toBe(true);
  });

  it("should render planned path with reflections when obstruction is REFLECTIVE (y=52)", () => {
    // Test Case 3: Reflective obstruction
    // Same as Case 1, but the obstruction at y=50 is REFLECTIVE instead of a wall
    // - player: (100, 0)
    // - obstruction: REFLECTIVE at y=50, facing up (normal toward y=0)
    // - cursor: (0, 52) - past the obstruction
    // - planned-surface: reflective at y=200
    //
    // Expected (same as Case 1):
    // - Solid green: player → obstruction (divergence point)
    // - Solid red: obstruction → planned-surface → cursor (following plan, ignoring obstruction)
    // - Dashed red: projection from cursor

    const player: Vector2 = { x: 100, y: 0 };
    const cursor: Vector2 = { x: 0, y: 52 };

    // REFLECTIVE surface at y=50, facing up (can reflect arrows coming from player direction)
    const reflectiveObstruction = createHorizontalSurface("obstruction", 50, 0, 200, true, "up");
    const plannedSurface = createHorizontalSurface("planned1", 200, 50, 150, true, "up");

    console.log("=== Test Case 3: Reflective obstruction (y=52) ===");
    console.log("Obstruction canReflect:", reflectiveObstruction.surfaceType);

    const bypassResult = evaluateBypass(
      player,
      cursor,
      [plannedSurface],
      [reflectiveObstruction, plannedSurface]
    );

    console.log("Bypass result:", {
      activeSurfaces: bypassResult.activeSurfaces.map((s) => s.id),
      bypassedSurfaces: bypassResult.bypassedSurfaces.map((b) => ({
        id: b.surface.id,
        reason: b.reason,
      })),
    });

    const unifiedPath = tracePhysicalPath(player, cursor, bypassResult, [
      reflectiveObstruction,
      plannedSurface,
    ]);

    console.log(
      "Unified path segments:",
      unifiedPath.segments.map((s) => ({
        start: `(${s.start.x.toFixed(1)}, ${s.start.y.toFixed(1)})`,
        end: `(${s.end.x.toFixed(1)}, ${s.end.y.toFixed(1)})`,
        alignment: s.planAlignment,
        endSurface: s.endSurface?.id,
        hitOnSegment: s.hitOnSegment,
      }))
    );

    const renderOutput = deriveRender(
      unifiedPath,
      cursor,
      [reflectiveObstruction, plannedSurface],
      bypassResult.activeSurfaces
    );

    console.log(
      "Render segments:",
      renderOutput.segments.map((s) => ({
        start: `(${s.start.x.toFixed(1)}, ${s.start.y.toFixed(1)})`,
        end: `(${s.end.x.toFixed(1)}, ${s.end.y.toFixed(1)})`,
        color: s.color,
        style: s.style,
      }))
    );

    // 1. Should have green segment from player to obstruction
    const greenSegments = renderOutput.segments.filter((s) => s.color === "green");
    expect(greenSegments.length).toBeGreaterThan(0);
    expect(greenSegments[0]!.start.y).toBeCloseTo(0, 0); // Starts at player

    // 2. Should have solid red segments reaching y=200 (planned surface)
    const solidRedSegments = renderOutput.segments.filter(
      (s) => s.color === "red" && s.style === "solid"
    );
    expect(solidRedSegments.length).toBeGreaterThan(0);

    // Verify red path reaches the planned surface (y=200)
    const reachesPlannedSurface = solidRedSegments.some(
      (seg) => Math.abs(seg.start.y - 200) < 5 || Math.abs(seg.end.y - 200) < 5
    );
    expect(reachesPlannedSurface).toBe(true);

    // 3. All solid red segments should form a connected path with proper reflections
    const hasIngoingToSurface = solidRedSegments.some((seg) => seg.end.y > 100);
    const hasOutgoingFromSurface = solidRedSegments.some((seg) => seg.start.y > 100);
    expect(hasIngoingToSurface).toBe(true);
    expect(hasOutgoingFromSurface).toBe(true);
  });

  it("should render planned path with reflections when obstruction is REFLECTIVE (y=48)", () => {
    // Test Case 4: Reflective obstruction, cursor before obstruction
    // Same as Case 2, but the obstruction at y=50 is REFLECTIVE instead of a wall

    const player: Vector2 = { x: 100, y: 0 };
    const cursor: Vector2 = { x: 0, y: 48 };

    // REFLECTIVE surface at y=50, facing up
    const reflectiveObstruction = createHorizontalSurface("obstruction", 50, 0, 200, true, "up");
    const plannedSurface = createHorizontalSurface("planned1", 200, 50, 150, true, "up");

    console.log("=== Test Case 4: Reflective obstruction (y=48) ===");

    const bypassResult = evaluateBypass(
      player,
      cursor,
      [plannedSurface],
      [reflectiveObstruction, plannedSurface]
    );

    const unifiedPath = tracePhysicalPath(player, cursor, bypassResult, [
      reflectiveObstruction,
      plannedSurface,
    ]);

    console.log(
      "Unified path segments:",
      unifiedPath.segments.map((s) => ({
        start: `(${s.start.x.toFixed(1)}, ${s.start.y.toFixed(1)})`,
        end: `(${s.end.x.toFixed(1)}, ${s.end.y.toFixed(1)})`,
        alignment: s.planAlignment,
        endSurface: s.endSurface?.id,
      }))
    );

    const renderOutput = deriveRender(
      unifiedPath,
      cursor,
      [reflectiveObstruction, plannedSurface],
      bypassResult.activeSurfaces
    );

    console.log(
      "Render segments:",
      renderOutput.segments.map((s) => ({
        start: `(${s.start.x.toFixed(1)}, ${s.start.y.toFixed(1)})`,
        end: `(${s.end.x.toFixed(1)}, ${s.end.y.toFixed(1)})`,
        color: s.color,
        style: s.style,
      }))
    );

    // 1. Should have green segment from player to obstruction
    const greenSegments = renderOutput.segments.filter((s) => s.color === "green");
    expect(greenSegments.length).toBeGreaterThan(0);

    // 2. Should have solid red segments reaching y=200 (planned surface)
    const solidRedSegments = renderOutput.segments.filter(
      (s) => s.color === "red" && s.style === "solid"
    );
    expect(solidRedSegments.length).toBeGreaterThan(0);

    // Verify red path reaches the planned surface (y=200)
    const reachesPlannedSurface = solidRedSegments.some(
      (seg) => Math.abs(seg.start.y - 200) < 5 || Math.abs(seg.end.y - 200) < 5
    );
    expect(reachesPlannedSurface).toBe(true);
  });

  it("should render planned path when obstruction is REFLECTIVE facing DOWN (wrong direction)", () => {
    // Test Case 5: Reflective obstruction facing DOWN (toward player)
    // This is a tricky case - the surface at y=50 has its normal pointing DOWN (toward y=0)
    // An arrow coming from player at y=0 going DOWN (toward y=50+) CAN reflect off this surface
    // because the arrow approaches from the "back" side.
    //
    // Actually, with normal pointing DOWN (0, 1), and arrow going DOWN (0, positive):
    // dot((0, 1), (0, 1)) = 1 > 0, so canReflectFrom returns FALSE!
    // This means the arrow CANNOT reflect, it should just pass through (or stick).
    //
    // But for this test, let's verify the obstruction with normal pointing DOWN (segment left-to-right)
    // The path should behave differently.

    const player: Vector2 = { x: 100, y: 0 };
    const cursor: Vector2 = { x: 0, y: 52 };

    // REFLECTIVE surface at y=50, facing DOWN (segment left-to-right, normal toward positive Y)
    // Arrow coming from y=0 toward y=52 has direction ~ (negative x, positive y)
    // Dot with normal (0, 1) = positive y > 0, so canReflectFrom = FALSE
    const reflectiveObstructionDown = createHorizontalSurface(
      "obstruction",
      50,
      0,
      200,
      true,
      "down"
    );
    const plannedSurface = createHorizontalSurface("planned1", 200, 50, 150, true, "up");

    console.log("=== Test Case 5: Reflective obstruction facing DOWN ===");

    const bypassResult = evaluateBypass(
      player,
      cursor,
      [plannedSurface],
      [reflectiveObstructionDown, plannedSurface]
    );

    console.log("Bypass result:", {
      activeSurfaces: bypassResult.activeSurfaces.map((s) => s.id),
      bypassedSurfaces: bypassResult.bypassedSurfaces.map((b) => ({
        id: b.surface.id,
        reason: b.reason,
      })),
    });

    const unifiedPath = tracePhysicalPath(player, cursor, bypassResult, [
      reflectiveObstructionDown,
      plannedSurface,
    ]);

    console.log(
      "Unified path segments:",
      unifiedPath.segments.map((s) => ({
        start: `(${s.start.x.toFixed(1)}, ${s.start.y.toFixed(1)})`,
        end: `(${s.end.x.toFixed(1)}, ${s.end.y.toFixed(1)})`,
        alignment: s.planAlignment,
        endSurface: s.endSurface?.id,
        hitOnSegment: s.hitOnSegment,
      }))
    );

    const renderOutput = deriveRender(
      unifiedPath,
      cursor,
      [reflectiveObstructionDown, plannedSurface],
      bypassResult.activeSurfaces
    );

    console.log(
      "Render segments:",
      renderOutput.segments.map((s) => ({
        start: `(${s.start.x.toFixed(1)}, ${s.start.y.toFixed(1)})`,
        end: `(${s.end.x.toFixed(1)}, ${s.end.y.toFixed(1)})`,
        color: s.color,
        style: s.style,
      }))
    );

    // With the obstruction facing DOWN, the arrow cannot reflect off it
    // The path should just be blocked by it (like a wall)
    // This is the same as the wall case (Test Case 1)

    // 1. Should have green segment from player to obstruction
    const greenSegments = renderOutput.segments.filter((s) => s.color === "green");
    expect(greenSegments.length).toBeGreaterThan(0);

    // 2. Should have solid red segments reaching y=200 (planned surface)
    const solidRedSegments = renderOutput.segments.filter(
      (s) => s.color === "red" && s.style === "solid"
    );
    expect(solidRedSegments.length).toBeGreaterThan(0);

    // Verify red path reaches the planned surface (y=200)
    const reachesPlannedSurface = solidRedSegments.some(
      (seg) => Math.abs(seg.start.y - 200) < 5 || Math.abs(seg.end.y - 200) < 5
    );
    expect(reachesPlannedSurface).toBe(true);
  });
});
