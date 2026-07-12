// worker/leader.ts — Elección de líder por lease en Postgres (anti-SPOF).
// Solo el LÍDER escribe a la DB; los standby quedan calientes (feeds + engine) y toman el
// relevo en ~TTL si el líder deja de renovar. La atomicidad la garantiza acquire_lease()
// (UPDATE condicional server-side con now(), migración 0020): dos workers nunca ganan a la vez.
// Un solo worker gana el lease de inmediato. Default OFF (WORKER_ELECTION) → sin efecto.
import os from 'node:os';
import { supabase } from './supabase';

const TTL_MS = 15_000; // vida del lease
const RENEW_MS = 5_000; // el líder renueva ~3× por TTL

/** Id único por proceso (hostname-pid-rnd), saneado para caber en un filtro/valor de texto. */
export function makeInstanceId(): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${os.hostname()}-${process.pid}-${rnd}`.replace(/[^a-zA-Z0-9_.-]/g, '');
}

/** Intenta adquirir/renovar el lease. Devuelve true si soy líder. LANZA si hay error de red. */
export type AcquireFn = (instance: string, ttlMs: number) => Promise<boolean>;

const defaultAcquire: AcquireFn = async (instance, ttlMs) => {
  if (!supabase) return true; // sin DB = modo local/single → siempre líder
  const { data, error } = await supabase.rpc('acquire_lease', { p_instance: instance, p_ttl_ms: ttlMs });
  if (error) throw new Error(error.message);
  return data === true;
};

export class LeaderElection {
  private leader = false;
  private timer?: ReturnType<typeof setInterval>;
  private readonly acquire: AcquireFn;
  private readonly onChange?: (isLeader: boolean) => void;
  private readonly ttlMs: number;
  private readonly renewMs: number;

  constructor(
    readonly instanceId: string,
    opts: { acquire?: AcquireFn; onChange?: (l: boolean) => void; ttlMs?: number; renewMs?: number } = {},
  ) {
    this.acquire = opts.acquire ?? defaultAcquire;
    this.onChange = opts.onChange;
    this.ttlMs = opts.ttlMs ?? TTL_MS;
    this.renewMs = opts.renewMs ?? RENEW_MS;
  }

  isLeader(): boolean {
    return this.leader;
  }

  /** Un ciclo de adquisición/renovación. Ante error de red MANTIENE el estado actual
   *  (no cede el liderazgo por un blip transitorio; si es partición real, sus writes fallan
   *  igual y el standby que sí alcanza la DB toma el relevo al expirar el lease). */
  async tick(): Promise<boolean> {
    try {
      const won = await this.acquire(this.instanceId, this.ttlMs);
      this.set(won);
      return won;
    } catch (e) {
      console.error('[leader] tick (mantengo estado):', (e as Error).message);
      return this.leader;
    }
  }

  /** Adquiere de inmediato (boot, síncrono) y arranca la renovación periódica. */
  async start(): Promise<void> {
    await this.tick();
    this.timer = setInterval(() => void this.tick(), this.renewMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
    if (this.leader && supabase) void supabase.rpc('release_lease', { p_instance: this.instanceId });
    this.set(false);
  }

  private set(next: boolean): void {
    if (next !== this.leader) {
      this.leader = next;
      console.log(`[leader] ${next ? '👑 SOY LÍDER' : '⏸ standby'} (${this.instanceId})`);
      this.onChange?.(next);
    }
  }
}
