/**
 * ConeSection - Angular sector operations for cone propagation visibility
 *
 * A cone section represents a "slice" of light emanating from a point source.
 * Operations: block (remove blocked portion), trim (constrain to surface),
 * merge (combine adjacent sections), reflect (mirror through surface).
 *
 * All angles are in radians, measured counter-clockwise from positive X-axis.
 * All sections are stored in normalized form: startAngle < endAngle.
 */

import type { Vector2 } from "@/trajectory-v2/geometry/types";

const TWO_PI = 2 * Math.PI;

/**
 * A single angular sector (cone section).
 * Represents all rays from origin between startAngle and endAngle.
 * INVARIANT: startAngle < endAngle, both in [0, 2π)
 */
export interface ConeSection {
  /** Start angle in radians (counter-clockwise from +X) */
  readonly startAngle: number;
  /** End angle in radians (counter-clockwise from +X) */
  readonly endAngle: number;
}

/**
 * A cone is a collection of non-overlapping angular sections.
 * Multiple sections can exist when obstacles split the cone.
 */
export type Cone = ConeSection[];

/**
 * Normalize an angle to [0, 2π).
 */
export function normalizeAngle(angle: number): number {
  let normalized = angle % TWO_PI;
  if (normalized < 0) normalized += TWO_PI;
  return normalized;
}

/**
 * Calculate the angle from origin to a point.
 */
export function angleToPoint(origin: Vector2, point: Vector2): number {
  return normalizeAngle(Math.atan2(point.y - origin.y, point.x - origin.x));
}

/**
 * Check if an angle is within a cone section.
 * Assumes section is in normalized form (start < end, no wrap).
 */
export function isAngleInSection(angle: number, section: ConeSection): boolean {
  // Full cone (360°) includes all angles
  if (section.endAngle - section.startAngle >= TWO_PI - 0.001) {
    return true;
  }
  const a = normalizeAngle(angle);
  return a >= section.startAngle && a <= section.endAngle;
}

/**
 * Calculate the angular span of a section (always positive).
 */
export function sectionSpan(section: ConeSection): number {
  return section.endAngle - section.startAngle;
}

/**
 * Create a full cone (360°).
 */
export function fullCone(): Cone {
  return [{ startAngle: 0, endAngle: TWO_PI - 0.0001 }];
}

/**
 * Create an empty cone (no valid angles).
 */
export function emptyCone(): Cone {
  return [];
}

/**
 * Create a cone section from origin looking at a segment.
 * Returns the angular range that "sees" the segment.
 */
export function sectionFromSegment(
  origin: Vector2,
  segStart: Vector2,
  segEnd: Vector2
): ConeSection | null {
  const angle1 = angleToPoint(origin, segStart);
  const angle2 = angleToPoint(origin, segEnd);

  // Put in order (smaller first)
  const minAngle = Math.min(angle1, angle2);
  const maxAngle = Math.max(angle1, angle2);

  // Check if the segment wraps around 0
  // If the span is > π, it means we should take the "other way around"
  if (maxAngle - minAngle > Math.PI) {
    // The segment spans across 0, but we can't represent that in our simple model
    // For now, return the larger portion
    return { startAngle: maxAngle, endAngle: minAngle + TWO_PI };
  }

  return { startAngle: minAngle, endAngle: maxAngle };
}

/**
 * Subtract one section from another, returning 0-2 sections.
 */
export function subtractFromSection(
  section: ConeSection,
  blockStart: number,
  blockEnd: number
): ConeSection[] {
  // Normalize block range
  const bStart = Math.min(blockStart, blockEnd);
  const bEnd = Math.max(blockStart, blockEnd);

  const sStart = section.startAngle;
  const sEnd = section.endAngle;

  // No overlap cases
  if (bEnd <= sStart || bStart >= sEnd) {
    return [section];
  }

  // Full overlap - section is completely blocked
  if (bStart <= sStart && bEnd >= sEnd) {
    return [];
  }

  // Partial overlaps
  const result: ConeSection[] = [];

  // Left part (before block)
  if (bStart > sStart) {
    result.push({ startAngle: sStart, endAngle: bStart });
  }

  // Right part (after block)
  if (bEnd < sEnd) {
    result.push({ startAngle: bEnd, endAngle: sEnd });
  }

  return result;
}

/**
 * Block a cone by an obstacle segment.
 * Removes the angular range where the obstacle is visible from origin.
 */
export function blockCone(
  cone: Cone,
  origin: Vector2,
  obstacleStart: Vector2,
  obstacleEnd: Vector2
): Cone {
  const blockSection = sectionFromSegment(origin, obstacleStart, obstacleEnd);
  if (!blockSection) return cone;

  const result: Cone = [];
  for (const section of cone) {
    const remaining = subtractFromSection(
      section,
      blockSection.startAngle,
      blockSection.endAngle
    );
    result.push(...remaining);
  }
  return result;
}

/**
 * Trim a cone to only the angles that pass through a surface segment (window).
 * This is the "passing through window" operation.
 */
export function trimCone(
  cone: Cone,
  origin: Vector2,
  windowStart: Vector2,
  windowEnd: Vector2
): Cone {
  const windowSection = sectionFromSegment(origin, windowStart, windowEnd);
  if (!windowSection) return emptyCone();

  const result: Cone = [];
  for (const section of cone) {
    const intersection = intersectSections(section, windowSection);
    if (intersection && sectionSpan(intersection) > 0.0001) {
      result.push(intersection);
    }
  }
  return result;
}

/**
 * Intersect two cone sections, returning the overlapping portion.
 */
export function intersectSections(
  a: ConeSection,
  b: ConeSection
): ConeSection | null {
  const start = Math.max(a.startAngle, b.startAngle);
  const end = Math.min(a.endAngle, b.endAngle);

  if (start < end) {
    return { startAngle: start, endAngle: end };
  }
  return null;
}

/**
 * Reflect a cone through a line (surface).
 * All angles are mirrored as if the line were a mirror.
 */
export function reflectCone(
  cone: Cone,
  lineStart: Vector2,
  lineEnd: Vector2
): Cone {
  // Calculate line angle
  const lineAngle = Math.atan2(lineEnd.y - lineStart.y, lineEnd.x - lineStart.x);

  return cone.map((section) => {
    // Reflect angles through the line: reflected = 2*lineAngle - original
    const newStart = normalizeAngle(2 * lineAngle - section.endAngle);
    const newEnd = normalizeAngle(2 * lineAngle - section.startAngle);

    // Ensure proper ordering
    const minA = Math.min(newStart, newEnd);
    const maxA = Math.max(newStart, newEnd);

    // Handle wrap-around
    if (maxA - minA > Math.PI) {
      // Return the larger portion for simplicity
      return { startAngle: 0, endAngle: TWO_PI - 0.0001 };
    }

    return { startAngle: minA, endAngle: maxA };
  });
}

/**
 * Merge adjacent/overlapping cone sections.
 * Simplifies the cone representation.
 */
export function mergeSections(cone: Cone): Cone {
  if (cone.length <= 1) return cone;

  // Sort by start angle
  const sorted = [...cone].sort((a, b) => a.startAngle - b.startAngle);

  const merged: Cone = [];
  let current = sorted[0]!;

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]!;

    // Check if they overlap or are adjacent
    if (next.startAngle <= current.endAngle + 0.01) {
      // Merge: extend current to include next
      current = {
        startAngle: current.startAngle,
        endAngle: Math.max(current.endAngle, next.endAngle),
      };
    } else {
      merged.push(current);
      current = next;
    }
  }
  merged.push(current);

  return merged;
}

/**
 * Check if a cone is empty (no valid angles).
 */
export function isConeEmpty(cone: Cone): boolean {
  return cone.length === 0 || cone.every((s) => sectionSpan(s) < 0.0001);
}

/**
 * Get the total angular coverage of a cone.
 */
export function coneCoverage(cone: Cone): number {
  return cone.reduce((sum, section) => sum + sectionSpan(section), 0);
}
