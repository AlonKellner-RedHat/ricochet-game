/**
 * Physical Path Invariant
 *
 * Verifies that an independent physical trace equals the joint calculation's
 * physical path (merged + physicalDivergent).
 *
 * Both traces use the EXACT SAME initial ray by definition:
 * - Source: Player position
 * - Target: Pre-reflected cursor (through non-bypassed surfaces only)
 *
 * Invariant: purePhysical === merged + physicalDivergent
 */

import type { Invariant, InvariantContext } from "../types";
import { assertNoViolations } from "../types";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";
import { calculateFullTrajectory } from "@/trajectory-v2/engine/FullTrajectoryCalculator";
import { createPhysicalStrategy } from "@/trajectory-v2/engine/HitDetectionStrategy";
import { createRayPropagator } from "@/trajectory-v2/engine/RayPropagator";
import { createReflectionCache } from "@/trajectory-v2/geometry/ReflectionCache";
import { traceWithStrategy } from "@/trajectory-v2/engine/TracePath";
import { createScreenBoundaryChain } from "@/trajectory-v2/geometry/ScreenBoundaries";
import {
  comparePaths,
  preReflectCursorThroughNonBypassed,
} from "./path-invariant-helpers";

/**
 * Verify physical path invariant.
 */
function verifyPhysicalPathInvariant(
  player: Vector2,
  cursor: Vector2,
  plannedSurfaces: readonly Surface[],
  allSurfaces: readonly Surface[]
): { passes: boolean; message: string } {
  const cache = createReflectionCache();

  // 1. Currently, the production code (calculateFullTrajectory) pre-reflects through
  // ALL planned surfaces, not just non-bypassed ones. For the invariant to match,
  // we use the same approach.
  //
  // TODO: Once production code is updated to use bypass-aware pre-reflection,
  // switch to: detectBypassAndPreReflect(player, cursor, plannedSurfaces, allSurfaces)
  const preReflectedCursor = preReflectCursorThroughNonBypassed(cursor, plannedSurfaces);

  // 3. Run joint calculation
  // NOTE: If the joint calculation doesn't use bypass-aware pre-reflection,
  // this invariant will detect that as a violation
  const fullResult = calculateFullTrajectory(
    player,
    cursor,
    plannedSurfaces,
    allSurfaces,
    cache
  );

  // 4. Build expected path: merged + physicalDivergent
  const expectedSegments = [...fullResult.merged, ...fullResult.physicalDivergent];

  // 5. Run independent physical trace with SAME initial ray
  const propagator = createRayPropagator(player, preReflectedCursor, cache);
  const combinedSurfaces = [...allSurfaces, ...plannedSurfaces];
  const physicalStrategy = createPhysicalStrategy(combinedSurfaces);

  // Run trace with no limits - range limit is the only limiter
  const purePhysicalTrace = traceWithStrategy(propagator, physicalStrategy, {});

  // 6. Compare paths
  const difference = comparePaths(purePhysicalTrace.segments, expectedSegments, cursor);

  if (difference) {
    return {
      passes: false,
      message: `Physical path mismatch: ${difference}`,
    };
  }

  return { passes: true, message: "Physical paths match" };
}

export const physicalPathInvariant: Invariant = {
  id: "physical-path-invariant",
  name: "Physical Path Invariant",
  description:
    "Independent physical trace must equal merged + physicalDivergent from joint calculation",

  assert: (context: InvariantContext): void => {
    const violations: string[] = [];

    // Get all surfaces from all chains, including screen boundaries
    const screenBoundaryChain = createScreenBoundaryChain(context.screenBounds);
    const allChains = [...context.scene.allChains, screenBoundaryChain];
    const allSurfaces = allChains.flatMap((c) => c.getSurfaces());

    // Get planned surfaces from context
    const plannedSurfaces = context.plannedSurfaces;

    const result = verifyPhysicalPathInvariant(
      context.player,
      context.cursor,
      plannedSurfaces,
      allSurfaces
    );

    if (!result.passes) {
      violations.push(result.message);
    }

    assertNoViolations("physical-path-invariant", violations);
  },
};
