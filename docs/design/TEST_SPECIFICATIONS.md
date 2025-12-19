# Test Specifications

## Overview

This document defines test cases following **Test-Driven Development (TDD)** methodology. Tests are written before implementation and define the expected behavior of each component.

---

## Testing Strategy

### Test Pyramid

```
           ┌─────────────┐
           │    E2E      │  Few integration tests
           │   Tests     │  (whole game flow)
          ─┴─────────────┴─
         ┌─────────────────┐
         │  Integration    │  Medium coverage
         │     Tests       │  (systems together)
        ─┴─────────────────┴─
       ┌─────────────────────┐
       │     Unit Tests      │  High coverage
       │  (pure functions)   │  (math, components)
      ─┴─────────────────────┴─
```

### Test Categories

| Category | Focus | Tools |
|----------|-------|-------|
| Unit | Pure functions, isolated classes | Vitest |
| Integration | System interactions | Vitest + mocks |
| Visual | Rendering correctness | Manual/screenshot |

---

## Module: Math (`src/math/`)

### Vec2 Operations

```typescript
describe('Vec2', () => {
  describe('add', () => {
    it('should add two vectors', () => {
      const a = { x: 1, y: 2 };
      const b = { x: 3, y: 4 };
      expect(Vec2.add(a, b)).toEqual({ x: 4, y: 6 });
    });

    it('should handle negative values', () => {
      const a = { x: -1, y: 2 };
      const b = { x: 3, y: -4 };
      expect(Vec2.add(a, b)).toEqual({ x: 2, y: -2 });
    });

    it('should handle zero vectors', () => {
      const a = { x: 0, y: 0 };
      const b = { x: 5, y: 5 };
      expect(Vec2.add(a, b)).toEqual({ x: 5, y: 5 });
    });
  });

  describe('subtract', () => {
    it('should subtract two vectors', () => {
      const a = { x: 5, y: 7 };
      const b = { x: 2, y: 3 };
      expect(Vec2.subtract(a, b)).toEqual({ x: 3, y: 4 });
    });
  });

  describe('scale', () => {
    it('should scale a vector by a scalar', () => {
      const v = { x: 2, y: 3 };
      expect(Vec2.scale(v, 2)).toEqual({ x: 4, y: 6 });
    });

    it('should handle zero scalar', () => {
      const v = { x: 5, y: 10 };
      expect(Vec2.scale(v, 0)).toEqual({ x: 0, y: 0 });
    });

    it('should handle negative scalar', () => {
      const v = { x: 2, y: 3 };
      expect(Vec2.scale(v, -1)).toEqual({ x: -2, y: -3 });
    });
  });

  describe('dot', () => {
    it('should calculate dot product', () => {
      const a = { x: 1, y: 2 };
      const b = { x: 3, y: 4 };
      expect(Vec2.dot(a, b)).toBe(11); // 1*3 + 2*4
    });

    it('should return zero for perpendicular vectors', () => {
      const a = { x: 1, y: 0 };
      const b = { x: 0, y: 1 };
      expect(Vec2.dot(a, b)).toBe(0);
    });
  });

  describe('length', () => {
    it('should calculate vector length', () => {
      const v = { x: 3, y: 4 };
      expect(Vec2.length(v)).toBe(5); // 3-4-5 triangle
    });

    it('should return zero for zero vector', () => {
      const v = { x: 0, y: 0 };
      expect(Vec2.length(v)).toBe(0);
    });
  });

  describe('normalize', () => {
    it('should normalize a vector to unit length', () => {
      const v = { x: 3, y: 4 };
      const normalized = Vec2.normalize(v);
      expect(normalized.x).toBeCloseTo(0.6);
      expect(normalized.y).toBeCloseTo(0.8);
      expect(Vec2.length(normalized)).toBeCloseTo(1);
    });

    it('should handle zero vector', () => {
      const v = { x: 0, y: 0 };
      expect(Vec2.normalize(v)).toEqual({ x: 0, y: 0 });
    });
  });

  describe('reflect', () => {
    it('should reflect vector off horizontal surface', () => {
      const direction = Vec2.normalize({ x: 1, y: 1 }); // 45° down-right
      const normal = { x: 0, y: -1 }; // Pointing up
      const reflected = Vec2.reflect(direction, normal);
      
      expect(reflected.x).toBeCloseTo(direction.x);
      expect(reflected.y).toBeCloseTo(-direction.y);
    });

    it('should reflect vector off vertical surface', () => {
      const direction = Vec2.normalize({ x: 1, y: 1 });
      const normal = { x: -1, y: 0 }; // Pointing left
      const reflected = Vec2.reflect(direction, normal);
      
      expect(reflected.x).toBeCloseTo(-direction.x);
      expect(reflected.y).toBeCloseTo(direction.y);
    });

    it('should preserve magnitude', () => {
      const direction = { x: 3, y: 4 };
      const normal = Vec2.normalize({ x: 1, y: 1 });
      const reflected = Vec2.reflect(direction, normal);
      
      expect(Vec2.length(reflected)).toBeCloseTo(Vec2.length(direction));
    });
  });

  describe('perpendicular', () => {
    it('should return perpendicular vector', () => {
      const v = { x: 1, y: 0 };
      expect(Vec2.perpendicular(v)).toEqual({ x: 0, y: 1 });
    });

    it('should be perpendicular (dot product = 0)', () => {
      const v = { x: 3, y: 7 };
      const perp = Vec2.perpendicular(v);
      expect(Vec2.dot(v, perp)).toBeCloseTo(0);
    });
  });

  describe('distance', () => {
    it('should calculate distance between points', () => {
      const a = { x: 0, y: 0 };
      const b = { x: 3, y: 4 };
      expect(Vec2.distance(a, b)).toBe(5);
    });
  });

  describe('direction', () => {
    it('should return normalized direction vector', () => {
      const from = { x: 0, y: 0 };
      const to = { x: 10, y: 0 };
      expect(Vec2.direction(from, to)).toEqual({ x: 1, y: 0 });
    });
  });
});
```

### Segment Operations

```typescript
describe('Segment', () => {
  describe('normal', () => {
    it('should return normal for horizontal segment', () => {
      const segment = { start: { x: 0, y: 0 }, end: { x: 10, y: 0 } };
      const normal = Segment.normal(segment);
      
      // Normal should be perpendicular (pointing up or down)
      expect(normal.x).toBeCloseTo(0);
      expect(Math.abs(normal.y)).toBeCloseTo(1);
    });

    it('should return normal for vertical segment', () => {
      const segment = { start: { x: 0, y: 0 }, end: { x: 0, y: 10 } };
      const normal = Segment.normal(segment);
      
      expect(Math.abs(normal.x)).toBeCloseTo(1);
      expect(normal.y).toBeCloseTo(0);
    });

    it('should return unit vector', () => {
      const segment = { start: { x: 0, y: 0 }, end: { x: 3, y: 4 } };
      const normal = Segment.normal(segment);
      
      expect(Vec2.length(normal)).toBeCloseTo(1);
    });
  });

  describe('length', () => {
    it('should calculate segment length', () => {
      const segment = { start: { x: 0, y: 0 }, end: { x: 3, y: 4 } };
      expect(Segment.length(segment)).toBe(5);
    });
  });

  describe('midpoint', () => {
    it('should return midpoint', () => {
      const segment = { start: { x: 0, y: 0 }, end: { x: 10, y: 10 } };
      expect(Segment.midpoint(segment)).toEqual({ x: 5, y: 5 });
    });
  });
});
```

### Ray-Segment Intersection

```typescript
describe('raySegmentIntersect', () => {
  describe('basic intersections', () => {
    it('should detect intersection with horizontal segment', () => {
      const ray = { origin: { x: 5, y: 0 }, direction: { x: 0, y: 1 } };
      const segment = { start: { x: 0, y: 10 }, end: { x: 10, y: 10 } };
      
      const result = raySegmentIntersect(ray, segment);
      
      expect(result.hit).toBe(true);
      expect(result.point).toEqual({ x: 5, y: 10 });
      expect(result.t).toBe(10);
    });

    it('should detect intersection with vertical segment', () => {
      const ray = { origin: { x: 0, y: 5 }, direction: { x: 1, y: 0 } };
      const segment = { start: { x: 10, y: 0 }, end: { x: 10, y: 10 } };
      
      const result = raySegmentIntersect(ray, segment);
      
      expect(result.hit).toBe(true);
      expect(result.point).toEqual({ x: 10, y: 5 });
    });

    it('should detect intersection with diagonal segment', () => {
      const ray = { origin: { x: 0, y: 0 }, direction: Vec2.normalize({ x: 1, y: 1 }) };
      const segment = { start: { x: 5, y: 10 }, end: { x: 10, y: 5 } };
      
      const result = raySegmentIntersect(ray, segment);
      
      expect(result.hit).toBe(true);
      expect(result.point?.x).toBeCloseTo(7.5);
      expect(result.point?.y).toBeCloseTo(7.5);
    });
  });

  describe('no intersection cases', () => {
    it('should return no hit for parallel ray and segment', () => {
      const ray = { origin: { x: 0, y: 0 }, direction: { x: 1, y: 0 } };
      const segment = { start: { x: 0, y: 10 }, end: { x: 10, y: 10 } };
      
      const result = raySegmentIntersect(ray, segment);
      
      expect(result.hit).toBe(false);
    });

    it('should return no hit when ray points away from segment', () => {
      const ray = { origin: { x: 5, y: 5 }, direction: { x: 0, y: -1 } };
      const segment = { start: { x: 0, y: 10 }, end: { x: 10, y: 10 } };
      
      const result = raySegmentIntersect(ray, segment);
      
      expect(result.hit).toBe(false);
    });

    it('should return no hit when intersection is outside segment bounds', () => {
      const ray = { origin: { x: 15, y: 0 }, direction: { x: 0, y: 1 } };
      const segment = { start: { x: 0, y: 10 }, end: { x: 10, y: 10 } };
      
      const result = raySegmentIntersect(ray, segment);
      
      expect(result.hit).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle ray starting on segment', () => {
      const ray = { origin: { x: 5, y: 10 }, direction: { x: 0, y: 1 } };
      const segment = { start: { x: 0, y: 10 }, end: { x: 10, y: 10 } };
      
      const result = raySegmentIntersect(ray, segment);
      
      expect(result.hit).toBe(true);
      expect(result.t).toBeCloseTo(0);
    });

    it('should handle intersection at segment endpoint', () => {
      const ray = { origin: { x: 0, y: 0 }, direction: { x: 1, y: 1 } };
      const segment = { start: { x: 5, y: 5 }, end: { x: 10, y: 0 } };
      
      const result = raySegmentIntersect(ray, segment);
      
      expect(result.hit).toBe(true);
      expect(result.point).toEqual({ x: 5, y: 5 });
    });
  });

  describe('normal calculation', () => {
    it('should return normal pointing toward ray origin', () => {
      const ray = { origin: { x: 5, y: 0 }, direction: { x: 0, y: 1 } };
      const segment = { start: { x: 0, y: 10 }, end: { x: 10, y: 10 } };
      
      const result = raySegmentIntersect(ray, segment);
      
      expect(result.normal).not.toBeNull();
      expect(result.normal!.y).toBeLessThan(0); // Pointing up (toward origin)
    });
  });
});
```

---

## Module: Trajectory (`src/trajectory/`)

### TrajectoryCalculator

```typescript
describe('TrajectoryCalculator', () => {
  let calculator: TrajectoryCalculator;
  
  beforeEach(() => {
    calculator = new DefaultTrajectoryCalculator();
  });

  describe('single segment trajectory', () => {
    it('should calculate straight path with no surfaces', () => {
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 100, y: 0 };
      
      const result = calculator.calculate(origin, aimPoint, [], [], 200);
      
      expect(result.status).toBe('valid');
      expect(result.points).toHaveLength(2); // Origin and endpoint
      expect(result.points[0].position).toEqual(origin);
      expect(result.points[1].position.x).toBeCloseTo(200);
    });

    it('should stop at wall surface', () => {
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 100, y: 0 };
      const wall = createWallSurface({ x: 50, y: -10 }, { x: 50, y: 10 });
      
      const result = calculator.calculate(origin, aimPoint, [], [wall], 200);
      
      expect(result.status).toBe('valid');
      expect(result.points).toHaveLength(2);
      expect(result.points[1].position.x).toBeCloseTo(50);
      expect(result.points[1].surfaceId).toBe(wall.id);
    });
  });

  describe('single ricochet', () => {
    it('should reflect off ricochet surface', () => {
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 10, y: 10 }; // 45° angle
      const ricochet = createRicochetSurface({ x: 0, y: 50 }, { x: 100, y: 50 }); // Horizontal
      
      const result = calculator.calculate(origin, aimPoint, [ricochet], [ricochet], 200);
      
      expect(result.status).toBe('valid');
      expect(result.points).toHaveLength(3); // Origin, ricochet, endpoint
      expect(result.points[1].position.y).toBeCloseTo(50);
      expect(result.points[1].isPlanned).toBe(true);
    });

    it('should calculate correct reflection angle', () => {
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 1, y: 1 }; // 45°
      const ricochet = createRicochetSurface({ x: 0, y: 50 }, { x: 100, y: 50 });
      
      const result = calculator.calculate(origin, aimPoint, [ricochet], [ricochet], 200);
      
      // After hitting horizontal surface, Y should reverse
      const hitPoint = result.points[1].position;
      const endPoint = result.points[2].position;
      
      expect(endPoint.x).toBeGreaterThan(hitPoint.x); // Still moving right
      expect(endPoint.y).toBeLessThan(hitPoint.y); // Now moving up
    });
  });

  describe('multiple ricochets', () => {
    it('should handle chain of planned ricochets', () => {
      const origin = { x: 0, y: 50 };
      const aimPoint = { x: 1, y: 0 }; // Horizontal
      
      const r1 = createRicochetSurface({ x: 100, y: 0 }, { x: 100, y: 100 }); // Vertical at x=100
      const r2 = createRicochetSurface({ x: 0, y: 0 }, { x: 200, y: 0 }); // Horizontal at y=0
      const r3 = createRicochetSurface({ x: 150, y: 0 }, { x: 150, y: 100 }); // Vertical at x=150
      
      const result = calculator.calculate(
        origin, aimPoint,
        [r1, r2, r3],
        [r1, r2, r3],
        500
      );
      
      expect(result.status).toBe('valid');
      expect(result.points.length).toBeGreaterThanOrEqual(4);
    });

    it('should hit planned surfaces in order', () => {
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 1, y: 1 };
      
      const r1 = createRicochetSurface({ x: 0, y: 50 }, { x: 100, y: 50 });
      const r2 = createRicochetSurface({ x: 80, y: 0 }, { x: 80, y: 100 });
      
      const result = calculator.calculate(
        origin, aimPoint,
        [r1, r2],
        [r1, r2],
        300
      );
      
      expect(result.status).toBe('valid');
      
      // Find planned hits
      const plannedHits = result.points.filter(p => p.isPlanned);
      expect(plannedHits).toHaveLength(2);
      expect(plannedHits[0].surfaceId).toBe(r1.id);
      expect(plannedHits[1].surfaceId).toBe(r2.id);
    });
  });

  describe('validation failures', () => {
    it('should report missed_surface when planned surface not hit', () => {
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 1, y: 0 }; // Horizontal
      const ricochet = createRicochetSurface({ x: 50, y: 100 }, { x: 100, y: 100 }); // Too high
      
      const result = calculator.calculate(origin, aimPoint, [ricochet], [ricochet], 200);
      
      expect(result.status).toBe('missed_surface');
      expect(result.failedAtPlanIndex).toBe(0);
    });

    it('should report hit_obstacle when wall blocks planned path', () => {
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 1, y: 1 };
      
      const wall = createWallSurface({ x: 30, y: 0 }, { x: 30, y: 50 });
      const ricochet = createRicochetSurface({ x: 0, y: 50 }, { x: 100, y: 50 });
      
      const result = calculator.calculate(
        origin, aimPoint,
        [ricochet],
        [wall, ricochet],
        200
      );
      
      expect(result.status).toBe('hit_obstacle');
      expect(result.failedAtPlanIndex).toBe(0);
    });

    it('should report out_of_range when max distance exceeded before plan complete', () => {
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 1, y: 0 };
      const ricochet = createRicochetSurface({ x: 500, y: -10 }, { x: 500, y: 10 }); // Too far
      
      const result = calculator.calculate(origin, aimPoint, [ricochet], [ricochet], 100);
      
      expect(result.status).toBe('missed_surface'); // Missed because out of range
    });
  });

  describe('total distance calculation', () => {
    it('should track total path distance', () => {
      const origin = { x: 0, y: 0 };
      const aimPoint = { x: 1, y: 0 };
      const wall = createWallSurface({ x: 100, y: -10 }, { x: 100, y: 10 });
      
      const result = calculator.calculate(origin, aimPoint, [], [wall], 200);
      
      expect(result.totalDistance).toBeCloseTo(100);
    });
  });
});

// Test helpers
function createRicochetSurface(start: Vector2, end: Vector2): Surface {
  return new RicochetSurface(`ricochet_${Math.random()}`, { start, end });
}

function createWallSurface(start: Vector2, end: Vector2): Surface {
  return new WallSurface(`wall_${Math.random()}`, { start, end });
}
```

---

## Module: Surfaces (`src/surfaces/`)

### RicochetSurface

```typescript
describe('RicochetSurface', () => {
  it('should return reflect hit result', () => {
    const surface = new RicochetSurface('r1', {
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 }
    });
    
    const arrow = createMockArrow();
    const hitPoint = { x: 50, y: 0 };
    const velocity = { x: 1, y: 1 };
    
    const result = surface.onArrowHit(arrow, hitPoint, velocity);
    
    expect(result.type).toBe('reflect');
    expect(result.reflectedDirection).toBeDefined();
  });

  it('should be plannable', () => {
    const surface = new RicochetSurface('r1', {
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 }
    });
    
    expect(surface.isPlannable()).toBe(true);
  });

  it('should have surfaceType "ricochet"', () => {
    const surface = new RicochetSurface('r1', {
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 }
    });
    
    expect(surface.surfaceType).toBe('ricochet');
  });
});
```

### WallSurface

```typescript
describe('WallSurface', () => {
  it('should return stick hit result', () => {
    const surface = new WallSurface('w1', {
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 }
    });
    
    const arrow = createMockArrow();
    const hitPoint = { x: 50, y: 0 };
    const velocity = { x: 1, y: 1 };
    
    const result = surface.onArrowHit(arrow, hitPoint, velocity);
    
    expect(result.type).toBe('stick');
  });

  it('should not be plannable', () => {
    const surface = new WallSurface('w1', {
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 }
    });
    
    expect(surface.isPlannable()).toBe(false);
  });
});
```

### BreakableSurface

```typescript
describe('BreakableSurface', () => {
  it('should stick and report damage', () => {
    const surface = new BreakableSurface('b1', {
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 }
    }, 3);
    
    const result = surface.onArrowHit(createMockArrow(), { x: 50, y: 0 }, { x: 0, y: 1 });
    
    expect(result.type).toBe('stick');
    expect(result.damage).toBe(1);
  });

  it('should pass through when health depleted', () => {
    const surface = new BreakableSurface('b1', {
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 }
    }, 1);
    
    const result = surface.onArrowHit(createMockArrow(), { x: 50, y: 0 }, { x: 0, y: 1 });
    
    expect(result.type).toBe('pass_through');
  });

  it('should track remaining health', () => {
    const surface = new BreakableSurface('b1', {
      start: { x: 0, y: 0 },
      end: { x: 100, y: 0 }
    }, 3);
    
    surface.onArrowHit(createMockArrow(), { x: 50, y: 0 }, { x: 0, y: 1 });
    surface.onArrowHit(createMockArrow(), { x: 50, y: 0 }, { x: 0, y: 1 });
    
    expect(surface.health).toBe(1);
  });
});
```

### SurfaceFactory

```typescript
describe('SurfaceFactory', () => {
  let factory: SurfaceFactory;
  
  beforeEach(() => {
    factory = new SurfaceFactory();
    factory.register('ricochet', (data) => new RicochetSurface(data.id, data.segment));
    factory.register('wall', (data) => new WallSurface(data.id, data.segment));
  });

  it('should create registered surface types', () => {
    const surface = factory.create({
      id: 'test',
      type: 'ricochet',
      segment: { start: { x: 0, y: 0 }, end: { x: 10, y: 10 } }
    });
    
    expect(surface).toBeInstanceOf(RicochetSurface);
  });

  it('should throw for unknown types', () => {
    expect(() => {
      factory.create({
        id: 'test',
        type: 'unknown',
        segment: { start: { x: 0, y: 0 }, end: { x: 10, y: 10 } }
      });
    }).toThrow('Unknown surface type: unknown');
  });

  it('should allow registering new types', () => {
    factory.register('custom', (data) => new WallSurface(data.id, data.segment));
    
    const surface = factory.create({
      id: 'test',
      type: 'custom',
      segment: { start: { x: 0, y: 0 }, end: { x: 10, y: 10 } }
    });
    
    expect(surface).toBeDefined();
  });
});
```

---

## Module: Targets (`src/targets/`)

### BasicTarget

```typescript
describe('BasicTarget', () => {
  it('should not be complete initially', () => {
    const target = new BasicTarget('t1', { x: 0, y: 0 }, 10);
    expect(target.isComplete()).toBe(false);
  });

  it('should be complete after hit', () => {
    const target = new BasicTarget('t1', { x: 0, y: 0 }, 10);
    target.onHit(createMockArrow());
    expect(target.isComplete()).toBe(true);
  });

  it('should reset to incomplete', () => {
    const target = new BasicTarget('t1', { x: 0, y: 0 }, 10);
    target.onHit(createMockArrow());
    target.reset();
    expect(target.isComplete()).toBe(false);
  });
});
```

### MultiHitTarget

```typescript
describe('MultiHitTarget', () => {
  it('should require multiple hits', () => {
    const target = new MultiHitTarget('t1', { x: 0, y: 0 }, 10, 3);
    
    target.onHit(createMockArrow());
    expect(target.isComplete()).toBe(false);
    
    target.onHit(createMockArrow());
    expect(target.isComplete()).toBe(false);
    
    target.onHit(createMockArrow());
    expect(target.isComplete()).toBe(true);
  });

  it('should track current hits', () => {
    const target = new MultiHitTarget('t1', { x: 0, y: 0 }, 10, 3);
    
    target.onHit(createMockArrow());
    expect(target.currentHits).toBe(1);
  });

  it('should reset hit count', () => {
    const target = new MultiHitTarget('t1', { x: 0, y: 0 }, 10, 3);
    
    target.onHit(createMockArrow());
    target.onHit(createMockArrow());
    target.reset();
    
    expect(target.currentHits).toBe(0);
    expect(target.isComplete()).toBe(false);
  });
});
```

### TriggerTarget

```typescript
describe('TriggerTarget', () => {
  it('should execute action on first hit', () => {
    const action = { execute: vi.fn(), reset: vi.fn() };
    const target = new TriggerTarget('t1', { x: 0, y: 0 }, 10, action);
    
    target.onHit(createMockArrow());
    
    expect(action.execute).toHaveBeenCalledTimes(1);
  });

  it('should not execute action on subsequent hits', () => {
    const action = { execute: vi.fn(), reset: vi.fn() };
    const target = new TriggerTarget('t1', { x: 0, y: 0 }, 10, action);
    
    target.onHit(createMockArrow());
    target.onHit(createMockArrow());
    
    expect(action.execute).toHaveBeenCalledTimes(1);
  });

  it('should reset action on target reset', () => {
    const action = { execute: vi.fn(), reset: vi.fn() };
    const target = new TriggerTarget('t1', { x: 0, y: 0 }, 10, action);
    
    target.onHit(createMockArrow());
    target.reset();
    
    expect(action.reset).toHaveBeenCalled();
    expect(target.isComplete()).toBe(false);
  });
});
```

---

## Module: Player (`src/player/`)

### MovementSystem

```typescript
describe('MovementSystem', () => {
  let system: MovementSystem;
  const config = DEFAULT_MOVEMENT_CONFIG;
  
  beforeEach(() => {
    system = new PlayerMovementSystem({ x: 0, y: 0 }, config);
  });

  describe('horizontal movement', () => {
    it('should accelerate when input pressed', () => {
      const input: MovementInput = { left: false, right: true, jump: false, jumpHeld: false };
      
      system.update(0.016, input, []);
      
      expect(system.velocity.x).toBeGreaterThan(0);
    });

    it('should not exceed max speed', () => {
      const input: MovementInput = { left: false, right: true, jump: false, jumpHeld: false };
      
      // Many updates
      for (let i = 0; i < 100; i++) {
        system.update(0.016, input, []);
      }
      
      expect(system.velocity.x).toBeLessThanOrEqual(config.maxSpeed);
    });

    it('should decelerate when input released', () => {
      // First accelerate
      system.update(0.016, { left: false, right: true, jump: false, jumpHeld: false }, []);
      const speedAfterAccel = system.velocity.x;
      
      // Then release
      system.update(0.016, { left: false, right: false, jump: false, jumpHeld: false }, []);
      
      expect(system.velocity.x).toBeLessThan(speedAfterAccel);
    });
  });

  describe('jumping', () => {
    it('should jump when grounded and jump pressed', () => {
      // Create ground surface
      const ground = createWallSurface({ x: -100, y: 10 }, { x: 100, y: 10 });
      system.setPosition({ x: 0, y: 10 - config.playerHeight / 2 });
      
      // Establish grounded state
      system.update(0.016, { left: false, right: false, jump: false, jumpHeld: false }, [ground]);
      
      // Jump
      system.update(0.016, { left: false, right: false, jump: true, jumpHeld: true }, [ground]);
      
      expect(system.velocity.y).toBeLessThan(0); // Negative = upward
      expect(system.state).toBe('jumping');
    });

    it('should not jump when airborne', () => {
      const input: MovementInput = { left: false, right: false, jump: true, jumpHeld: true };
      
      system.update(0.016, input, []); // No ground = airborne
      const velocityAfterFirstJump = system.velocity.y;
      
      system.update(0.016, input, []);
      
      // Should not have additional upward velocity
      expect(system.velocity.y).toBeGreaterThanOrEqual(velocityAfterFirstJump);
    });

    it('should cut jump height on early release', () => {
      const ground = createWallSurface({ x: -100, y: 100 }, { x: 100, y: 100 });
      system.setPosition({ x: 0, y: 100 - config.playerHeight / 2 });
      
      // Ground and jump
      system.update(0.016, { left: false, right: false, jump: false, jumpHeld: false }, [ground]);
      system.update(0.016, { left: false, right: false, jump: true, jumpHeld: true }, [ground]);
      
      const fullJumpVelocity = system.velocity.y;
      
      // Release jump
      system.update(0.016, { left: false, right: false, jump: false, jumpHeld: false }, []);
      
      expect(system.velocity.y).toBeGreaterThan(fullJumpVelocity * config.jumpCutMultiplier - 0.1);
    });
  });

  describe('gravity', () => {
    it('should apply gravity when airborne', () => {
      const input: MovementInput = { left: false, right: false, jump: false, jumpHeld: false };
      
      system.update(0.016, input, []); // No ground
      
      expect(system.velocity.y).toBeGreaterThan(0); // Falling
    });

    it('should not exceed terminal velocity', () => {
      const input: MovementInput = { left: false, right: false, jump: false, jumpHeld: false };
      
      for (let i = 0; i < 1000; i++) {
        system.update(0.016, input, []);
      }
      
      expect(system.velocity.y).toBeLessThanOrEqual(config.maxFallSpeed);
    });
  });

  describe('state transitions', () => {
    it('should be idle when grounded with no input', () => {
      const ground = createWallSurface({ x: -100, y: 10 }, { x: 100, y: 10 });
      system.setPosition({ x: 0, y: 10 - config.playerHeight / 2 });
      
      system.update(0.016, { left: false, right: false, jump: false, jumpHeld: false }, [ground]);
      
      expect(system.state).toBe('idle');
    });

    it('should be running when grounded with horizontal input', () => {
      const ground = createWallSurface({ x: -100, y: 10 }, { x: 100, y: 10 });
      system.setPosition({ x: 0, y: 10 - config.playerHeight / 2 });
      
      system.update(0.016, { left: false, right: true, jump: false, jumpHeld: false }, [ground]);
      
      expect(system.state).toBe('running');
    });

    it('should transition to falling after jump apex', () => {
      const ground = createWallSurface({ x: -100, y: 100 }, { x: 100, y: 100 });
      system.setPosition({ x: 0, y: 100 - config.playerHeight / 2 });
      
      // Jump
      system.update(0.016, { left: false, right: false, jump: false, jumpHeld: false }, [ground]);
      system.update(0.016, { left: false, right: false, jump: true, jumpHeld: true }, [ground]);
      
      // Keep updating until falling
      for (let i = 0; i < 100; i++) {
        system.update(0.016, { left: false, right: false, jump: false, jumpHeld: false }, []);
        if (system.state === 'falling') break;
      }
      
      expect(system.state).toBe('falling');
    });
  });
});
```

### AimingSystem

```typescript
describe('AimingSystem', () => {
  let system: AimingSystem;
  let trajectoryCalculator: TrajectoryCalculator;
  
  beforeEach(() => {
    trajectoryCalculator = new DefaultTrajectoryCalculator();
    system = new PlayerAimingSystem(trajectoryCalculator);
  });

  describe('aim direction', () => {
    it('should update aim direction from mouse position', () => {
      const playerPos = { x: 0, y: 0 };
      const mousePos = { x: 100, y: 0 };
      
      system.update(mousePos, playerPos, []);
      
      expect(system.aimDirection.x).toBeCloseTo(1);
      expect(system.aimDirection.y).toBeCloseTo(0);
    });

    it('should normalize aim direction', () => {
      const playerPos = { x: 0, y: 0 };
      const mousePos = { x: 300, y: 400 };
      
      system.update(mousePos, playerPos, []);
      
      expect(Vec2.length(system.aimDirection)).toBeCloseTo(1);
    });
  });

  describe('plan management', () => {
    it('should add plannable surface to plan', () => {
      const surface = createRicochetSurface({ x: 0, y: 0 }, { x: 100, y: 0 });
      
      system.toggleSurfaceInPlan(surface);
      
      expect(system.plannedSurfaces).toContain(surface);
    });

    it('should remove surface on second toggle', () => {
      const surface = createRicochetSurface({ x: 0, y: 0 }, { x: 100, y: 0 });
      
      system.toggleSurfaceInPlan(surface);
      system.toggleSurfaceInPlan(surface);
      
      expect(system.plannedSurfaces).not.toContain(surface);
    });

    it('should not add non-plannable surface', () => {
      const wall = createWallSurface({ x: 0, y: 0 }, { x: 100, y: 0 });
      
      system.toggleSurfaceInPlan(wall);
      
      expect(system.plannedSurfaces).toHaveLength(0);
    });

    it('should clear plan', () => {
      const s1 = createRicochetSurface({ x: 0, y: 0 }, { x: 100, y: 0 });
      const s2 = createRicochetSurface({ x: 0, y: 50 }, { x: 100, y: 50 });
      
      system.toggleSurfaceInPlan(s1);
      system.toggleSurfaceInPlan(s2);
      system.clearPlan();
      
      expect(system.plannedSurfaces).toHaveLength(0);
    });
  });

  describe('shooting', () => {
    it('should create arrow on shoot', () => {
      system.update({ x: 100, y: 0 }, { x: 0, y: 0 }, []);
      
      const arrow = system.shoot({ x: 0, y: 0 });
      
      expect(arrow).not.toBeNull();
    });

    it('should clear plan after shooting', () => {
      const surface = createRicochetSurface({ x: 0, y: 0 }, { x: 100, y: 0 });
      system.toggleSurfaceInPlan(surface);
      system.update({ x: 100, y: 0 }, { x: 0, y: 0 }, []);
      
      system.shoot({ x: 0, y: 0 });
      
      expect(system.plannedSurfaces).toHaveLength(0);
    });

    it('should respect shoot cooldown', () => {
      system.update({ x: 100, y: 0 }, { x: 0, y: 0 }, []);
      
      system.shoot({ x: 0, y: 0 });
      const secondArrow = system.shoot({ x: 0, y: 0 });
      
      expect(secondArrow).toBeNull();
    });
  });
});
```

---

## Integration Tests

### Player Entity (Movement + Aiming)

```typescript
describe('PlayerEntity Integration', () => {
  let player: Player;
  
  beforeEach(() => {
    player = new PlayerEntity(
      { x: 0, y: 0 },
      new DefaultTrajectoryCalculator()
    );
  });

  it('should allow shooting while running', () => {
    const ground = createWallSurface({ x: -1000, y: 50 }, { x: 1000, y: 50 });
    player.reset({ x: 0, y: 50 - 24 }); // Above ground
    
    const input: GameInput = {
      movement: { left: false, right: true, jump: false, jumpHeld: false },
      mousePosition: { x: 200, y: 0 },
      click: false
    };
    
    // Update for movement
    player.update(0.016, input, [ground]);
    
    expect(player.movementState).toBe('running');
    
    // Now click to shoot
    const arrow = player.handleClick({ x: 200, y: 0 }, [ground]);
    
    expect(arrow).not.toBeNull();
  });

  it('should allow shooting while jumping', () => {
    const ground = createWallSurface({ x: -1000, y: 50 }, { x: 1000, y: 50 });
    player.reset({ x: 0, y: 50 - 24 });
    
    // Ground and jump
    player.update(0.016, {
      movement: { left: false, right: false, jump: false, jumpHeld: false },
      mousePosition: { x: 100, y: 0 },
      click: false
    }, [ground]);
    
    player.update(0.016, {
      movement: { left: false, right: false, jump: true, jumpHeld: true },
      mousePosition: { x: 100, y: 0 },
      click: false
    }, [ground]);
    
    expect(player.movementState).toBe('jumping');
    
    // Shoot while jumping
    const arrow = player.handleClick({ x: 200, y: 0 }, [ground]);
    
    expect(arrow).not.toBeNull();
  });

  it('should allow shooting while falling', () => {
    player.reset({ x: 0, y: 0 });
    
    // Update with no ground - will be falling
    for (let i = 0; i < 5; i++) {
      player.update(0.016, {
        movement: { left: false, right: false, jump: false, jumpHeld: false },
        mousePosition: { x: 100, y: 100 },
        click: false
      }, []);
    }
    
    expect(player.movementState).toBe('falling');
    
    const arrow = player.handleClick({ x: 100, y: 100 }, []);
    
    expect(arrow).not.toBeNull();
  });

  it('should update trajectory when player moves', () => {
    const ground = createWallSurface({ x: -1000, y: 50 }, { x: 1000, y: 50 });
    player.reset({ x: 0, y: 50 - 24 });
    
    const mousePos = { x: 200, y: 0 };
    
    // Initial trajectory
    player.update(0.016, {
      movement: { left: false, right: false, jump: false, jumpHeld: false },
      mousePosition: mousePos,
      click: false
    }, [ground]);
    
    const initialOrigin = player.trajectoryResult.points[0].position;
    
    // Move right
    for (let i = 0; i < 10; i++) {
      player.update(0.016, {
        movement: { left: false, right: true, jump: false, jumpHeld: false },
        mousePosition: mousePos,
        click: false
      }, [ground]);
    }
    
    const newOrigin = player.trajectoryResult.points[0].position;
    
    // Trajectory origin should have moved with player
    expect(newOrigin.x).toBeGreaterThan(initialOrigin.x);
  });
});
```

---

## Module: Level Editor (`src/editor/`)

### Level Serialization

```typescript
describe('LevelSerializer', () => {
  let serializer: JSONLevelSerializer;
  
  beforeEach(() => {
    serializer = new JSONLevelSerializer(
      createSurfaceFactory(),
      createTargetFactory()
    );
  });

  it('should serialize level to JSON-compatible object', () => {
    const level = createTestLevel();
    
    const data = serializer.serialize(level);
    
    expect(data.id).toBe(level.id);
    expect(data.name).toBe(level.name);
    expect(data.surfaces).toHaveLength(level.surfaces.length);
    expect(data.targets).toHaveLength(level.targets.length);
  });

  it('should deserialize JSON to level', () => {
    const data: LevelData = {
      id: 'test',
      name: 'Test Level',
      version: 1,
      bounds: { width: 800, height: 600 },
      spawnPoint: { x: 100, y: 100 },
      surfaces: [
        { id: 's1', type: 'ricochet', segment: { start: { x: 0, y: 0 }, end: { x: 100, y: 0 } } }
      ],
      targets: [
        { id: 't1', type: 'basic', position: { x: 200, y: 200 }, hitRadius: 20 }
      ]
    };
    
    const level = serializer.deserialize(data);
    
    expect(level.id).toBe('test');
    expect(level.surfaces).toHaveLength(1);
    expect(level.targets).toHaveLength(1);
  });

  it('should preserve data through round-trip', () => {
    const original = createTestLevel();
    
    const data = serializer.serialize(original);
    const restored = serializer.deserialize(data);
    const dataAgain = serializer.serialize(restored);
    
    expect(dataAgain).toEqual(data);
  });
});
```

### LocalStorage

```typescript
describe('LocalStorageLevelStorage', () => {
  let storage: LocalStorageLevelStorage;
  
  beforeEach(() => {
    localStorage.clear();
    storage = new LocalStorageLevelStorage();
  });

  it('should save and load level', async () => {
    const level: LevelData = {
      id: 'test_level',
      name: 'Test',
      version: 1,
      bounds: { width: 800, height: 600 },
      spawnPoint: { x: 0, y: 0 },
      surfaces: [],
      targets: []
    };
    
    await storage.save(level);
    const loaded = await storage.load('test_level');
    
    expect(loaded).toEqual(level);
  });

  it('should return null for non-existent level', async () => {
    const loaded = await storage.load('does_not_exist');
    
    expect(loaded).toBeNull();
  });

  it('should list saved levels', async () => {
    await storage.save({ id: 'level1', name: 'Level 1', version: 1, bounds: { width: 800, height: 600 }, spawnPoint: { x: 0, y: 0 }, surfaces: [], targets: [] });
    await storage.save({ id: 'level2', name: 'Level 2', version: 1, bounds: { width: 800, height: 600 }, spawnPoint: { x: 0, y: 0 }, surfaces: [], targets: [] });
    
    const list = await storage.list();
    
    expect(list).toHaveLength(2);
    expect(list.map(l => l.id)).toContain('level1');
    expect(list.map(l => l.id)).toContain('level2');
  });

  it('should delete level', async () => {
    await storage.save({ id: 'to_delete', name: 'Delete Me', version: 1, bounds: { width: 800, height: 600 }, spawnPoint: { x: 0, y: 0 }, surfaces: [], targets: [] });
    
    await storage.delete('to_delete');
    
    const loaded = await storage.load('to_delete');
    expect(loaded).toBeNull();
    
    const list = await storage.list();
    expect(list.map(l => l.id)).not.toContain('to_delete');
  });
});
```

---

## Test Utilities

```typescript
// tests/helpers.ts

export function createMockArrow(): Arrow {
  return {
    id: `arrow_${Math.random()}`,
    position: { x: 0, y: 0 },
    velocity: { x: 1, y: 0 },
    state: 'flying',
    distanceTraveled: 0,
    maxDistance: 1000,
    update: vi.fn(),
    checkCollisions: vi.fn(),
    stick: vi.fn()
  };
}

export function createRicochetSurface(start: Vector2, end: Vector2): Surface {
  return new RicochetSurface(`ricochet_${Math.random()}`, { start, end });
}

export function createWallSurface(start: Vector2, end: Vector2): Surface {
  return new WallSurface(`wall_${Math.random()}`, { start, end });
}

export function createTestLevel(): Level {
  return new Level(
    'test_level',
    'Test Level',
    { width: 800, height: 600 },
    { x: 100, y: 100 },
    [
      createRicochetSurface({ x: 200, y: 200 }, { x: 400, y: 200 }),
      createWallSurface({ x: 0, y: 500 }, { x: 800, y: 500 })
    ],
    [
      new BasicTarget('t1', { x: 600, y: 100 }, 20)
    ]
  );
}

export function createSurfaceFactory(): SurfaceFactory {
  const factory = new SurfaceFactory();
  factory.register('ricochet', (data) => new RicochetSurface(data.id, data.segment));
  factory.register('wall', (data) => new WallSurface(data.id, data.segment));
  factory.register('breakable', (data) => new BreakableSurface(data.id, data.segment, (data.properties?.health as number) ?? 3));
  return factory;
}

export function createTargetFactory(): TargetFactory {
  const factory = new TargetFactory();
  factory.register('basic', (data) => new BasicTarget(data.id, data.position, data.hitRadius));
  factory.register('multi_hit', (data) => new MultiHitTarget(data.id, data.position, data.hitRadius, (data.properties?.hitsRequired as number) ?? 3));
  return factory;
}
```

---

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific module
npm test -- --grep "TrajectoryCalculator"

# Watch mode during development
npm run test:watch
```

