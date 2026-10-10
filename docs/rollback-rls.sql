-- ════════════════════════════════════════════════════════════════════
-- ROLLBACK DE EMERGENCIA del blindaje RLS (docs/migracion-rls.sql).
-- Restaura el acceso abierto con la anon key, dejando la plataforma como
-- estaba ANTES del blindaje (inseguro pero funcional). Usar SOLO si algo
-- quedó caído y no se puede corregir rápido por el camino normal
-- (normalmente basta corregir SUPABASE_SERVICE_ROLE_KEY en Vercel y
-- redeployar — eso NO requiere este rollback).
-- ════════════════════════════════════════════════════════════════════

begin;

do $$
declare t text;
begin
  foreach t in array array['usuarios','profesionales','boxes','arriendos',
    'solicitudes_paciente','planes_profesional','pagos_plan',
    'insumos','movimientos','webpay_transacciones']
  loop
    execute format(
      'create policy acceso_total_rollback on public.%I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end $$;

commit;

-- Storage: reabrir el bucket comprobantes (lectura y escritura anon)
create policy comprobantes_abierto_rollback on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'comprobantes')
  with check (bucket_id = 'comprobantes');

-- Verificación: select tablename, policyname from pg_policies
--   where policyname like '%rollback%';
-- Para volver a blindar después: ejecutar de nuevo docs/migracion-rls.sql
-- (elimina estas policies de rollback y deja el estado blindado).
