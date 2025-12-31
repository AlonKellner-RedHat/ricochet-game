/**
 * SurfaceChain: Vertex-Defined Surface Connectivity
 *
 * A chain is defined by its vertices. Surfaces are derived from adjacent vertex pairs.
 *
 * Key properties:
 * - Open chains: N vertices → N-1 surfaces, 2 Endpoints (first/last vertex)
 * - Closed chains: N vertices → N surfaces, 0 Endpoints (all JunctionPoints)
 *
 * Design Principles:
 * - Single Source of Truth: Vertices define the chain, surfaces are computed
 * - OCP: New chain types extend without modifying base
 * - Lazy Computation: Surfaces are computed once on first access
 */

import { RicochetSurface } from "@/surfaces/RicochetSurface";
import type { Surface } from "@/surfaces/Surface";
import { WallSurface } from "@/surfaces/WallSurface";
import { Endpoint, SourcePoint } from "./SourcePoint";
import type { Vector2 } from "./types";

// =============================================================================
// ORIENTATION INFO (for canLightPassWithOrientations - avoids circular deps)
// =============================================================================

/**
 * Minimal orientation info needed for junction pass-through check.
 * Matches the crossProduct field from SurfaceOrientation in ConeProjectionV2.
 */
export interface OrientationInfo {
  readonly crossProduct: number;
}

// =============================================================================
// TYPES
// =============================================================================

/**
 * Configuration for creating a SurfaceChain.
 */
export interface ChainConfig {
  /** The vertices defining the chain path */
  readonly vertices: readonly Vector2[];
  /** If true, the chain loops back (last vertex connects to first) */
  readonly isClosed: boolean;
  /** Factory to create surfaces from vertex pairs */
  readonly surfaceFactory: SurfaceFactory;
}

/**
 * Factory function to create a Surface from two adjacent vertices.
 * @param index - The index of this surface in the chain (0-based)
 * @param start - The start vertex position
 * @param end - The end vertex position
 */
export type SurfaceFactory = (index: number, start: Vector2, end: Vector2) => Surface;

/**
 * A vertex in the chain with its position and index.
 */
export interface ChainVertex {
  readonly position: Vector2;
  readonly index: number;
  readonly chain: SurfaceChain;
}

// =============================================================================
// JUNCTION POINT (for connected vertices) - extends SourcePoint
// =============================================================================

/**
 * Represents a junction where two surfaces meet in a chain.
 * All internal vertices of open chains, and ALL vertices of closed chains.
 *
 * Extends SourcePoint to enable consistent handling with Endpoints in:
 * - Visibility polygon vertex sorting
 * - Ray pair tracking
 * - Deduplication
 */
export class JunctionPoint extends SourcePoint {
  readonly type = "junction" as const;

  constructor(
    readonly chain: SurfaceChain,
    readonly vertexIndex: number
  ) {
    super();
  }

  /**
   * Compute the actual coordinates of this junction.
   */
  computeXY(): Vector2 {
    return this.chain.getVertex(this.vertexIndex).position;
  }

  /**
   * Check if this junction is on the given surface.
   * Returns true if the surface is either the "before" or "after" surface.
   */
  isOnSurface(surface: Surface): boolean {
    return (
      this.getSurfaceBefore().id === surface.id ||
      this.getSurfaceAfter().id === surface.id
    );
  }

  /**
   * Check equality with another SourcePoint.
   * Two JunctionPoints are equal if they're from the same chain and vertex.
   */
  equals(other: SourcePoint): boolean {
    return (
      other instanceof JunctionPoint &&
      this.chain.id === other.chain.id &&
      this.vertexIndex === other.vertexIndex
    );
  }

  /**
   * Get a unique key for this junction.
   */
  getKey(): string {
    return `junction:${this.chain.id}:${this.vertexIndex}`;
  }

  /**
   * Get the surface BEFORE this junction (ending at this vertex).
   */
  getSurfaceBefore(): Surface {
    const surfaces = this.chain.getSurfaces();
    let surface: Surface | undefined;
    if (this.chain.isClosed) {
      // In closed chain, vertex 0's "before" is the last surface
      const beforeIndex = (this.vertexIndex - 1 + surfaces.length) % surfaces.length;
      surface = surfaces[beforeIndex];
    } else {
      // In open chain, the before surface is at index (vertexIndex - 1)
      surface = surfaces[this.vertexIndex - 1];
    }
    if (!surface) throw new Error("Junction has no surface before");
    return surface;
  }

  /**
   * Get the surface AFTER this junction (starting at this vertex).
   */
  getSurfaceAfter(): Surface {
    const surfaces = this.chain.getSurfaces();
    let surface: Surface | undefined;
    if (this.chain.isClosed) {
      // In closed chain, wrap around
      surface = surfaces[this.vertexIndex % surfaces.length];
    } else {
      // In open chain, the after surface is at index (vertexIndex)
      surface = surfaces[this.vertexIndex];
    }
    if (!surface) throw new Error("Junction has no surface after");
    return surface;
  }

  /**
   * Check if light from the origin can pass through this junction.
   *
   * Uses pre-calculated surface orientations (provenance-based, no recalculation).
   *
   * Light PASSES if surfaces have OPPOSITE orientations relative to origin:
   * - One surface faces toward origin (crossProduct > 0)
   * - Other surface faces away from origin (crossProduct < 0)
   *
   * Light is BLOCKED if surfaces have SAME orientation:
   * - Both surfaces face toward origin (both crossProduct > 0)
   * - Both surfaces face away from origin (both crossProduct < 0)
   *
   * @param surfaceOrientations Map from surface ID to pre-calculated orientation
   * @returns true if light can pass through, false if blocked
   */
  canLightPassWithOrientations(surfaceOrientations: Map<string, OrientationInfo>): boolean {
    const orientBefore = surfaceOrientations.get(this.getSurfaceBefore().id);
    const orientAfter = surfaceOrientations.get(this.getSurfaceAfter().id);

    // If orientations are missing, block light (safe default)
    if (!orientBefore || !orientAfter) return false;

    // OPPOSITE signs = light passes (one front, one back)
    // SAME signs = light blocked (both front or both back)
    return (orientBefore.crossProduct > 0) !== (orientAfter.crossProduct > 0);
  }
}

// =============================================================================
// SURFACE CHAIN
// =============================================================================

let chainIdCounter = 0;

/**
 * A chain of connected surfaces defined by vertices.
 *
 * Surfaces are lazily computed from adjacent vertex pairs.
 */
export class SurfaceChain {
  /** Unique identifier for this chain */
  readonly id: string;
  /** Whether this chain loops back to the start */
  readonly isClosed: boolean;
  /** The vertices defining this chain */
  private readonly _vertices: readonly ChainVertex[];
  /** Factory to create surfaces */
  private readonly _surfaceFactory: SurfaceFactory;
  /** Cached surfaces (lazy computed) */
  private _surfaces: readonly Surface[] | null = null;
  /** Cached junction points */
  private _junctionPoints: readonly JunctionPoint[] | null = null;
  /** Cached endpoints (null for closed chains) */
  private _endpoints: readonly [Endpoint, Endpoint] | null | undefined = undefined;

  constructor(config: ChainConfig) {
    if (config.vertices.length < 2) {
      throw new Error("SurfaceChain requires at least 2 vertices");
    }

    this.id = `chain-${chainIdCounter++}`;
    this.isClosed = config.isClosed;
    this._surfaceFactory = config.surfaceFactory;

    // Create ChainVertex objects
    this._vertices = config.vertices.map((pos, index) => ({
      position: { x: pos.x, y: pos.y },
      index,
      chain: this,
    }));
  }

  /**
   * Get the number of vertices in this chain.
   */
  get vertexCount(): number {
    return this._vertices.length;
  }

  /**
   * Get a vertex by index.
   */
  getVertex(index: number): ChainVertex {
    const vertex = this._vertices[index];
    if (!vertex) {
      throw new Error(`Vertex index ${index} out of bounds [0, ${this._vertices.length - 1}]`);
    }
    return vertex;
  }

  /**
   * Get all surfaces in this chain.
   * Surfaces are lazily computed and cached.
   */
  getSurfaces(): readonly Surface[] {
    if (this._surfaces === null) {
      this._surfaces = this._computeSurfaces();
    }
    return this._surfaces;
  }

  /**
   * Compute surfaces from vertex pairs.
   */
  private _computeSurfaces(): readonly Surface[] {
    const surfaces: Surface[] = [];
    const n = this._vertices.length;

    // Number of surfaces: N-1 for open chains, N for closed chains
    const surfaceCount = this.isClosed ? n : n - 1;

    for (let i = 0; i < surfaceCount; i++) {
      const startVertex = this._vertices[i];
      const endVertex = this._vertices[(i + 1) % n];
      if (!startVertex || !endVertex) {
        throw new Error("Invalid vertex index in chain");
      }
      surfaces.push(this._surfaceFactory(i, startVertex.position, endVertex.position));
    }

    return surfaces;
  }

  /**
   * Get the endpoints of this chain.
   * Returns null for closed chains (no endpoints).
   * Returns [startEndpoint, endEndpoint] for open chains, using Endpoint from SourcePoint.
   */
  getEndpoints(): readonly [Endpoint, Endpoint] | null {
    if (this._endpoints === undefined) {
      if (this.isClosed) {
        this._endpoints = null;
      } else {
        const surfaces = this.getSurfaces();
        const firstSurface = surfaces[0];
        const lastSurface = surfaces[surfaces.length - 1];
        if (!firstSurface || !lastSurface) {
          throw new Error("Chain has no surfaces for endpoints");
        }
        // Chain start = first surface's start endpoint
        // Chain end = last surface's end endpoint
        this._endpoints = [new Endpoint(firstSurface, "start"), new Endpoint(lastSurface, "end")];
      }
    }
    return this._endpoints;
  }

  /**
   * Get all junction points in this chain.
   * For closed chains: all vertices are junctions.
   * For open chains: all internal vertices (not first/last) are junctions.
   */
  getJunctionPoints(): readonly JunctionPoint[] {
    if (this._junctionPoints === null) {
      this._junctionPoints = this._computeJunctionPoints();
    }
    return this._junctionPoints;
  }

  /**
   * Compute junction points for this chain.
   */
  private _computeJunctionPoints(): readonly JunctionPoint[] {
    const junctions: JunctionPoint[] = [];
    const n = this._vertices.length;

    if (this.isClosed) {
      // All vertices are junctions in a closed chain
      for (let i = 0; i < n; i++) {
        junctions.push(new JunctionPoint(this, i));
      }
    } else {
      // Only internal vertices (not first or last) are junctions in open chain
      for (let i = 1; i < n - 1; i++) {
        junctions.push(new JunctionPoint(this, i));
      }
    }

    return junctions;
  }
}

// =============================================================================
// TYPE GUARDS
// =============================================================================

/**
 * Type guard for JunctionPoint.
 */
export function isJunctionPoint(point: unknown): point is JunctionPoint {
  return point instanceof JunctionPoint;
}

// ChainEndpoint has been removed - use Endpoint from SourcePoint instead

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create a chain of RicochetSurfaces from vertices.
 * All surfaces in the chain will be reflective.
 *
 * @param id - Base ID for the chain (surfaces will be named `${id}-0`, `${id}-1`, etc.)
 * @param vertices - Array of vertex positions (minimum 2)
 * @param isClosed - If true, the chain loops back (default: false)
 */
export function createRicochetChain(
  id: string,
  vertices: Vector2[],
  isClosed = false
): SurfaceChain {
  return new SurfaceChain({
    vertices,
    isClosed,
    surfaceFactory: (index, start, end) => new RicochetSurface(`${id}-${index}`, { start, end }),
  });
}

/**
 * Create a chain of WallSurfaces from vertices.
 * All surfaces in the chain will be blocking (non-reflective).
 *
 * @param id - Base ID for the chain (surfaces will be named `${id}-0`, `${id}-1`, etc.)
 * @param vertices - Array of vertex positions (minimum 2)
 * @param isClosed - If true, the chain loops back (default: false)
 */
export function createWallChain(id: string, vertices: Vector2[], isClosed = false): SurfaceChain {
  return new SurfaceChain({
    vertices,
    isClosed,
    surfaceFactory: (index, start, end) => new WallSurface(`${id}-${index}`, { start, end }),
  });
}

/**
 * Create a single-surface chain from a Surface.
 * Convenience wrapper for existing Surface objects.
 *
 * @param surface - The surface to wrap in a chain
 */
export function createSingleSurfaceChain(surface: Surface): SurfaceChain {
  return new SurfaceChain({
    vertices: [surface.segment.start, surface.segment.end],
    isClosed: false,
    surfaceFactory: () => surface,
  });
}
