// Generic in-memory session store with a TTL.
//
// Used by the chatbot so the (comparatively expensive) query decomposition runs
// ONCE at session start and later steps — scheme selection and FAQ answering —
// reuse the stored decomposition instead of re-deriving it.
//
// In-memory is sufficient for a single-instance demo and needs no schema/secrets.
// For multi-instance deployments or survival across restarts, implement
// `SessionStore` on top of Redis or Supabase and swap it in at the call site;
// callers only depend on the interface.

import { randomUUID } from "node:crypto";

export interface SessionRecord<T> {
  id: string;
  createdAt: number;
  updatedAt: number;
  data: T;
}

export interface SessionStore<T> {
  create(data: T): SessionRecord<T>;
  get(id: string): SessionRecord<T> | null;
  update(id: string, data: T): SessionRecord<T> | null;
  delete(id: string): void;
  size(): number;
}

/** Optional write-through persistence (Redis/Supabase). No implementation required. */
export interface SessionPersistence<T> {
  get(id: string): Promise<SessionRecord<T> | null>;
  set(record: SessionRecord<T>): Promise<void>;
}

export class MemorySessionStore<T> implements SessionStore<T> {
  private readonly records = new Map<string, SessionRecord<T>>();
  private readonly ttlMs: number;
  private readonly persistence: SessionPersistence<T> | null;

  constructor(ttlMs: number = 30 * 60 * 1000, persistence?: SessionPersistence<T>) {
    this.ttlMs = ttlMs;
    this.persistence = persistence ?? null;
  }

  private persist(record: SessionRecord<T>): void {
    if (!this.persistence) return;
    this.persistence.set(record).catch(() => undefined);
  }

  /** Memory first; on a miss, rehydrate from the persistence hook. */
  async getAsync(id: string): Promise<SessionRecord<T> | null> {
    const hit = this.get(id);
    if (hit || !this.persistence) return hit;
    try {
      const stored = await this.persistence.get(id);
      if (stored) this.records.set(id, stored);
      return stored;
    } catch {
      return null;
    }
  }

  private sweep(now: number): void {
    for (const [id, record] of this.records) {
      if (now - record.updatedAt > this.ttlMs) this.records.delete(id);
    }
  }

  create(data: T): SessionRecord<T> {
    const now = Date.now();
    this.sweep(now);
    const record: SessionRecord<T> = {
      id: randomUUID(),
      createdAt: now,
      updatedAt: now,
      data
    };
    this.records.set(record.id, record);
    this.persist(record);
    return record;
  }

  get(id: string): SessionRecord<T> | null {
    const now = Date.now();
    this.sweep(now);
    const record = this.records.get(id);
    if (!record) return null;
    return record;
  }

  update(id: string, data: T): SessionRecord<T> | null {
    const record = this.get(id);
    if (!record) return null;
    record.data = data;
    record.updatedAt = Date.now();
    this.persist(record);
    return record;
  }

  delete(id: string): void {
    this.records.delete(id);
  }

  size(): number {
    return this.records.size;
  }
}