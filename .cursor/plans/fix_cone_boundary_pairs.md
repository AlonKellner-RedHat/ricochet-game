# Fix: Add Cone Boundary Hits to PreComputedPairs

## Problem Summary

When casting cone boundary rays (toward `leftBoundary` and `rightBoundary`), the resulting HitPoints are **collinear** with the corresponding window OriginPoints. However, these pairs are **not added to PreComputedPairs**, causing the sorting to use cross-product comparison which produces floating-point noise (2.9e-11) instead of exact zero.

## Root Cause

```
origin (875.56, 659.21) → window-start (550, 150) → ceiling hit (505.25, 80)
                         OriginPoint              HitPoint
                         ↑                        ↑
                         These are collinear but NOT paired in PreComputedPairs!
```

The cross product between these collinear points is 2.9e-11 (floating-point rounding) instead of exactly 0, causing unstable sorting.

## Solution

Add cone boundary hits to `PreComputedPairs` with their corresponding window OriginPoints.

The sort order should be:
- **OriginPoint first** (window endpoint, closer to origin)
- **HitPoint second** (cone boundary hit, farther from origin)

This matches the pattern used for endpoint+continuation pairs.

## Implementation

### Location

In [`src/trajectory-v2/visibility/ConeProjectionV2.ts`](src/trajectory-v2/visibility/ConeProjectionV2.ts), after the cone boundary rays are cast (lines 1008-1024):

### Current Code (lines 1008-1025)

```typescript
const leftHit = castRayToTarget(
  origin,
  source.leftBoundary,
  obstaclesExcludingWindowEndpoints,
  screenBoundaries,
  startLine
);
if (leftHit) vertices.push(leftHit);

const rightHit = castRayToTarget(
  origin,
  source.rightBoundary,
  obstaclesExcludingWindowEndpoints,
  screenBoundaries,
  startLine
);
if (rightHit) vertices.push(rightHit);
```

### Modified Code

```typescript
const leftHit = castRayToTarget(
  origin,
  source.leftBoundary,
  obstaclesExcludingWindowEndpoints,
  screenBoundaries,
  startLine
);
if (leftHit) {
  vertices.push(leftHit);
  // Add to PreComputedPairs: window endpoint (OriginPoint) comes before cone boundary hit
  // OriginPoint is closer to origin, HitPoint is farther
  // Find the corresponding OriginPoint for leftBoundary
  const leftOrigin = vertices.find(
    (v) => isOriginPoint(v) && 
           v.computeXY().x === source.leftBoundary.x && 
           v.computeXY().y === source.leftBoundary.y
  );
  if (leftOrigin) {
    // OriginPoint first, HitPoint second → order = -1 (OriginPoint comes before)
    preComputedPairs.set(leftOrigin, leftHit, -1);
  }
}

const rightHit = castRayToTarget(
  origin,
  source.rightBoundary,
  obstaclesExcludingWindowEndpoints,
  screenBoundaries,
  startLine
);
if (rightHit) {
  vertices.push(rightHit);
  // Add to PreComputedPairs: window endpoint (OriginPoint) comes before cone boundary hit
  const rightOrigin = vertices.find(
    (v) => isOriginPoint(v) && 
           v.computeXY().x === source.rightBoundary.x && 
           v.computeXY().y === source.rightBoundary.y
  );
  if (rightOrigin) {
    preComputedPairs.set(rightOrigin, rightHit, -1);
  }
}
```

### Alternative (Cleaner) Implementation

Store the OriginPoints when adding them, then use them directly:

```typescript
// Earlier in the function (around line 764-767), store the OriginPoints:
let leftWindowOrigin: OriginPoint | null = null;
let rightWindowOrigin: OriginPoint | null = null;

if (isWindowed && startLine) {
  // Determine which window point is left vs right boundary
  const startDir = { x: startLine.start.x - origin.x, y: startLine.start.y - origin.y };
  const endDir = { x: startLine.end.x - origin.x, y: startLine.end.y - origin.y };
  const cross = startDir.x * endDir.y - startDir.y * endDir.x;
  
  if (cross >= 0) {
    leftWindowOrigin = new OriginPoint(startLine.end);
    rightWindowOrigin = new OriginPoint(startLine.start);
  } else {
    leftWindowOrigin = new OriginPoint(startLine.start);
    rightWindowOrigin = new OriginPoint(startLine.end);
  }
  
  vertices.push(leftWindowOrigin);
  vertices.push(rightWindowOrigin);
}

// ... later, when casting boundary rays (around line 1008-1025):
if (leftHit && leftWindowOrigin) {
  vertices.push(leftHit);
  preComputedPairs.set(leftWindowOrigin, leftHit, -1);
}

if (rightHit && rightWindowOrigin) {
  vertices.push(rightHit);
  preComputedPairs.set(rightWindowOrigin, rightHit, -1);
}
```

## Test Verification

The existing test `PixelPerfectSortingInstability.test.ts` should pass after this fix:
- Both bug case and expected case should produce the same correct sorting order
- The ceiling hit (505, 80) should appear AFTER the mirror-left points (at x=250)

## Design Principles

- **Provenance-based**: Uses the OriginPoint reference directly instead of coordinate comparison
- **No epsilons**: The fix uses pre-computed pairs, avoiding floating-point comparison
- **KISS**: Minimal change to existing code structure
- **OCP**: Follows existing pattern for endpoint+continuation pairs

## Files to Modify

1. [`src/trajectory-v2/visibility/ConeProjectionV2.ts`](src/trajectory-v2/visibility/ConeProjectionV2.ts) - Add cone boundary pairs to PreComputedPairs

