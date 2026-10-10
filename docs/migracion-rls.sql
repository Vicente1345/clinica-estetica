-- ════════════════════════════════════════════════════════════════════
-- MIGRACIÓN RLS: blindaje de la base de datos (Etapas 1 y 2 del plan
-- docs/migracion-seguridad.sql, unificadas ahora que TODO el tráfico de la
-- app pasa por endpoints con service_role).
--
-- ⚠ EJECUTAR SOLO CUANDO:
--   1. El código RLS esté desplegado en producción (push a main hecho), y
--   2. El "Diagnóstico de seguridad" (Configuración → 🛡, como admin) diga
--      "✓ Lista para activar el blindaje RLS" — en particular que la
--      consulta de prueba de la SUPABASE_SERVICE_ROLE_KEY diga "ok".
--      Si la key está mala, este SQL DEJA CAÍDA LA PLATAFORMA (login
--      incluido) hasta corregirla y redeployar.
--
-- Qué hace:
--   · Habilita RLS en las 10 tablas de la app (idempotente).
--   · Elimina TODAS las policies permisivas (hoy son ALL/true para anon:
--     cualquiera con la anon key del bundle lee y escribe todo, incluidas
--     las contraseñas de usuarios y los datos de pacientes).
--   · NO crea policies nuevas para las tablas → la anon key queda con CERO
--     acceso. Los endpoints usan service_role, que bypassa RLS.
--   · Storage (bucket comprobantes): solo INSERT para anon (subir un
--     comprobante nuevo); listar/leer/sobrescribir queda cerrado — la
--     visualización pasa por /api/comprobante-url (URL firmada, con
--     verificación de identidad).
--
-- Rollback de emergencia: docs/rollback-rls.sql (restaura acceso abierto).
-- ════════════════════════════════════════════════════════════════════

begin;

-- 1. RLS habilitado en todas las tablas de la app
alter table usuarios             enable row level security;
alter table profesionales        enable row level security;
alter table boxes                enable row level security;
alter table arriendos            enable row level security;
alter table solicitudes_paciente enable row level security;
alter table planes_profesional   enable row level security;
alter table pagos_plan           enable row level security;
alter table insumos              enable row level security;
alter table movimientos          enable row level security;
alter table webpay_transacciones enable row level security;

-- 2. Fuera TODAS las policies de esas tablas (las actuales son ALL/true)
do $$
declare r record;
begin
  for r in
    select policyname, tablename from pg_policies
    where schemaname = 'public'
      and tablename in ('usuarios','profesionales','boxes','arriendos',
                        'solicitudes_paciente','planes_profesional','pagos_plan',
                        'insumos','movimientos','webpay_transacciones')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
    raise notice 'eliminada policy % de %', r.policyname, r.tablename;
  end loop;
end $$;

-- 3. (intencional) Sin policies nuevas: anon y authenticated quedan sin
--    acceso alguno a las tablas. service_role no pasa por RLS.

-- 4. Eliminar las vistas públicas heredadas: una vista corre con los
--    privilegios de su DUEÑO (postgres), así que NO pasa por RLS — si
--    quedaran, la anon key seguiría leyendo arriendos a través de ellas.
--    (El widget de GitHub Pages ya no las usa: lee /api/ocupacion.)
drop view if exists public_disponibilidad cascade;
drop view if exists public_boxes cascade;
drop view if exists citas_ocupacion cascade;

commit;

-- 5. Storage: bucket 'comprobantes' → anon solo puede SUBIR (insert).
--    Se ejecuta fuera de la transacción porque storage.objects pertenece al
--    sistema de Storage. Si este bloque falla con "must be owner of table
--    objects", crear/eliminar las policies desde el Dashboard:
--    Storage → Policies → comprobantes (mismas reglas que abajo).
do $$
declare r record;
begin
  for r in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
  loop
    execute format('drop policy %I on storage.objects', r.policyname);
    raise notice 'eliminada policy storage %', r.policyname;
  end loop;
end $$;

create policy comprobantes_subir_anon on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'comprobantes');

-- ════════════════════════════════════════════════════════════════════
-- Verificación (solo lectura):
--   -- Debe devolver 0 filas (ninguna policy en las tablas de la app):
--   select tablename, policyname from pg_policies
--    where schemaname='public'
--      and tablename in ('usuarios','profesionales','boxes','arriendos',
--        'solicitudes_paciente','planes_profesional','pagos_plan',
--        'insumos','movimientos','webpay_transacciones');
--   -- Debe devolver exactamente 1 fila (comprobantes_subir_anon, cmd INSERT):
--   select policyname, cmd from pg_policies
--    where schemaname='storage' and tablename='objects';
--   -- Las vistas heredadas ya no existen (debe devolver 0 filas):
--   select viewname from pg_views where schemaname='public'
--    and viewname in ('public_boxes','public_disponibilidad','citas_ocupacion');
--   -- RLS activo en las 10 (relrowsecurity = true):
--   select relname, relrowsecurity from pg_class
--    where relname in ('usuarios','profesionales','boxes','arriendos',
--      'solicitudes_paciente','planes_profesional','pagos_plan',
--      'insumos','movimientos','webpay_transacciones');
--
-- Prueba funcional inmediata después (la hace Claude, o manual):
--   · Con la anon key: GET /rest/v1/usuarios → [] o error (ya no filtra datos)
--   · Login en la web funciona; Dashboard carga; el calendario público de la
--     portada muestra disponibilidad; el bot responde.
-- ════════════════════════════════════════════════════════════════════
