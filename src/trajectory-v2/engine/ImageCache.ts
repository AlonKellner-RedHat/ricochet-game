/**
 * ImageCache - Builds and caches reflected image sequences
 *
 * Implements the core image reflection mechanism with full provenance tracking.
 *
 * First Principles:
 * - Forward images: Player reflected through surfaces in order
 * - Backward images: Cursor reflected through surfaces in REVERSE order
 * - Each image stores its source position and surface
 */

import { reflectPointThroughLine } from "@/trajectory-v2/geometry/GeometryOps";
import type { Vector2 } from "@/trajectory-v2/geometry/types";
import type { Surface } from "@/surfaces/Surface";
import type { ImageSequence, ReflectedImage } from "./types";

/**
 * Build forward image sequence (for player position).
 *
 * Reflects the origin through each surface in order:
 *   P₀ = origin
 *   P₁ = reflect(P₀, surface[0])
 *   P₂ = reflect(P₁, surface[1])
 *   ...
 *
 * @param origin The starting position (e.g., player)
 * @param surfaces The surfaces to reflect through, in order
 * @returns Image sequence with full provenance
 */
export function buildForwardImages(
  origin: Vector2,
  surfaces: readonly Surface[]
): ImageSequence {
  const images: ReflectedImage[] = [];
  let currentPosition = origin;
  let sourcePosition = origin;
  let sourceSurface: Surface | null = null;

  for (let i = 0; i < surfaces.length; i++) {
    const surface = surfaces[i]!;
    const segment = surface.segment;

    // Reflect current position through the surface
    const reflectedPosition = reflectPointThroughLine(
      currentPosition,
      segment.start,
      segment.end
    );

    // Store the image with provenance
    images.push({
      position: reflectedPosition,
      source: {
        position: sourcePosition,
        surface: sourceSurface,
      },
      depth: i + 1,
    });

    // Update for next iteration
    sourcePosition = currentPosition;
    sourceSurface = surface;
    currentPosition = reflectedPosition;
  }

  return {
    original: origin,
    images,
    surfaces,
  };
}

/**
 * Build backward image sequence (for cursor position).
 *
 * Reflects the origin through surfaces in REVERSE order:
 *   C₀ = origin (cursor)
 *   C₁ = reflect(C₀, surface[n-1])
 *   C₂ = reflect(C₁, surface[n-2])
 *   ...
 *
 * This is used for planned path calculation:
 * Ray from P_i to C_{n-i} intersects surface[i]
 *
 * @param origin The starting position (e.g., cursor)
 * @param surfaces The surfaces to reflect through (will be reversed internally)
 * @returns Image sequence with full provenance
 */
export function buildBackwardImages(
  origin: Vector2,
  surfaces: readonly Surface[]
): ImageSequence {
  const images: ReflectedImage[] = [];
  let currentPosition = origin;
  let sourcePosition = origin;
  let sourceSurface: Surface | null = null;

  // Process surfaces in reverse order
  for (let i = surfaces.length - 1; i >= 0; i--) {
    const surface = surfaces[i]!;
    const segment = surface.segment;

    // Reflect current position through the surface
    const reflectedPosition = reflectPointThroughLine(
      currentPosition,
      segment.start,
      segment.end
    );

    // Store the image with provenance
    images.push({
      position: reflectedPosition,
      source: {
        position: sourcePosition,
        surface: sourceSurface,
      },
      depth: surfaces.length - i,
    });

    // Update for next iteration
    sourcePosition = currentPosition;
    sourceSurface = surface;
    currentPosition = reflectedPosition;
  }

  return {
    original: origin,
    images,
    surfaces,
  };
}

/**
 * Get the image at a specific depth from a sequence.
 *
 * @param sequence The image sequence
 * @param depth The depth (0 = original, 1+ = reflected)
 * @returns The position at that depth
 */
export function getImageAtDepth(
  sequence: ImageSequence,
  depth: number
): Vector2 {
  if (depth === 0) {
    return sequence.original;
  }
  if (depth > sequence.images.length) {
    throw new Error(
      `Invalid depth ${depth}, max is ${sequence.images.length}`
    );
  }
  return sequence.images[depth - 1]!.position;
}

/**
 * Get the corresponding cursor image for a given player image depth.
 *
 * For planned path with N surfaces:
 *   Ray from P_i to C_{N-i} intersects surface[i]
 *
 * When building the ray for surface[i]:
 *   - Player image depth: i (P_0 = original, P_1 = first reflection)
 *   - Cursor image depth: N - i
 *
 * @param playerImages Forward image sequence
 * @param cursorImages Backward image sequence
 * @param surfaceIndex The surface index (0-based)
 * @returns The cursor image position for this ray
 */
export function getCursorImageForSurface(
  playerImages: ImageSequence,
  cursorImages: ImageSequence,
  surfaceIndex: number
): Vector2 {
  const n = playerImages.surfaces.length;
  const cursorDepth = n - surfaceIndex;
  return getImageAtDepth(cursorImages, cursorDepth);
}

/**
 * Get the player image for a given surface.
 *
 * @param playerImages Forward image sequence
 * @param surfaceIndex The surface index (0-based)
 * @returns The player image position for this ray
 */
export function getPlayerImageForSurface(
  playerImages: ImageSequence,
  surfaceIndex: number
): Vector2 {
  return getImageAtDepth(playerImages, surfaceIndex);
}

/**
 * Verify that a reflection is reversible (first principle check).
 *
 * @param image The reflected image
 * @param tolerance Maximum allowed error
 * @returns True if reflect(reflect(P)) ≈ P
 */
export function verifyReflectionReversibility(
  image: ReflectedImage,
  tolerance = 1e-9
): boolean {
  if (!image.source.surface) {
    return true; // Original position, nothing to verify
  }

  const segment = image.source.surface.segment;
  const doubleReflected = reflectPointThroughLine(
    image.position,
    segment.start,
    segment.end
  );

  const dx = doubleReflected.x - image.source.position.x;
  const dy = doubleReflected.y - image.source.position.y;

  return dx * dx + dy * dy < tolerance * tolerance;
}

