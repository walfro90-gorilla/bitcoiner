-- 0003_demo_mode.sql — DEMO_MODE togglable en vivo desde el dashboard.
alter table bot_state add column if not exists demo_mode boolean not null default true;
update bot_state set demo_mode = true where id = true;
