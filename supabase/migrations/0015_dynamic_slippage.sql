-- 0015_dynamic_slippage.sql — Slippage dinámico por liquidez (cierra Tarea 1), configurable en vivo.
-- Default false → cero cambio de comportamiento; el operador lo activa desde el Centro de Configuración.
alter table runtime_config add column if not exists dynamic_slippage boolean not null default false;
