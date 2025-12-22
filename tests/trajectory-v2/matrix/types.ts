/**
 * Matrix Test Framework Types
 *
 * Defines interfaces for the matrix-based first principles testing system.
 * This enables two-dimensional extensibility:
 * - Add new test setups
 * - Add new first principle assertions
 */

import type { Surface } from "@/surfaces/Surface";
import type { AlignmentResult, PathResult } from "@/trajectory-v2/engine/types";
import type { Vector2 } from "@/trajectory-v2/geometry/types";

/**
 * A test setup describes a specific scenario to test.
 * Each setup will be tested against ALL first principle assertions.
 */
export interface TestSetup {
  /** Unique identifier for the setup */
  readonly name: string;

  /** Human-readable description of what this setup tests */
  readonly description: string;

  /** Player/arrow starting position */
  readonly player: Vector2;

  /** Cursor/aim position */
  readonly cursor: Vector2;

  /** Surfaces that are part of the aiming plan */
  readonly plannedSurfaces: readonly Surface[];

  /** All surfaces in the scene (walls, ricochet surfaces, etc.) */
  readonly allSurfaces: readonly Surface[];

  /** Optional expected outcomes for validation */
  readonly expected?: {
    /** Whether the arrow should reach the cursor */
    readonly reachesCursor?: boolean;
    /** ID of surface that blocks the path, if any */
    readonly blockedBy?: string;
    /** Whether planned and actual paths should be aligned */
    readonly isAligned?: boolean;
  };

  /** Optional tags for filtering/categorization */
  readonly tags?: readonly string[];
}

/**
 * Render call captured during visualization.
 */
export interface RenderCall {
  readonly type: "lineStyle" | "lineBetween" | "clear";
  readonly color?: number;
  readonly x1?: number;
  readonly y1?: number;
  readonly x2?: number;
  readonly y2?: number;
}

/**
 * Results from executing a test setup.
 * Contains all computed data needed for assertions.
 */
export interface TestResults {
  /** The computed planned path */
  readonly plannedPath: PathResult;

  /** The computed actual path */
  readonly actualPath: PathResult;

  /** Alignment between planned and actual */
  readonly alignment: AlignmentResult;

  /** All render calls made during visualization */
  readonly renderCalls: readonly RenderCall[];

  /** Arrow waypoints (path + projection) */
  readonly arrowWaypoints: readonly Vector2[];
}

/**
 * A first principle assertion that can be applied to any test setup.
 */
export interface FirstPrincipleAssertion {
  /** Unique identifier */
  readonly id: string;

  /** Principle number from documentation (e.g., "1.1", "2.2") */
  readonly principle: string;

  /** Human-readable description of what this assertion checks */
  readonly description: string;

  /**
   * Assert the principle holds for the given setup and results.
   * Should throw (via expect()) if the principle is violated.
   */
  readonly assert: (setup: TestSetup, results: TestResults) => void;
}

/**
 * Helper type for creating surfaces in test setups.
 */
export interface SurfaceConfig {
  readonly id: string;
  readonly start: Vector2;
  readonly end: Vector2;
  readonly canReflect: boolean;
}

/**
 * Configuration for parameterized setup generation.
 */
export interface SetupGeneratorConfig {
  /** Base name prefix for generated setups */
  readonly namePrefix: string;

  /** Base player position */
  readonly basePlayer: Vector2;

  /** Parameter variations to generate */
  readonly variations: readonly SetupVariation[];
}

/**
 * A single variation in a parameterized setup.
 */
export interface SetupVariation {
  /** Suffix for the setup name */
  readonly nameSuffix: string;

  /** Description of this variation */
  readonly description: string;

  /** Cursor position for this variation */
  readonly cursor: Vector2;

  /** Surfaces for this variation */
  readonly surfaces: readonly SurfaceConfig[];

  /** Which surfaces are planned */
  readonly plannedSurfaceIds: readonly string[];
}

