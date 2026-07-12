-- 0020_worker_lease.sql — Elección de líder por lease (anti-SPOF): solo el LÍDER escribe.
-- Permite correr una 2ª instancia del worker en hot-standby sin writes duplicados.
-- Aditivo y DORMANTE: no afecta nada hasta que un worker corra con WORKER_ELECTION=on.

create table if not exists worker_lease (
  id          boolean primary key default true,
  leader_id   text,
  expires_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint worker_lease_single check (id = true)
);
insert into worker_lease (id, leader_id, expires_at) values (true, null, now())
  on conflict (id) do nothing;

-- Adquiere/renueva el lease de forma ATÓMICA (single-row UPDATE con now() del server).
-- Gano si: no hay líder, el lease expiró, o ya soy yo. Devuelve true si soy el líder.
create or replace function acquire_lease(p_instance text, p_ttl_ms integer)
returns boolean language plpgsql as $$
begin
  update worker_lease
    set leader_id  = p_instance,
        expires_at = now() + (p_ttl_ms::text || ' milliseconds')::interval,
        updated_at = now()
    where id = true
      and (leader_id is null or leader_id = p_instance or expires_at < now());
  return found;
end; $$;

-- Libera el lease (solo si soy el líder) para un relevo inmediato en un apagado limpio.
create or replace function release_lease(p_instance text)
returns void language plpgsql as $$
begin
  update worker_lease set expires_at = now(), updated_at = now()
    where id = true and leader_id = p_instance;
end; $$;

revoke all on function acquire_lease(text, integer) from public, anon, authenticated;
revoke all on function release_lease(text) from public, anon, authenticated;
grant execute on function acquire_lease(text, integer) to service_role;
grant execute on function release_lease(text) to service_role;
