-- ════════════════════════════════════════════════════════════════════
-- MIGRACIÓN: Planes Especiales (privados, asignados solo por Admin)
-- Ejecutar en Supabase → SQL Editor. Es idempotente y NO destructiva:
-- solo agrega una tabla de definiciones, columnas nuevas (todas opcionales)
-- y una tabla de historial. No modifica ni borra datos existentes.
-- Respaldo previo tomado el 12-10-2026 (carpeta local privada).
--
-- Decisiones confirmadas por Vicente (12-10-2026):
--   · El valor de cada plan es MENSUAL (igual que el catálogo: "cobro mensual")
--   · La admin define día y horario de cada jornada al asignar
--   · Las reservas que crea la asignación quedan CONFIRMADAS
--
-- Seguridad: las dos tablas nuevas quedan con RLS activo y SIN policies →
-- la anon key pública no puede leerlas (las condiciones económicas solo las
-- ve la Admin a través del servidor, que usa service_role).
-- ════════════════════════════════════════════════════════════════════

begin;

-- 1. Definiciones de los planes especiales (fuera del catálogo público)
create table if not exists planes_especiales (
  id                  text primary key,
  nombre              text not null,
  box_tipo            text not null check (box_tipo in ('dental','estetico','medico','pabellon')),
  jornadas_semanales  int  not null check (jornadas_semanales between 1 and 7),
  precio_mensual      int  not null check (precio_mensual >= 0),
  vigencia_meses      int  not null default 12 check (vigencia_meses between 1 and 12),
  descripcion         text,
  activo              boolean not null default true,
  actualizado_por     text,
  actualizado_at      timestamptz not null default now()
);
alter table planes_especiales enable row level security;

insert into planes_especiales (id, nombre, box_tipo, jornadas_semanales, precio_mensual, vigencia_meses, descripcion)
values
  ('esp_dental',   'Plan Especial Dental',   'dental',   3, 650000, 12, '3 jornadas semanales · vigencia anual · cobro mensual'),
  ('esp_estetico', 'Plan Especial Estético', 'estetico', 2, 350000, 12, '2 días completos por semana · vigencia anual · cobro mensual')
on conflict (id) do nothing;

-- 2. Asignaciones: se guardan en planes_profesional (misma estructura que los
--    planes normales) con columnas adicionales opcionales
alter table planes_profesional add column if not exists es_especial      boolean not null default false;
alter table planes_profesional add column if not exists plan_especial_id text references planes_especiales(id);
alter table planes_profesional add column if not exists horario          jsonb;   -- [{dia:1..7, hora_inicio, hora_fin}]
alter table planes_profesional add column if not exists asignado_por     text;
alter table planes_profesional add column if not exists asignado_at      timestamptz;
alter table planes_profesional add column if not exists modificado_por   text;
alter table planes_profesional add column if not exists modificado_at    timestamptz;
alter table planes_profesional add column if not exists finalizado_por   text;
alter table planes_profesional add column if not exists finalizado_at    timestamptz;

-- 3. Vínculo de cada jornada reservada con su plan (para modificar o
--    finalizar SOLO las reservas propias del plan, nunca las de terceros)
--    (la columna ya existía de un modelo anterior, sin uso: 0 filas con valor
--    al 16-10-2026; solo se agrega la FK si el tipo es uuid y aún no la tiene,
--    para que la migración no falle si el tipo heredado fuera otro)
alter table arriendos add column if not exists plan_profesional_id uuid;
do $$
begin
  if (select data_type from information_schema.columns
       where table_schema = 'public' and table_name = 'arriendos' and column_name = 'plan_profesional_id') = 'uuid'
     and not exists (select 1 from pg_constraint where conname = 'arriendos_plan_profesional_fk') then
    alter table arriendos add constraint arriendos_plan_profesional_fk
      foreign key (plan_profesional_id) references planes_profesional(id) on delete set null;
  end if;
end $$;
create index if not exists idx_arriendos_plan_profesional on arriendos(plan_profesional_id);

-- 4. Historial: quién asignó / modificó / finalizó y cuándo
create table if not exists planes_especiales_historial (
  id                   bigint generated always as identity primary key,
  plan_profesional_id  uuid references planes_profesional(id) on delete set null,
  plan_especial_id     text references planes_especiales(id),
  accion               text not null check (accion in ('asignar','modificar','finalizar','editar_condiciones')),
  usuario_id           text,
  usuario_nombre       text,
  detalle              jsonb,
  creado_at            timestamptz not null default now()
);
create index if not exists idx_pe_historial_plan on planes_especiales_historial(plan_profesional_id);
alter table planes_especiales_historial enable row level security;

commit;

-- ════════════════════════════════════════════════════════════════════
-- Verificación (solo lectura):
--   select id, nombre, box_tipo, jornadas_semanales, precio_mensual, vigencia_meses
--     from planes_especiales order by id;          -- 2 filas
--   select column_name from information_schema.columns
--    where table_name = 'planes_profesional' and column_name in
--     ('es_especial','plan_especial_id','horario','asignado_por');   -- 4 filas
--   select column_name from information_schema.columns
--    where table_name = 'arriendos' and column_name = 'plan_profesional_id';  -- 1 fila
--   select relname, relrowsecurity from pg_class
--    where relname in ('planes_especiales','planes_especiales_historial');  -- ambas true
-- ════════════════════════════════════════════════════════════════════
