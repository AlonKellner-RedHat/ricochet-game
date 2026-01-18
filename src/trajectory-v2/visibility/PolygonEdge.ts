/**
 * PolygonEdge - Abstraction for visibility polygon edges.
 *
 * A visibility polygon can be composed of:
 * - LineEdge: Standard straight line segments (surface boundaries)
 * - ArcEdge: Circular arc sections (range limit boundaries)
 *
 * This follows OCP: new edge types can be added without modifying existing code.
 */

import type { Vector2 } from "@/types";

/**
 * Edge types for discriminated union.
 */
export type EdgeType = "line" | "arc";

/**
 * Base properties shared by all edges.
 */
interface BaseEdge {
  readonly type: EdgeType;
  readonly from: Vector2;
  readonly to: Vector2;
}

/**
 * A straight line edge in a visibility polygon.
 */
export interface LineEdge extends BaseEdge {
  readonly type: "line";
}

/**
 * A circular arc edge in a visibility polygon.
 * Used for range limit boundaries.
 */
export interface ArcEdge extends BaseEdge {
  readonly type: "arc";
  readonly center: Vector2;
  readonly radius: number;
  /**
   * If true, arc goes counterclockwise from `from` to `to`.
   * If false (default), arc goes clockwise.
   */
  readonly anticlockwise: boolean;
}

/**
 * Union type for all edge types.
 * OCP: Add new edge types here without modifying rendering code.
 */
export type PolygonEdge = LineEdge | ArcEdge;

/**
 * Create a straight line edge.
 */
export function createLineEdge(from: Vector2, to: Vector2): LineEdge {
  return {
    type: "line",
    from,
    to,
  };
}

/**
 * Create a circular arc edge.
 *
 * @param from - Start point of the arc (must be on the circle)
 * @param to - End point of the arc (must be on the circle)
 * @param center - Center of the circle
 * @param radius - Radius of the circle
 * @param anticlockwise - If true, arc goes counterclockwise (default: false)
 */
export function createArcEdge(
  from: Vector2,
  to: Vector2,
  center: Vector2,
  radius: number,
  anticlockwise: boolean = false
): ArcEdge {
  return {
    type: "arc",
    from,
    to,
    center,
    radius,
    anticlockwise,
  };
}

/**
 * Type guard to check if an edge is a line edge.
 */
export function isLineEdge(edge: PolygonEdge): edge is LineEdge {
  return edge.type === "line";
}

/**
 * Type guard to check if an edge is an arc edge.
 */
export function isArcEdge(edge: PolygonEdge): edge is ArcEdge {
  return edge.type === "arc";
}
