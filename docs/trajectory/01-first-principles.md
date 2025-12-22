# First Principles: Trajectory and Reflection System

## Overview

This document enumerates the fundamental truths, mathematical foundations, and immutable constraints that govern the trajectory and reflection system. These principles are derived from the game's specifications and form the bedrock upon which all implementation decisions must rest.

---

## 1. Geometric Primitives

### 1.1 Points and Vectors

A **point** represents a position in 2D space: `P = (x, y)`

A **vector** represents a displacement or direction: `V = (dx, dy)`

**Key Distinction:** Points and vectors are mathematically different. A point is a location; a vector is a magnitude and direction. In code, they may share the same structure, but their semantics differ.

### 1.2 Lines and Segments

A **line** extends infinitely in both directions through two points:
```
Line L defined by points A and B
Any point P on L: P = A + t(B - A) for t ∈ (-∞, +∞)
```

A **segment** is a bounded portion of a line:
```
Segment S from A to B
Any point P on S: P = A + t(B - A) for t ∈ [0, 1]
```

**Parametric Position (t):**
- `t = 0` → point A (segment start)
- `t = 1` → point B (segment end)
- `t = 0.5` → midpoint
- `t < 0` or `t > 1` → off the segment (on the extended line)

### 1.3 Rays

A **ray** has an origin and extends infinitely in one direction.

**Traditional Definition (PROBLEMATIC):**
```
Ray R = { origin: P, direction: D̂ }
where D̂ is a normalized vector
```

**Point-Based Definition (PREFERRED):**
```
Ray R = { from: A, to: B }
Direction is implicit: from A toward B and beyond
```

The point-based definition avoids floating-point normalization errors (see Section 3).

### 1.4 Surfaces

A **surface** is a segment with behavioral properties:
- **Segment**: The geometric extent (start and end points)
- **Type**: Ricochet (reflective) or Wall (blocking)
- **Directionality**: Which side reflects vs. blocks
- **Normal**: Perpendicular vector indicating the "front" side

---

## 2. Image Reflection Mathematics

### 2.1 The Reflection of a Point Through a Line

Given a point P and a line L (defined by points A and B), the reflection P' is the mirror image of P on the opposite side of L, equidistant from L.

**Formula (without normalization):**
```
AB = B - A
AP = P - A
t = (AP · AB) / (AB · AB)
Projection = A + t × AB
P' = 2 × Projection - P
```

**Properties:**
1. P' is equidistant from L as P
2. The line segment PP' is perpendicular to L
3. Reflecting P' through L returns P: `reflect(reflect(P, L), L) = P`

### 2.2 Forward Image Reflection (Player Images)

Given a player position and a sequence of surfaces, create a chain of reflected images:

```
P₀ = Player position (original)
P₁ = reflect(P₀, Surface₁)
P₂ = reflect(P₁, Surface₂)
...
Pₙ = reflect(Pₙ₋₁, Surfaceₙ)
```

**Use Case:** Determining the direction an arrow must travel to reach each surface.

### 2.3 Backward Image Reflection (Cursor Images)

Given a cursor position and a sequence of surfaces (processed in reverse order):

```
C₀ = Cursor position (original)
C₁ = reflect(C₀, Surfaceₙ)       ← Note: REVERSE order
C₂ = reflect(C₁, Surfaceₙ₋₁)
...
Cₙ = reflect(Cₙ₋₁, Surface₁)
```

**Use Case:** Determining where the cursor "appears" from the player's perspective after reflections.

### 2.4 Bidirectional Path Construction

The planned trajectory is constructed by connecting corresponding images:

```
For N planned surfaces:
- Player images: [P₀, P₁, P₂, ..., Pₙ]
- Cursor images: [C₀, C₁, C₂, ..., Cₙ] (built in reverse)

Path points:
- Start: P₀ (player)
- Hit₁: intersection of ray(P₀ → Cₙ) with Surface₁
- Hit₂: intersection of ray(P₁ → Cₙ₋₁) with Surface₂
- ...
- End: C₀ (cursor)
```

**Key Insight:** Each path segment is defined by two image positions, not a direction vector. This ensures exact intersection calculations.

---

## 3. Floating-Point Resistance

### 3.1 The Problem with Normalized Directions

When a direction vector is normalized, floating-point errors are introduced:

```javascript
// Original direction from A to B
const dx = B.x - A.x;  // e.g., 100
const dy = B.y - A.y;  // e.g., 100

// Normalized (introduces error)
const len = Math.sqrt(dx*dx + dy*dy);  // 141.4213562373095...
const dirX = dx / len;  // 0.7071067811865476...
const dirY = dy / len;  // 0.7071067811865475... (note: different!)

// Projecting forward loses precision
const target = {
  x: A.x + dirX * len,  // May not exactly equal B.x
  y: A.y + dirY * len   // May not exactly equal B.y
};
```

### 3.2 Point-Based Rays Eliminate This Problem

By defining rays as point pairs, we never normalize:

```javascript
// Ray from A toward B
const ray = { from: A, to: B };

// Intersection calculation uses A and B directly
// No intermediate normalized direction
const intersection = lineLineIntersection(
  ray.from, ray.to,
  segment.start, segment.end
);
```

**Principle:** Direction is always derived from endpoints, never stored independently.

### 3.3 Intersection Without Square Roots

The line-line intersection formula requires no normalization:

```
Given lines L1 (through P1, P2) and L2 (through P3, P4):

t = ((P1.x - P3.x)(P3.y - P4.y) - (P1.y - P3.y)(P3.x - P4.x)) /
    ((P1.x - P2.x)(P3.y - P4.y) - (P1.y - P2.y)(P3.x - P4.x))

Intersection point = P1 + t(P2 - P1)
```

This formula uses only addition, subtraction, multiplication, and division—no square roots.

### 3.4 Verifiable Reflections

Every reflection should be verifiable:

```javascript
const P_prime = reflectPoint(P, line);
const P_double_prime = reflectPoint(P_prime, line);

// Must be true within floating-point tolerance
assert(distance(P, P_double_prime) < EPSILON);
```

---

## 4. Reflection Caching and Provenance

### 4.1 The Need for Caching

Each reflected image should carry metadata about its origin:

```typescript
interface ReflectedImage {
  position: Vector2;           // The reflected position
  source: {
    position: Vector2;         // Position before this reflection
    surface: Surface | null;   // Surface that created this reflection (null for original)
  };
  depth: number;               // 0 = original, 1 = once reflected, etc.
}
```

### 4.2 Benefits of Provenance Tracking

1. **Debugging:** Trace any point back to its origin
2. **Validation:** Verify reflection chains are geometrically correct
3. **Incremental Updates:** When cursor moves, only recalculate affected images
4. **Exactness Verification:** Confirm reflect(reflect(P)) = P

### 4.3 Image Sequence Structure

```typescript
interface ImageSequence {
  original: Vector2;                    // The unreflected source point
  images: readonly ReflectedImage[];    // Chain of reflections
  surfaces: readonly Surface[];         // Surfaces used for reflections
}
```

---

## 5. Exactness Requirement

### 5.1 Definition

Two trajectories are "exactly aligned" when they share the same sequence of intersection points, calculated from the same image positions.

### 5.2 How Exactness Is Achieved

1. **Shared Image Sequences:** Both planned and actual trajectories use the same forward player images
2. **Point-Based Rays:** Intersections calculated from image endpoints, not directions
3. **No Intermediate Normalization:** Direction vectors are derived, never stored
4. **Cached Images:** Same image positions used consistently

### 5.3 Alignment Detection

```
Planned path: [P₀, Hit₁, Hit₂, ..., Cursor]
Actual path:  [P₀, Hit₁', Hit₂', ..., End]

Paths align where Hit_i = Hit_i' (within tolerance)
Divergence occurs at first mismatch
```

---

## 6. Gameplay Constraints

### 6.1 Single Aim Direction

At any moment, the player has exactly one aiming direction. This direction is defined by:
- The player's position
- The cursor's position (or the first planned image target)

### 6.2 Dual Visualization

Both trajectories must always be visible:
- **Actual Trajectory:** What the arrow will physically do
- **Planned Trajectory:** The ideal path through planned surfaces

### 6.3 Bypass Logic

The planned trajectory must bypass surfaces that would block the path:
- Surfaces that obstruct before reaching the planned reflection point
- Surfaces on the wrong side (back of a directional surface)
- Player or cursor on wrong side of a planned surface

### 6.4 Off-Segment Reflection

The planned path reflects even when the intersection is off the segment:
- Intersection calculated with the extended LINE
- Visual indication that hit is off-segment
- Actual trajectory diverges at this point

---

## 7. GPU Rendering Potential

### 7.1 Per-Pixel Reachability

The mathematical model enables GPU-accelerated visualization:

Given a list of required reflection surfaces, a fragment shader can determine for each screen pixel whether that position is reachable by the arrow.

### 7.2 Shader-Compatible Math

The same reflection math works in GLSL:

```glsl
vec2 reflectPoint(vec2 P, vec2 A, vec2 B) {
    vec2 AB = B - A;
    vec2 AP = P - A;
    float t = dot(AP, AB) / dot(AB, AB);
    vec2 projection = A + t * AB;
    return 2.0 * projection - P;
}

float pointSide(vec2 P, vec2 A, vec2 B) {
    return (B.x - A.x) * (P.y - A.y) - (B.y - A.y) * (P.x - A.x);
}
```

### 7.3 Data Flow to GPU

```
CPU (TypeScript)              GPU (GLSL Shader)
─────────────────────────────────────────────────
Player position        ──►    uniform vec2 player
Reflected images[N]    ──►    uniform vec2 images[MAX_REFLECTIONS]
Surface segments[N]    ──►    uniform vec4 surfaces[MAX_SURFACES]
Surface count          ──►    uniform int surfaceCount
                              
                              ◄── Per-pixel reachability color
```

### 7.4 Visual Benefits

- Real-time visualization of all reachable positions
- Visual feedback showing "zones" the player can hit
- Helps players understand complex multi-reflection shots
- GPU parallelism handles per-pixel calculation efficiently

---

## 8. Summary of First Principles

| Principle | Implication |
|-----------|-------------|
| Rays defined by point pairs | No direction normalization errors |
| Bidirectional image reflection | Planned path uses both player and cursor images |
| Forward-only for actual path | Actual physics uses player images only |
| Reflection caching with provenance | Every image tracks its source |
| Exactness through shared images | Aligned paths use identical calculations |
| Segment containment is parametric | `t ∈ [0,1]` means on segment |
| GPU-compatible math | Same formulas work in shaders |

