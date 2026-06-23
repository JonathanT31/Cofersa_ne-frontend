-- Tabla de notificaciones in-app para la pestaña "Notificaciones".
-- Ejecutar una sola vez en el SQL Editor de Supabase.
--
-- Guarda un registro por cada evento relevante para un usuario:
--   solicitud_enviada | solicitud_aprobada | solicitud_cancelada | cambio_password | login_alerta

create table if not exists negociaciones_especiales.notificaciones (
    id          bigint generated always as identity primary key,
    user_id     uuid        not null,                 -- destinatario de la notificación
    tipo        text        not null,                 -- ver tipos arriba
    titulo      text        not null,
    mensaje     text,
    entity_type text,                                 -- p.ej. 'solicitud'
    entity_id   bigint,                               -- id de la solicitud relacionada (si aplica)
    url         text,                                 -- ruta interna a abrir (p.ej. /solicitud/123)
    leida       boolean     not null default false,
    created_at  timestamptz not null default now()
);

-- Índice para listar rápido las notificaciones de un usuario por fecha.
create index if not exists idx_notificaciones_user_created
    on negociaciones_especiales.notificaciones (user_id, created_at desc);

-- Permisos (el resto de la app usa la llave anon; mantenemos el mismo modelo).
grant usage on schema negociaciones_especiales to anon, authenticated, service_role;
grant select, insert, update, delete on negociaciones_especiales.notificaciones
    to anon, authenticated, service_role;
grant usage, select on all sequences in schema negociaciones_especiales
    to anon, authenticated, service_role;

-- OPCIONAL: si en el futuro quieren activar Row Level Security para que cada
-- usuario solo vea/edite sus propias notificaciones (el backend usa service_role,
-- que omite RLS). Descomentar el bloque siguiente:
--
-- alter table negociaciones_especiales.notificaciones enable row level security;
--
-- create policy "ver propias notificaciones"
--     on negociaciones_especiales.notificaciones for select
--     using (auth.uid() = user_id);
--
-- create policy "insertar propias notificaciones"
--     on negociaciones_especiales.notificaciones for insert
--     with check (auth.uid() = user_id);
--
-- create policy "actualizar propias notificaciones"
--     on negociaciones_especiales.notificaciones for update
--     using (auth.uid() = user_id);
