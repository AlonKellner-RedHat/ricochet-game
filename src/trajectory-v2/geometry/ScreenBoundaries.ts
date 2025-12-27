/**
 * Screen Boundaries as Surfaces
 *
 * Screen edges are represented as Surface objects, enabling:
 * - Unified treatment of all obstacles (surfaces + screen edges)
 * - Screen corners as Endpoints
 * - Screen edge hits as HitPoints
 *
 * This eliminates the need for a separate ScreenBoundaryPoint type.
 */

import type { HitResult, SurfaceVisualProperties, Vector2 } from "@/types";
import type { Surface } from "@/surfaces/Surface";
import { SurfaceChain } from "./SurfaceChain";

// =============================================================================
// SCREEN BOUNDARY SURFACE
// =============================================================================

/**
 * A surface representing a screen boundary edge.
 * Implements the Surface interface for unified obstacle handling.
 */
class ScreenBoundarySurface implements Surface {
  readonly surfaceType = "screen-boundary";

  constructor(
    readonly id: string,
    readonly segment: { start: Vector2; end: Vector2 },
    private readonly normal: Vector2
  ) {}

  onArrowHit(_hitPoint: Vector2, _velocity: Vector2): HitResult {
    // Screen boundaries block arrows - they don't reflect
    return { type: "blocked" };
  }

  isPlannable(): boolean {
    // Screen boundaries are not plannable
    return false;
  }

  getVisualProperties(): SurfaceVisualProperties {
    // Screen boundaries are invisible
    return {
      color: 0x000000,
      alpha: 0,
      lineWidth: 0,
    };
  }

  getNormal(): Vector2 {
    return this.normal;
  }

  canReflectFrom(_incomingDirection: Vector2): boolean {
    // Screen boundaries don't reflect
    return false;
  }
}

// =============================================================================
// SCREEN BOUNDS TYPE
// =============================================================================

/**
 * Screen bounds definition.
 */
export interface ScreenBoundsConfig {
  readonly minX: number;
  readonly maxX: number;
  readonly minY: number;
  readonly maxY: number;
}

/**
 * Collection of screen boundary surfaces.
 */
export interface ScreenBoundaries {
  readonly top: Surface;
  readonly right: Surface;
  readonly bottom: Surface;
  readonly left: Surface;
  /** All four boundary surfaces as an array */
  readonly all: readonly Surface[];
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create screen boundary surfaces from bounds configuration.
 *
 * The boundaries form a clockwise rectangle:
 * - top: left to right (minX,minY → maxX,minY)
 * - right: top to bottom (maxX,minY → maxX,maxY)
 * - bottom: right to left (maxX,maxY → minX,maxY)
 * - left: bottom to top (minX,maxY → minX,minY)
 *
 * Normals point INWARD (toward the center of the screen).
 */
export function createScreenBoundaries(bounds: ScreenBoundsConfig): ScreenBoundaries {
  const { minX, maxX, minY, maxY } = bounds;

  const top = new ScreenBoundarySurface(
    "screen-top",
    { start: { x: minX, y: minY }, end: { x: maxX, y: minY } },
    { x: 0, y: 1 } // Normal points down (into screen)
  );

  const right = new ScreenBoundarySurface(
    "screen-right",
    { start: { x: maxX, y: minY }, end: { x: maxX, y: maxY } },
    { x: -1, y: 0 } // Normal points left (into screen)
  );

  const bottom = new ScreenBoundarySurface(
    "screen-bottom",
    { start: { x: maxX, y: maxY }, end: { x: minX, y: maxY } },
    { x: 0, y: -1 } // Normal points up (into screen)
  );

  const left = new ScreenBoundarySurface(
    "screen-left",
    { start: { x: minX, y: maxY }, end: { x: minX, y: minY } },
    { x: 1, y: 0 } // Normal points right (into screen)
  );

  return {
    top,
    right,
    bottom,
    left,
    all: [top, right, bottom, left],
  };
}

/**
 * Check if a surface is a screen boundary.
 */
export function isScreenBoundarySurface(surface: Surface): boolean {
  return surface.id.startsWith("screen-");
}

/**
 * Get screen corner points as coordinates.
 * Corners are where two screen boundaries meet.
 */
export function getScreenCorners(
  bounds: ScreenBoundsConfig
): { topLeft: Vector2; topRight: Vector2; bottomRight: Vector2; bottomLeft: Vector2 } {
  return {
    topLeft: { x: bounds.minX, y: bounds.minY },
    topRight: { x: bounds.maxX, y: bounds.minY },
    bottomRight: { x: bounds.maxX, y: bounds.maxY },
    bottomLeft: { x: bounds.minX, y: bounds.maxY },
  };
}

// =============================================================================
// SURFACE CHAIN VERSION
// =============================================================================

/**
 * Edge names in clockwise order from top-left.
 */
const EDGE_NAMES = ["top", "right", "bottom", "left"] as const;

/**
 * Inward-pointing normals for each edge (clockwise from top).
 */
const INWARD_NORMALS: readonly Vector2[] = [
  { x: 0, y: 1 },   // top: points down
  { x: -1, y: 0 },  // right: points left
  { x: 0, y: -1 },  // bottom: points up
  { x: 1, y: 0 },   // left: points right
];

/**
 * Create screen boundaries as a SurfaceChain.
 *
 * The chain is a closed loop of 4 vertices (corners) producing 4 surfaces (edges).
 * Vertices are in clockwise order: top-left → top-right → bottom-right → bottom-left.
 *
 * Benefits over the object-based version:
 * - Corners are JunctionPoints (proper type-based detection)
 * - Unified handling with game surface chains
 * - Consistent vertex/surface ordering
 */
export function createScreenBoundaryChain(bounds: ScreenBoundsConfig): SurfaceChain {
  const { minX, maxX, minY, maxY } = bounds;

  // Vertices in clockwise order from top-left
  const vertices: Vector2[] = [
    { x: minX, y: minY }, // top-left
    { x: maxX, y: minY }, // top-right
    { x: maxX, y: maxY }, // bottom-right
    { x: minX, y: maxY }, // bottom-left
  ];

  return new SurfaceChain({
    vertices,
    isClosed: true,
    surfaceFactory: (index, start, end) => {
      return new ScreenBoundarySurface(
        `screen-${EDGE_NAMES[index]}`,
        { start, end },
        INWARD_NORMALS[index]
      );
    },
  });
}

