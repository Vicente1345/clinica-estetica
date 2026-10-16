-- ════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Historial de cambios de reservas (auditoría)
-- Ejecutar en Supabase → SQL Editor. Idempotente y NO destructiva: solo crea
-- una tabla nueva. No modifica ni borra datos existentes.
--
-- Registra cada modificación y cancelación de una reserva: qué reserva, qué
-- cambió (antes → después), el motivo, si se hizo con menos de 48 h de
-- anticipación (excepción exclusiva de la administración), quién y cuándo.
-- Mientras esta tabla no exista, la plataforma igual funciona y deja la
-- traza legible en arriendos.obs_modificacion.
--
-- Seguridad: RLS activo SIN policies → la anon key pública no puede leerla;
-- solo el servidor (service_role) escribe y la admin la consulta vía API.
-- ════════════════════════════════════════════════════════════════════

begin;

create table if not exists arriendos_historial (
  id              bigint generated always as identity primary key,
  arriendo_id     uuid not null,
  accion          text not null check (accion in ('modificar', 'cancelar')),
  antes           jsonb,
  despues         jsonb,
  motivo          text,
  dentro_48h      boolean not null default false,  -- true = excepción de administración
  usuario_id      text,
  usuario_nombre  text,
  usuario_rol     text,
  creado_at       timestamptz not null default now()
);
create index if not exists idx_arriendos_historial_arriendo on arriendos_historial(arriendo_id, creado_at desc);
create index if not exists idx_arriendos_historial_fecha on arriendos_historial(creado_at desc);
alter table arriendos_historial enable row level security;

commit;

-- ════════════════════════════════════════════════════════════════════
-- Verificación (solo lectura):
--   select relname, relrowsecurity from pg_class where relname = 'arriendos_historial';  -- true
--   -- Excepciones de administración (cambios con menos de 48 h):
--   select creado_at, accion, usuario_nombre, motivo, antes, despues
--     from arriendos_historial where dentro_48h order by creado_at desc;
-- ════════════════════════════════════════════════════════════════════
