/**
 * SystemCoordinator - Manages systems and routes events
 *
 * Responsibilities:
 * - Register and manage trajectory systems
 * - Route engine updates to all systems
 * - Connect systems for inter-system communication
 * - Coordinate per-frame updates
 */

import type { ITrajectoryEngine } from "@/trajectory-v2/engine/ITrajectoryEngine";
import type { EngineResults, Unsubscribe } from "@/trajectory-v2/engine/types";
import type {
  AimingEvent,
  IEventConsumer,
  IEventProducer,
  ITrajectorySystem,
} from "@/trajectory-v2/systems/ITrajectorySystem";
import type { RegisteredSystem } from "./types";

/**
 * SystemCoordinator implementation.
 */
export class SystemCoordinator {
  private engine: ITrajectoryEngine;
  private systems: Map<string, RegisteredSystem> = new Map();
  private connections: Map<string, Unsubscribe[]> = new Map();
  private engineUnsubscribe: Unsubscribe | null = null;

  constructor(engine: ITrajectoryEngine) {
    this.engine = engine;

    // Subscribe to engine updates
    this.engineUnsubscribe = engine.onResultsChanged((results) => {
      this.routeEngineUpdate(results);
    });
  }

  /**
   * Register a system with the coordinator.
   * @param system The system to register
   * @param priority Update priority (lower = first)
   */
  registerSystem(system: ITrajectorySystem, priority = 0): void {
    if (this.systems.has(system.id)) {
      throw new Error(`System "${system.id}" is already registered`);
    }

    this.systems.set(system.id, { system, priority });
  }

  /**
   * Unregister a system.
   */
  unregisterSystem(systemId: string): void {
    const registered = this.systems.get(systemId);
    if (registered) {
      registered.system.dispose();
      this.systems.delete(systemId);

      // Clean up connections for this system
      const unsubscribes = this.connections.get(systemId);
      if (unsubscribes) {
        for (const unsubscribe of unsubscribes) {
          unsubscribe();
        }
        this.connections.delete(systemId);
      }
    }
  }

  /**
   * Get a registered system by ID.
   */
  getSystem<T extends ITrajectorySystem>(systemId: string): T | undefined {
    return this.systems.get(systemId)?.system as T | undefined;
  }

  /**
   * Connect a producer system to a consumer system.
   */
  connect<TEvent>(
    producerId: string,
    consumerId: string,
    _eventType?: string
  ): void {
    const producer = this.getSystem<ITrajectorySystem & IEventProducer<TEvent>>(
      producerId
    );
    const consumer = this.getSystem<ITrajectorySystem & IEventConsumer<TEvent>>(
      consumerId
    );

    if (!producer) {
      throw new Error(`Producer system "${producerId}" not found`);
    }
    if (!consumer) {
      throw new Error(`Consumer system "${consumerId}" not found`);
    }

    if (!("onEvent" in producer)) {
      throw new Error(`System "${producerId}" is not an event producer`);
    }
    if (!("handleEvent" in consumer)) {
      throw new Error(`System "${consumerId}" is not an event consumer`);
    }

    // Subscribe consumer to producer events
    const unsubscribe = producer.onEvent((event: TEvent) => {
      consumer.handleEvent(event);
    });

    // Track connection for cleanup
    if (!this.connections.has(producerId)) {
      this.connections.set(producerId, []);
    }
    this.connections.get(producerId)!.push(unsubscribe);
  }

  /**
   * Connect aiming system to arrow system (convenience method).
   */
  connectAimingToArrow(): void {
    this.connect<AimingEvent>("aiming", "arrow");
  }

  /**
   * Route engine results to all systems.
   */
  private routeEngineUpdate(results: EngineResults): void {
    // Sort systems by priority
    const sorted = Array.from(this.systems.values()).sort(
      (a, b) => a.priority - b.priority
    );

    for (const { system } of sorted) {
      system.onEngineUpdate(results);
    }
  }

  /**
   * Update all systems (call once per frame).
   */
  update(deltaTime: number): void {
    // Sort systems by priority
    const sorted = Array.from(this.systems.values()).sort(
      (a, b) => a.priority - b.priority
    );

    for (const { system } of sorted) {
      system.update(deltaTime);
    }
  }

  /**
   * Trigger an engine recalculation and route to systems.
   */
  refresh(): void {
    this.engine.invalidateAll();
  }

  /**
   * Get the engine instance.
   */
  getEngine(): ITrajectoryEngine {
    return this.engine;
  }

  /**
   * Get all registered system IDs.
   */
  getSystemIds(): readonly string[] {
    return Array.from(this.systems.keys());
  }

  /**
   * Clean up all resources.
   */
  dispose(): void {
    // Dispose all systems
    for (const { system } of this.systems.values()) {
      system.dispose();
    }
    this.systems.clear();

    // Clean up all connections
    for (const unsubscribes of this.connections.values()) {
      for (const unsubscribe of unsubscribes) {
        unsubscribe();
      }
    }
    this.connections.clear();

    // Unsubscribe from engine
    if (this.engineUnsubscribe) {
      this.engineUnsubscribe();
      this.engineUnsubscribe = null;
    }

    // Dispose engine
    this.engine.dispose();
  }
}

/**
 * Factory function to create a fully wired coordinator.
 */
export function createCoordinator(engine: ITrajectoryEngine): SystemCoordinator {
  return new SystemCoordinator(engine);
}

