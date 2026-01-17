/**
 * ReflectedTargets - Infrastructure for reflecting ray targets through surfaces.
 *
 * When computing visibility from a reflected origin, the targets (Endpoints, JunctionPoints)
 * should ALSO be reflected through the same surface(s). This ensures rays are cast
 * correctly in "image space" rather than world space.
 *
 * Key concepts:
 * - Original target: The actual Endpoint or JunctionPoint in world space
 * - Reflected target: The image of the target after reflection through surface(s)
 * - ReflectedTargetSet: A collection of reflected targets with O(1) lookup
 *
 * Uses ReflectionCache for memoization, ensuring:
 * - Points reflected for targets can be reused for other reflections
 * - Bidirectional identity is preserved
 */

import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { ReflectionCache } from "@/trajectory-v2/geometry/ReflectionCache";
import type { Endpoint, JunctionPoint, SourcePoint } from "@/trajectory-v2/geometry/SourcePoint";

/**
 * A target (Endpoint or JunctionPoint) that can be reflected.
 */
export type RayTarget = Endpoint | JunctionPoint;

/**
 * A reflected target with provenance information.
 */
export interface ReflectedTarget {
  /** Original target (Endpoint or JunctionPoint) */
  readonly original: RayTarget;

  /** Reflected position in image space */
  readonly reflected: Vector2;

  /** Surface reflected through (for provenance) */
  readonly throughSurface: Surface;
}

/**
 * A set of reflected targets with O(1) lookup.
 */
export interface ReflectedTargetSet {
  /**
   * Get reflected position for a target.
   * @param target The original target to look up
   * @returns The reflected position, or undefined if target not in set
   */
  getReflected(target: RayTarget): Vector2 | undefined;

  /** All reflected targets in the set */
  readonly targets: readonly ReflectedTarget[];
}

/**
 * Create a ReflectedTargetSet by reflecting all targets through a surface.
 *
 * @param originalTargets The targets to reflect (Endpoints and/or JunctionPoints)
 * @param surface The surface to reflect through
 * @param cache ReflectionCache for memoization
 * @returns A ReflectedTargetSet with all targets reflected
 */
export function createReflectedTargetSet(
  originalTargets: readonly RayTarget[],
  surface: Surface,
  cache: ReflectionCache
): ReflectedTargetSet {
  // Build reflected targets list
  const reflectedTargets: ReflectedTarget[] = [];

  // Map from target to its reflected position for O(1) lookup
  const targetToReflected = new Map<RayTarget, Vector2>();

  for (const target of originalTargets) {
    // Get the world-space position of this target
    const worldPos = target.computeXY();

    // Reflect through the surface using the cache
    const reflectedPos = cache.reflect(worldPos, surface);

    // Store the association
    const reflectedTarget: ReflectedTarget = {
      original: target,
      reflected: reflectedPos,
      throughSurface: surface,
    };

    reflectedTargets.push(reflectedTarget);
    targetToReflected.set(target, reflectedPos);
  }

  return {
    getReflected(target: RayTarget): Vector2 | undefined {
      return targetToReflected.get(target);
    },
    targets: reflectedTargets,
  };
}

/**
 * Chain multiple ReflectedTargetSets together for cascading reflections.
 *
 * When reflecting through multiple surfaces (S1, then S2, etc.), this allows
 * tracking the full chain of reflections.
 *
 * @param originalTargets The targets to reflect
 * @param surfaces The surfaces to reflect through in order
 * @param cache ReflectionCache for memoization
 * @returns Final ReflectedTargetSet after all reflections
 */
export function createCascadedReflectedTargetSet(
  originalTargets: readonly RayTarget[],
  surfaces: readonly Surface[],
  cache: ReflectionCache
): ReflectedTargetSet {
  if (surfaces.length === 0) {
    // No reflections - return identity mapping
    const targets: ReflectedTarget[] = originalTargets.map((target) => ({
      original: target,
      reflected: target.computeXY(),
      throughSurface: undefined as unknown as Surface, // No surface
    }));

    const targetToReflected = new Map<RayTarget, Vector2>();
    for (const t of targets) {
      targetToReflected.set(t.original, t.reflected);
    }

    return {
      getReflected: (target) => targetToReflected.get(target),
      targets,
    };
  }

  // Reflect through each surface in sequence
  let currentPositions = new Map<RayTarget, Vector2>();
  for (const target of originalTargets) {
    currentPositions.set(target, target.computeXY());
  }

  let lastSurface: Surface = surfaces[0]!;

  for (const surface of surfaces) {
    lastSurface = surface;
    const newPositions = new Map<RayTarget, Vector2>();

    for (const [target, pos] of currentPositions) {
      const reflected = cache.reflect(pos, surface);
      newPositions.set(target, reflected);
    }

    currentPositions = newPositions;
  }

  // Build final ReflectedTargetSet
  const reflectedTargets: ReflectedTarget[] = [];
  for (const [target, reflected] of currentPositions) {
    reflectedTargets.push({
      original: target,
      reflected,
      throughSurface: lastSurface,
    });
  }

  return {
    getReflected: (target) => currentPositions.get(target),
    targets: reflectedTargets,
  };
}
