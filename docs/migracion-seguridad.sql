-- ============================================================================
-- docs/migracion-seguridad.sql — Saneamiento de seguridad y datos (spec v4 §1.3)
-- ============================================================================
-- ⚠ NO EJECUTAR DE UNA SOLA VEZ. Está dividida en etapas que se aplican
--   COORDINADAS con los despliegues de código indicados. Ejecutar una etapa
--   antes de su despliegue rompe la aplicación en producción.
--
-- Estado verificado el 30-08-2026 contra la BD real:
--   · migracion-recurso.sql YA aplicada (constraints presentes, 40/41 legacy)
--   · RLS habilitado en las 10 tablas, pero con policies ALL/true para
--     public/anon en todas → acceso total efectivo con la anon key.
-- ============================================================================


-- ════════════════════════════════════════════════════════════════════════════
-- ETAPA 0 — DDL nuevas. SIN RIESGO: solo agrega objetos, no cambia permisos.
-- Se puede ejecutar en cualquier momento.
-- ════════════════════════════════════════════════════════════════════════════

-- 0.1 · Tabla de pacientes normalizada (spec v4 §4; hoy cada cita repite los
--       datos y no hay identidad de paciente).
create table if not exists pacientes (
  id               uuid primary key default gen_random_uuid(),
  nombre           text not null,
  tipo_documento   text not null default 'rut' check (tipo_documento in ('rut','pasaporte','dni')),
  documento        text not null,               -- normalizado (sin puntos, con guión para RUT)
  fecha_nacimiento date,
  telefono         text,                        -- E.164, ej: +56937742182
  email            text,
  creado_en        timestamptz not null default now(),
  unique (tipo_documento, documento)
);
alter table pacientes enable row level security;   -- sin policies: solo service_role

-- 0.2 · Vincular citas a pacientes y registrar el canal de origen
--       (la columna `origen` alimenta la métrica de atribución de la spec §11).
alter table solicitudes_paciente add column if not exists paciente_id uuid references pacientes(id);
alter table solicitudes_paciente add column if not exists origen text not null default 'web_chatbot'
  check (origen in ('web_chatbot','whatsapp_agente','manual','telefono'));
create index if not exists idx_solicitudes_paciente_paciente on solicitudes_paciente(paciente_id);

-- 0.3 · Registro de consentimientos y de supresiones de mensajería
--       (RL-01/RL-11 de la spec; las usará el agente de WhatsApp).
create table if not exists consentimientos (
  id           bigint generated always as identity primary key,
  paciente_id  uuid references pacientes(id),
  telefono     text,
  tipo         text not null check (tipo in ('aviso_privacidad','datos_personales','menor_adulto_responsable')),
  version      text not null,           -- versión del texto mostrado
  otorgado     boolean not null,
  registrado_en timestamptz not null default now()
);
alter table consentimientos enable row level security;

create table if not exists supresiones_mensajeria (
  telefono      text primary key,        -- E.164
  motivo        text,
  registrado_en timestamptz not null default now()
);
alter table supresiones_mensajeria enable row level security;

-- 0.4 · Tarifas de arriendo en BD (S6): hoy existen TRES catálogos divergentes
--       hardcodeados (calcularPrecio en JS, PLANES en JS, prompt del bot) y
--       Dental figura a $9.000/h en uno y $15.000-18.000/h en otros.
--       Semilla desde calcularPrecio; ⚠ VALIDAR CON LA CLÍNICA cuál es el
--       vigente antes de apuntar el código aquí (Anexo H #3 de la spec).
create table if not exists tarifas_arriendo (
  recurso        text primary key check (recurso in ('estetico','dental','medico')),
  precio_1h      int not null,
  precio_2h      int not null,
  precio_3h      int not null,
  precio_jornada int not null,           -- sobre 3 horas
  horas_minimas  int not null default 1,
  actualizado_en timestamptz not null default now()
);
insert into tarifas_arriendo (recurso, precio_1h, precio_2h, precio_3h, precio_jornada, horas_minimas) values
  ('estetico', 10000, 18000, 27000, 45000, 1),
  ('dental',    9000, 18000, 27000, 45000, 1),   -- ⚠ PLANES/bot dicen 15.000-18.000/h: RESOLVER
  ('medico',   12000, 24000, 36000, 55000, 2)
on conflict (recurso) do nothing;
alter table tarifas_arriendo enable row level security;
create policy tarifas_lectura_publica on tarifas_arriendo for select to anon, authenticated using (true);

-- 0.5 · Arancel de tratamientos a pacientes (lo que el agente de WhatsApp
--       podrá citar; se llena en Fase 0 con las profesionales — Anexo H #16).
create table if not exists arancel_tratamientos (
  id             bigint generated always as identity primary key,
  tratamiento    text not null unique,
  recurso        text check (recurso in ('estetico','dental','medico')),
  tipo_precio    text not null default 'fijo' check (tipo_precio in ('fijo','referencial_desde','requiere_evaluacion')),
  precio         int,                     -- null cuando requiere_evaluacion
  visible_bot    boolean not null default true,
  actualizado_en timestamptz not null default now()
);
alter table arancel_tratamientos enable row level security;
create policy arancel_lectura_publica on arancel_tratamientos for select to anon, authenticated using (true);


-- ════════════════════════════════════════════════════════════════════════════
-- ETAPA 1 — Blindar `usuarios`. EJECUTAR SOLO DESPUÉS de desplegar la rama
-- seguridad-fase0 CON las env vars configuradas (SESSION_SECRET,
-- SUPABASE_SERVICE_ROLE_KEY): login y gestión de usuarios ya pasan por
-- /api/login y /api/usuarios, que usan service_role (bypassa RLS).
-- Tras esto, la anon key del bundle NO puede leer ni escribir usuarios
-- (hoy puede leer las contraseñas en texto plano de toda la tabla).
-- ════════════════════════════════════════════════════════════════════════════

-- drop policy if exists acceso_total on usuarios;

-- Verificación posterior (debe devolver 0 filas):
--   select policyname from pg_policies where tablename='usuarios';
-- Prueba funcional: login en la web sigue funcionando; pestaña Configuración
-- lista/crea/edita usuarios; una consulta REST con la anon key a /rest/v1/usuarios
-- devuelve vacío o error.


-- ════════════════════════════════════════════════════════════════════════════
-- ETAPA 2 — Blindaje del resto. NO EJECUTAR AÚN: requiere mover a endpoints
-- las escrituras que el navegador todavía hace directo con la anon key:
--   · planes_profesional  → App.js, TabPlanes.js, Calendario.js (descuento de jornadas)
--   · pagos_plan          → GestionPlanes.js
--   · insumos/movimientos → App.js (inventario)
--   · boxes/profesionales → App.js (configuración)
--   · arriendos.comprobante_url → Comprobante.js
--   · lectura de solicitudes_paciente para disponibilidad → Landing.js
--     (⚠ hoy anon puede leer TODAS las columnas, incluidos nombre/teléfono/RUT
--      de los pacientes: la policy es por fila, no por columna)
-- Diseño objetivo cuando eso ocurra:
--   1. Vista de ocupación SIN datos personales, para el calendario público:
--      create view citas_ocupacion as
--        select box_tipo, fecha_solicitada, hora_inicio, hora_fin, estado
--        from solicitudes_paciente;
--      grant select on citas_ocupacion to anon;
--   2. solicitudes_paciente: drop "Permitir todo anon"; queda INSERT-only anon
--      (el formulario público) + service_role para todo lo demás.
--   3. arriendos: drop acceso_total; anon queda con SELECT de columnas de
--      ocupación vía vista equivalente; escrituras solo por /api/reservar,
--      /api/cancelar-arriendo y /api/webpay-commit (service_role).
--   4. Tablas restantes: service_role only + endpoints por operación.
-- ════════════════════════════════════════════════════════════════════════════
