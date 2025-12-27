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

import type { Surface } from "@/surfaces/Surface";
import type { Vector2 } from "./types";

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
// CHAIN ENDPOINT (for open chains)
// =============================================================================

/**
 * Represents an exposed endpoint of an open chain.
 * This is a temporary class that will be merged with SourcePoint.Endpoint later.
 */
export class ChainEndpoint {
  readonly type = "chain-endpoint" as const;

  constructor(
    readonly chain: SurfaceChain,
    readonly which: "start" | "end"
  ) {}

  /**
   * Compute the actual coordinates of this endpoint.
   */
  computeXY(): Vector2 {
    if (this.which === "start") {
      return this.chain.getVertex(0).position;
    } else {
      return this.chain.getVertex(this.chain.vertexCount - 1).position;
    }
  }

  /**
   * Get the surface this endpoint is attached to.
   */
  get surface(): Surface {
    const surfaces = this.chain.getSurfaces();
    return this.which === "start" ? surfaces[0] : surfaces[surfaces.length - 1];
  }

  /**
   * Get a unique key for this endpoint.
   */
  getKey(): string {
    return `chain-endpoint:${this.chain.id}:${this.which}`;
  }
}

// =============================================================================
// JUNCTION POINT (for connected vertices)
// =============================================================================

/**
 * Represents a junction where two surfaces meet in a chain.
 * All internal vertices of open chains, and ALL vertices of closed chains.
 */
export class JunctionPoint {
  readonly type = "junction" as const;

  constructor(
    readonly chain: SurfaceChain,
    readonly vertexIndex: number
  ) {}

  /**
   * Compute the actual coordinates of this junction.
   */
  computeXY(): Vector2 {
    return this.chain.getVertex(this.vertexIndex).position;
  }

  /**
   * Get the surface BEFORE this junction (ending at this vertex).
   */
  getSurfaceBefore(): Surface {
    const surfaces = this.chain.getSurfaces();
    if (this.chain.isClosed) {
      // In closed chain, vertex 0's "before" is the last surface
      const beforeIndex = (this.vertexIndex - 1 + surfaces.length) % surfaces.length;
      return surfaces[beforeIndex];
    } else {
      // In open chain, the before surface is at index (vertexIndex - 1)
      return surfaces[this.vertexIndex - 1];
    }
  }

  /**
   * Get the surface AFTER this junction (starting at this vertex).
   */
  getSurfaceAfter(): Surface {
    const surfaces = this.chain.getSurfaces();
    if (this.chain.isClosed) {
      // In closed chain, wrap around
      return surfaces[this.vertexIndex % surfaces.length];
    } else {
      // In open chain, the after surface is at index (vertexIndex)
      return surfaces[this.vertexIndex];
    }
  }

  /**
   * Get a unique key for this junction.
   */
  getKey(): string {
    return `junction:${this.chain.id}:${this.vertexIndex}`;
  }

  /**
   * Check equality with another JunctionPoint.
   */
  equals(other: JunctionPoint): boolean {
    return this.chain === other.chain && this.vertexIndex === other.vertexIndex;
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
  private _endpoints: readonly [ChainEndpoint, ChainEndpoint] | null | undefined = undefined;

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
    if (index < 0 || index >= this._vertices.length) {
      throw new Error(`Vertex index ${index} out of bounds [0, ${this._vertices.length - 1}]`);
    }
    return this._vertices[index];
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
      const start = this._vertices[i].position;
      const end = this._vertices[(i + 1) % n].position;
      surfaces.push(this._surfaceFactory(i, start, end));
    }

    return surfaces;
  }

  /**
   * Get the endpoints of this chain.
   * Returns null for closed chains (no endpoints).
   * Returns [startEndpoint, endEndpoint] for open chains.
   */
  getEndpoints(): readonly [ChainEndpoint, ChainEndpoint] | null {
    if (this._endpoints === undefined) {
      if (this.isClosed) {
        this._endpoints = null;
      } else {
        this._endpoints = [
          new ChainEndpoint(this, "start"),
          new ChainEndpoint(this, "end"),
        ];
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

/**
 * Type guard for ChainEndpoint.
 */
export function isChainEndpoint(point: unknown): point is ChainEndpoint {
  return point instanceof ChainEndpoint;
}

