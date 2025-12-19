import type { LineSegment, Vector2 } from "@/types";
import { Vec2 } from "./Vec2";

/**
 * Segment - Pure utility functions for line segment operations
 */
export const Segment = {
  /**
   * Create a line segment from two points
   */
  create(start: Vector2, end: Vector2): LineSegment {
    return { start, end };
  },

  /**
   * Get direction vector of segment (from start to end, normalized)
   */
  direction(segment: LineSegment): Vector2 {
    return Vec2.direction(segment.start, segment.end);
  },

  /**
   * Get normal vector (perpendicular to segment direction)
   * Points "left" when looking from start to end
   */
  normal(segment: LineSegment): Vector2 {
    const dir = Segment.direction(segment);
    return Vec2.perpendicular(dir);
  },

  /**
   * Get length of segment
   */
  length(segment: LineSegment): number {
    return Vec2.distance(segment.start, segment.end);
  },

  /**
   * Get midpoint of segment
   */
  midpoint(segment: LineSegment): Vector2 {
    return {
      x: (segment.start.x + segment.end.x) / 2,
      y: (segment.start.y + segment.end.y) / 2,
    };
  },
};
