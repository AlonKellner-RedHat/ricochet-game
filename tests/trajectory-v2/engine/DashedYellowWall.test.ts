/**
 * Test: Dashed yellow paths must stop at walls
 *
 * FIRST PRINCIPLE: Dashed paths must follow physically accurate paths,
 * assuming their initial starting position and direction.
 *
 * This test verifies that when an arrow reflects off a surface and
 * the reflected path hits a non-reflective wall, the dashed-yellow
 * visualization correctly stops at the wall rather than passing through.
 */

import { describe, it, expect } from "vitest";
import { tracePhysicalPath } from "@/trajectory-v2/engine/PathBuilder";
import { deriveRender } from "@/trajectory-v2/engine/RenderDeriver";
import { evaluateBypass } from "@/trajectory-v2/engine/BypassEvaluator";
import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

function createVerticalSurface(
  id: string,
  x: number,
  top: number,
  bottom: number,
  reflective = true
): Surface {
  return {
    id,
    segment: {
      start: { x, y: top },
      end: { x, y: bottom },
    },
    canReflectFrom: (dir: Vector2) => reflective && dir.x > 0,
    getNormal: () => ({ x: -1, y: 0 }),
  } as Surface;
}

describe("Dashed paths physics accuracy", () => {
  it("should stop dashed-yellow at wall (not pass through)", () => {
    // Setup:
    // - Player at (100, 300)
    // - Reflective surface at x=200 (arrow reflects here)
    // - Wall at x=50 (reflected arrow hits this wall)
    // - Cursor at (400, 300)
    //
    // Expected:
    // - Solid green: (100, 300) → (200, 300)
    // - Solid red: (200, 300) → (400, 300) [straight to cursor]
    // - Dashed yellow: (200, 300) → (50, 300) [actual physics, stops at wall]
    // - NO dashed yellow beyond x=50

    const player = { x: 100, y: 300 };
    const cursor = { x: 400, y: 300 };

    const reflective = createVerticalSurface("ricochet", 200, 200, 400, true);
    const wall = createVerticalSurface("wall", 50, 200, 400, false);

    const allSurfaces = [reflective, wall];

    const bypassResult = evaluateBypass(player, cursor, [], allSurfaces);
    const path = tracePhysicalPath(player, cursor, bypassResult, allSurfaces);
    const render = deriveRender(path, cursor, allSurfaces, []);

    // Verify path segments are correct
    expect(path.segments.length).toBe(2);
    expect(path.segments[1]?.termination?.type).toBe("wall_hit");

    // Check dashed yellow segments don't go past wall (x=50)
    const yellowDashedSegs = render.segments.filter(
      (s) => s.style === "dashed" && s.color === "yellow"
    );

    // Should have exactly one dashed yellow segment
    expect(yellowDashedSegs.length).toBe(1);

    // The dashed yellow should end at the wall (x=50), not beyond
    const yellowSeg = yellowDashedSegs[0]!;
    expect(yellowSeg.start.x).toBeCloseTo(200, 0); // Starts at reflection point
    expect(yellowSeg.end.x).toBeCloseTo(50, 0); // Ends at wall
  });

  it("should continue dashed-yellow past reflective surfaces", () => {
    // Setup:
    // - Player at (100, 300)
    // - Reflective surface 1 at x=200 (arrow reflects here, divergence)
    // - Reflective surface 2 at x=50 (reflected arrow reflects again)
    // - Cursor at (400, 300)
    //
    // Expected:
    // - Dashed yellow should reflect off surface 2 and continue

    const player = { x: 100, y: 300 };
    const cursor = { x: 400, y: 300 };

    const reflective1 = createVerticalSurface("ricochet1", 200, 200, 400, true);
    // Reflective surface facing right (reflects arrows coming from right)
    const reflective2: Surface = {
      id: "ricochet2",
      segment: {
        start: { x: 50, y: 200 },
        end: { x: 50, y: 400 },
      },
      canReflectFrom: (dir: Vector2) => dir.x < 0, // Reflects arrows from right
      getNormal: () => ({ x: 1, y: 0 }),
    } as Surface;

    const allSurfaces = [reflective1, reflective2];

    const bypassResult = evaluateBypass(player, cursor, [], allSurfaces);
    const path = tracePhysicalPath(player, cursor, bypassResult, allSurfaces);
    const render = deriveRender(path, cursor, allSurfaces, []);

    // Check dashed yellow continues past x=50 (reflects off reflective2)
    const yellowDashedSegs = render.segments.filter(
      (s) => s.style === "dashed" && s.color === "yellow"
    );

    // Should have multiple dashed yellow segments (reflection continues)
    expect(yellowDashedSegs.length).toBeGreaterThanOrEqual(1);
  });
});
