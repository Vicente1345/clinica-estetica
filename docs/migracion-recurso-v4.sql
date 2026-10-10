-- ════════════════════════════════════════════════════════════════════
-- MIGRACIÓN v4: Dental y Pabellón comparten UN solo espacio físico
-- Ejecutar en Supabase → SQL Editor (requiere rol de administrador).
-- Es idempotente: se puede ejecutar más de una vez sin daño.
-- REQUIERE v2 (docs/migracion-recurso.sql) y v3 (docs/migracion-recurso-v3.sql).
--
-- ⚠ ORDEN DE DESPLIEGUE: 1° desplegar el código v4 (push a main),
--   2° ejecutar ESTE SQL de inmediato. En la ventana entre ambos pasos no
--   hay riesgo de doble reserva (el candado viejo sigue activo y solo puede
--   producir un falso rechazo Dental×Pabellón), pero la ventana debe ser
--   mínima.
--
-- Cambio de estructura respecto de v3:
--   ANTES: Box Dental independiente · Pabellón independiente
--          · Box Mixto (Médico+Estético)
--   AHORA: - Box Dental y Pabellón = DOS MODALIDADES COMERCIALES del MISMO
--            recinto físico (recurso 'dental_pabellon'): reservar una
--            bloquea a la otra en ese horario, sin dobles reservas.
--          - Box Mixto Médico/Estético: sin cambios (recurso
--            'medico_estetico').
--   Cada reserva es UNA fila real con su modalidad contratada (dental o
--   pabellon); la exclusión por recurso bloquea a la modalidad hermana.
--
-- Qué hace:
--   1. CONSOLIDA el Box Dental duplicado: deja un único box dental canónico
--      (el activo con más reservas) y le reasigna las reservas de los
--      duplicados, conservando TODO el historial (no borra ningún arriendo
--      ni profesional). Los duplicados quedan desactivados, no se eliminan.
--   2. Marca legacy cualquier par de reservas ACTIVAS Dental×Pabellón que
--      se solaparía bajo la agenda compartida (hoy no existe ninguna:
--      el Pabellón tiene 0 reservas; el paso es defensivo e idempotente).
--   3. Re-mapea boxes.recurso: dental y pabellon → 'dental_pabellon'.
--   4. Actualiza el trigger para que las reservas nuevas de dental o
--      pabellon queden en el recurso compartido 'dental_pabellon'.
--   5. Re-backfill de recurso en TODOS los arriendos. Al actualizar, el
--      candado arriendos_no_solape_recurso re-verifica cada fila: si algo
--      chocara, la migración se revierte completa (transaccional).
--   Los CHECK de modalidad (médico ≥2h, pabellón bloques 1/2/4/8) no
--   cambian: siguen aplicando por modalidad contratada.
-- ════════════════════════════════════════════════════════════════════

begin;

-- 1. Consolidación del Box Dental duplicado (conserva historial completo)
do $$
declare
  v_canon boxes.id%type;
  v_nombre text;
  v_activos int;
begin
  select count(*) into v_activos from boxes where tipo = 'dental' and activo;
  if v_activos = 0 then
    raise exception 'CONSOLIDACIÓN ABORTADA: no hay ningún box dental ACTIVO. Activa el box dental correcto y reintenta.';
  end if;

  -- Canónico: el box dental activo con más reservas
  select b.id, b.nombre into v_canon, v_nombre
    from boxes b
   where b.tipo = 'dental' and b.activo
   order by (select count(*) from arriendos a where a.box_id = b.id) desc
   limit 1;

  -- Si hubiera más de un dental activo, los demás se desactivan (no se borran)
  update boxes set activo = false
   where tipo = 'dental' and activo and id <> v_canon;

  -- Reasignar al canónico las reservas de los duplicados (historial intacto)
  update arriendos a
     set box_id = v_canon,
         box_nombre = v_nombre
    from boxes b
   where a.box_id = b.id
     and b.tipo = 'dental'
     and b.id <> v_canon;

  raise notice 'Box dental canónico: % (%)', v_nombre, v_canon;
end $$;

-- 2. Reservas activas Dental×Pabellón que chocarían bajo la agenda
--    compartida: se marcan legacy (exentas del candado, contenido intacto)
with comp as (
  select a.id, a.fecha, a.hora_inicio, a.hora_fin
  from arriendos a
  join boxes b on b.id = a.box_id
  where b.tipo in ('dental', 'pabellon')
    and a.estado in ('pendiente', 'confirmado')
    and not a.legacy
), pares as (
  select distinct c1.id
  from comp c1
  join comp c2 on c1.id <> c2.id and c1.fecha = c2.fecha
    and hora_a_minutos(c1.hora_inicio) < hora_a_minutos(c2.hora_fin)
    and hora_a_minutos(c2.hora_inicio) < hora_a_minutos(c1.hora_fin)
)
update arriendos set legacy = true where id in (select id from pares);

-- 3. Nuevo mapeo de recursos físicos en boxes
update boxes set recurso = case
  when tipo in ('dental', 'pabellon') then 'dental_pabellon'
  else 'medico_estetico'
end;

-- 4. Trigger v4: dental y pabellon comparten recurso
create or replace function set_arriendo_recurso()
returns trigger language plpgsql as $$
declare
  vtipo text;
begin
  select tipo into vtipo from boxes where id = new.box_id;
  new.modalidad := coalesce(vtipo, 'estetico');
  new.recurso := case
    when vtipo in ('dental', 'pabellon') then 'dental_pabellon'
    else 'medico_estetico'
  end;
  return new;
end $$;
-- (el trigger trg_arriendo_recurso ya existe sobre esta función)

-- 5. Re-backfill de recurso y modalidad en TODOS los arriendos
update arriendos a
   set recurso   = case
         when b.tipo in ('dental', 'pabellon') then 'dental_pabellon'
         else 'medico_estetico'
       end,
       modalidad = b.tipo
  from boxes b
 where a.box_id = b.id
   and (a.recurso is distinct from case
          when b.tipo in ('dental', 'pabellon') then 'dental_pabellon'
          else 'medico_estetico'
        end
        or a.modalidad is distinct from b.tipo);

commit;

-- ════════════════════════════════════════════════════════════════════
-- Verificación (solo lectura):
--   select nombre, tipo, recurso, tarifa_hora, activo,
--          (select count(*) from arriendos a where a.box_id = b.id) as reservas
--     from boxes b order by nombre;
--   -- Esperado: un solo dental ACTIVO con todas las reservas dentales;
--   --           dental y pabellon con recurso 'dental_pabellon'.
--   select recurso, modalidad, count(*) from arriendos group by 1,2 order by 1,2;
--   -- Reservas marcadas legacy por el paso 2 (conflictos Dental×Pabellón):
--   select id, box_nombre, fecha, hora_inicio, hora_fin, estado
--     from arriendos where legacy and estado in ('pendiente','confirmado')
--     order by fecha, hora_inicio;
--
-- Prueba del candado (opcional): dentro de BEGIN…ROLLBACK, insertar un
-- arriendo dental y otro pabellón solapados el mismo día (fecha futura
-- tipo 2099-01-01): el segundo debe fallar con 23P01. Un médico al mismo
-- horario debe pasar (es otro espacio físico).
-- ════════════════════════════════════════════════════════════════════
