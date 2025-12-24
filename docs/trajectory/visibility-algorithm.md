# Analytical Section-Based Visibility Algorithm

## Overview

This document describes the analytical visibility propagation algorithm used to compute
valid cursor regions when planned surfaces are present. The algorithm ensures **exact matching**
between visibility polygons and trajectory validity, satisfying First Principle V.5.

## Core Concepts

### Rays (Not Angles)

All calculations use rays defined by two points:

```typescript
interface Ray {
  source: Vector2;  // Origin point
  target: Vector2;  // Point the ray passes through (extends infinitely)
}
```

**Key Principle**: Direction is implicit from `source → target`. We NEVER compute angles
with `atan2` for intermediate calculations. This avoids floating-point precision issues.

### Visibility Polygon

A visibility polygon represents all points visible from an origin, considering obstacles.
It is constructed by:

1. Casting rays from the origin to each obstacle endpoint
2. Finding where rays hit surfaces or screen bounds
3. Connecting hit points in angular order

### Intermediate Polygons

For an N-surface plan, we construct N+1 intermediate polygons:

| Polygon | Origin | Crop Window | Description |
|---------|--------|-------------|-------------|
| P₀ | Player | None | Full visibility before any surface |
| P₁ | Player | Surface 1 | Visibility after passing through S1 |
| P₂ | Image₁ | Surface 2 | Visibility after passing through S2 |
| ... | ... | ... | ... |
| Pₙ | Imageₙ₋₁ | Surface N | Final visibility polygon |

## The Algorithm

### Phase 1: Unified Polygon Construction

The same function builds visibility polygons at every step:

```
function buildVisibilityPolygon(origin, obstacles, bounds) → Polygon
```

This function:
1. Collects all obstacle endpoints
2. For each endpoint visible from origin:
   - Casts a ray from origin through the endpoint
   - Finds where the ray hits the first obstacle or screen bound
3. Collects screen corners visible from origin
4. Orders all hit points by traversing the boundary (not by angle sorting)
5. Returns the polygon vertices

### Phase 2: Window Cropping

When propagating through a planned surface, we "crop" the full visibility polygon
by the window triangle:

```
Window Triangle = {
  Vertex 1: Current origin
  Vertex 2: Surface segment start
  Vertex 3: Surface segment end
}
```

Cropping is the **polygon intersection** of the full visibility polygon with this triangle.
This is computed analytically using polygon clipping algorithms.

### Phase 3: Propagation

```
function propagateWithIntermediates(player, plannedSurfaces, allSurfaces, bounds):
  steps = []
  origin = player
  
  // Step 0: Full visibility from player (same code as empty plan)
  P₀ = buildVisibilityPolygon(origin, allSurfaces, bounds)
  steps.push({ index: 0, origin, polygon: P₀ })
  
  for i = 0 to N-1:
    surface = plannedSurfaces[i]
    
    // Build full polygon (SAME function, different origin/obstacles)
    obstacles = allSurfaces.filter(s => s.id != surface.id)
    fullPoly = buildVisibilityPolygon(origin, obstacles, bounds)
    
    // Crop by window
    cropped = cropPolygonByWindow(fullPoly, origin, surface)
    
    // Reflect origin for next step
    origin = reflect(origin, surface)
    
    steps.push({ index: i+1, origin, polygon: cropped })
  
  return { steps, finalPolygon: steps.last().polygon }
```

### Key Insight: Unified Code Path

The code for these three cases is **exactly the same**:

1. **Empty plan**: `buildVisibilityPolygon(player, allSurfaces, bounds)`
2. **Before first surface**: `buildVisibilityPolygon(player, allSurfaces, bounds)`
3. **After last surface**: The final step uses `buildVisibilityPolygon` with reflected origin

Only intermediate steps add the cropping operation.

## First Principles

### V.5: Light-Divergence-Bypass Correlation

> Light reaches the cursor iff the plan is fully valid (no divergence AND no bypassed surfaces).

The visibility polygon must satisfy:
- `cursorInPolygon(cursor) === isCursorLit(player, cursor, plan, surfaces)`

### V.8: Intermediate Polygon Containment

> The intermediate polygon Pₖ in an N-surface plan is fully contained within 
> the final polygon of the first K surfaces plan.

```
IntermediatePolygon(k, [S1..SN]) ⊆ FinalPolygon([S1..Sk])
```

**Rationale**: Each subsequent surface can only RESTRICT visibility, never expand it.

### V.9: Intermediate Polygon Equality

> The intermediate polygon Pₖ in an N-surface plan is exactly equal to 
> the intermediate polygon Pₖ in any T-surface plan where K < T ≤ N.

```
IntermediatePolygon(k, [S1..SN]) = IntermediatePolygon(k, [S1..ST]) for K < T
```

**Rationale**: Construction of Pₖ only depends on surfaces S1..Sₖ. Future surfaces
don't affect past intermediate results.

## Analytical Operations

### Ray-Segment Intersection

Uses parametric form for exact computation:

```
Ray: P(t) = source + t * (target - source), t ∈ [0, ∞)
Segment: Q(s) = start + s * (end - start), s ∈ [0, 1]

Solve for intersection:
- t = parametric position along ray
- s = parametric position along segment
- Hit is valid iff t > 0 AND 0 ≤ s ≤ 1
```

### Polygon-Triangle Intersection (Window Cropping)

Uses Sutherland-Hodgman algorithm:
1. For each edge of the triangle (window):
   - Clip the polygon against the edge's half-plane
2. Result is the intersection polygon

All edge tests use exact predicates (cross-product sign), no floating-point tolerances.

### Polygon Containment Test

Point-in-polygon using ray casting:
- Cast horizontal ray from point
- Count intersections with polygon edges
- Odd count = inside, even count = outside

## Visualization

Intermediate polygons are rendered with decreasing opacity:

```
P₀: alpha = 0.08 (most faded, full visibility)
P₁: alpha = 0.12
...
Pₙ: alpha = 0.50 (final, most visible)
```

This allows visual debugging of how visibility narrows at each step.

## Error Handling

1. **Player on wrong side**: If player is on non-reflective side of first surface,
   return empty polygon (bypass detected)

2. **Empty window intersection**: If cropped polygon is empty, visibility is blocked

3. **Degenerate cases**: Colinear points, zero-length segments handled gracefully

## Ray-Based Sector Constraints

### The Problem

Without sector constraints, after reflecting through a surface, the visibility polygon 
would be built with a full 360° field of view from the reflected origin. This causes 
areas to appear "lit" that are geometrically unreachable.

### The Solution: RaySector

Sectors are defined by **positions**, not angles:

```typescript
interface RaySector {
  origin: Vector2;        // Source of the rays
  leftBoundary: Vector2;  // Point defining left boundary ray
  rightBoundary: Vector2; // Point defining right boundary ray
}
```

**Key Properties**:
- NO ANGLES: All operations use cross-product comparisons (exact)
- REVERSIBLE: `reflect(reflect(sector, line), line) === sector` exactly
- POSITION-BASED: Boundaries are derived from surface endpoint images

### Sector Propagation

```
function propagateWithIntermediates(player, plannedSurfaces, ...):
  currentSectors = fullSectors(player)  // Start with 360°
  
  for each surface K:
    // Trim sectors to surface angular extent
    plannedSectors = trimSectorsBySurface(currentSectors, surface)
    
    // Build polygon within sector constraint
    polygon = buildVisibilityPolygon(origin, obstacles, bounds, currentSectors)
    
    // Reflect sectors for next step
    currentSectors = reflectSectors(plannedSectors, surface)
```

### Sector Operations

All operations are **exact** (no epsilons):

1. **isPointInSector**: Cross-product sign comparison
2. **reflectSector**: Reflect all three points (origin, left, right)
3. **trimSectorBySurface**: Intersect sector with surface angular extent
4. **blockSectorByObstacle**: Split sector by obstacle (returns 0-2 sectors)

## Testing Strategy

1. **Unit tests**: Each operation tested in isolation
2. **V.8 tests**: Containment verified for all intermediate polygons
3. **V.9 tests**: Equality verified across different plan lengths
4. **V.5 correlation**: Grid sampling verifies `inPolygon === isCursorLit`
5. **Matrix tests**: All assertions applied to diverse setups
6. **Sector tests**: Exact matching and reversibility verified

