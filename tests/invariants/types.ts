/**
 * Invariant Test Types
 *
 * Core types for the invariant testing framework.
 * This framework tests invariants across a cartesian product of:
 * - Scenes (surface configurations)
 * - Player positions (10x10 grid + special positions)
 * - Cursor positions (10x10 grid + special positions)
 * - Invariants (assertions that must always hold)
 */

import type { Surface } from "@/surfaces/Surface";
import type { SourcePoint } from "@/trajectory-v2/geometry/SourcePoint";
import type { SurfaceChain } from "@/trajectory-v2/geometry/SurfaceChain";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

/**
 * A planned surface sequence for testing reflections.
 * Each sequence represents a chain of surfaces the player intends to use.
 */
export interface PlannedSequence {
  /** Unique identifier for the sequence */
  readonly name: string;

  /** Surfaces in this sequence (can be empty for "no plan" baseline) */
  readonly surfaces: Surface[];
}

/**
 * A scene defines a surface configuration to test.
 */
export interface Scene {
  /** Unique identifier for the scene */
  readonly name: string;

  /** Human-readable description */
  readonly description: string;

  /** All surface chains in the scene */
  readonly allChains: SurfaceChain[];

  /** Surfaces that are part of the aiming plan (default sequence) */
  readonly plannedSurfaces: Surface[];

  /**
   * Multiple planned surface sequences to test.
   * Each scene should include at least [{ name: "empty", surfaces: [] }].
   * Chain scenes should include sequences for each chain surface.
   */
  readonly plannedSequences?: PlannedSequence[];
}

/**
 * A visibility stage represents visibility from a single origin.
 * Stage 0 is direct visibility from player.
 * Stages 1..N are visibility from reflected player images through each planned surface.
 */
export interface VisibilityStage {
  /** The origin point (player or reflected image) */
  readonly origin: Vector2;

  /** The visibility polygon vertices */
  readonly polygon: Vector2[];

  /** Surface ID this stage is reflected through, or null for player stage */
  readonly surfaceId: string | null;

  /** Stage index (0 = player, 1+ = reflections) */
  readonly stageIndex: number;

  /** Whether this is a windowed cone (reflection stage) */
  readonly isWindowed?: boolean;

  /** Surface ID excluded from obstacle checks (the reflection surface) */
  readonly excludeSurfaceId?: string | null;

  /** The window segment for windowed cones */
  readonly startLine?: { start: Vector2; end: Vector2 };

  /**
   * Source points with provenance for robust invariant checks.
   * Each source point corresponds to a polygon vertex and contains
   * type information (HitPoint, Endpoint, JunctionPoint, OriginPoint)
   * that enables provenance-based validation without epsilon tolerances.
   */
  readonly sourcePoints?: readonly SourcePoint[];
}

/**
 * Result of plan validity check.
 */
export interface PlanValidityResult {
  /** Whether the plan is valid (cursor reachable without divergence or bypass) */
  readonly isValid: boolean;

  /** Whether there is path divergence */
  readonly hasDivergence: boolean;

  /** Whether any surfaces are bypassed */
  readonly hasBypass: boolean;

  /** IDs of bypassed surfaces, if any */
  readonly bypassedSurfaceIds: string[];
}

/**
 * Context provided to each invariant assertion.
 */
export interface InvariantContext {
  /** The scene being tested */
  readonly scene: Scene;

  /** Player position */
  readonly player: Vector2;

  /** Cursor position */
  readonly cursor: Vector2;

  /** All visibility stages (player + reflections) */
  readonly visibilityStages: VisibilityStage[];

  /** Plan validity result */
  readonly planValidity: PlanValidityResult;

  /** Whether light reaches the cursor */
  readonly lightReachesCursor: boolean;

  /** Screen bounds */
  readonly screenBounds: ScreenBounds;

  /** Planned surfaces for the current sequence */
  readonly plannedSurfaces: Surface[];
}

/**
 * An invariant is an assertion that must always hold.
 */
export interface Invariant {
  /** Unique identifier */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Description of what this invariant checks */
  readonly description: string;

  /**
   * Assert the invariant holds for the given context.
   * Should throw (via expect()) if the invariant is violated.
   */
  readonly assert: (context: InvariantContext) => void;
}

/**
 * Screen bounds type.
 */
export interface ScreenBounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * Error thrown when an invariant is violated.
 * This allows invariants to be used both in vitest tests and standalone scripts.
 */
export class InvariantViolationError extends Error {
  constructor(
    public readonly invariantId: string,
    public readonly violations: string[]
  ) {
    super(`Invariant ${invariantId} violated:\n${violations.join("\n")}`);
    this.name = "InvariantViolationError";
  }
}

/**
 * Assert that no violations occurred.
 * Throws InvariantViolationError if there are violations.
 */
export function assertNoViolations(
  invariantId: string,
  violations: string[]
): void {
  if (violations.length > 0) {
    throw new InvariantViolationError(invariantId, violations);
  }
}

