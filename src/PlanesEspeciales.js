import { useState, useEffect } from "react";
import { apiGestion } from "./api";

// ─── Planes Especiales (privados, SOLO admin) ───────────────────────────
// Acuerdos comerciales para profesionales con antigüedad. No forman parte del
// catálogo: sus condiciones llegan del servidor únicamente a la admin y toda
// operación (asignar, modificar, finalizar, editar condiciones) se valida en
// /api/gestion con rol admin. Decisiones confirmadas (12-10-2026): valor
// MENSUAL, horario definido por la admin, jornadas creadas CONFIRMADAS.

const fmt = n => (n || 0).toLocaleString("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 });
const hoyChile = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/Santiago" });
const DIAS = [[1, "Lun"], [2, "Mar"], [3, "Mié"], [4, "Jue"], [5, "Vie"], [6, "Sáb"], [7, "Dom"]];
const NOMBRE_DIA = Object.fromEntries(DIAS);
const BOX_LABEL = { dental: "🦷 Box Dental", estetico: "✨ Box Estético", medico: "🏥 Box Médico", pabellon: "⚕️ Pabellón" };
// Horario sugerido (editable): jornada dental de 5 h; "día completo" estético
const HORARIO_SUGERIDO = { dental: ["09:00", "14:00"], estetico: ["08:00", "20:00"] };

const finVigencia = (inicio, meses) => {
  if (!inicio) return "";
  const [y, m, d] = inicio.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + meses, d));
  if (t.getUTCDate() !== d) t.setUTCDate(1);
  t.setUTCDate(t.getUTCDate() - 1);
  return t.toISOString().slice(0, 10);
};
const describirHorario = h => (h || []).map(x => `${NOMBRE_DIA[x.dia]} ${x.hora_inicio}–${x.hora_fin}`).join(" · ");
const fechaHora = iso => iso ? new Date(iso).toLocaleString("es-CL", { timeZone: "America/Santiago", dateStyle: "short", timeStyle: "short" }) : "—";

const S = {
  card: { background: "#fff", borderRadius: 12, border: "1px solid #eee", padding: "14px 16px", marginBottom: 10 },
  btn: (v = "primary", sm) => ({ padding: sm ? "5px 12px" : "9px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: sm ? 12 : 13, fontWeight: 500, background: v === "primary" ? "#111" : v === "success" ? "#1D9E75" : v === "danger" ? "#E24B4A" : "#e8e8e8", color: v === "secondary" ? "#111" : "#fff" }),
  label: { display: "block", fontSize: 12, color: "#666", marginBottom: 4, marginTop: 10 },
  input: { width: "100%", padding: "7px 10px", borderRadius: 8, border: "1px solid #ddd", fontSize: 13, boxSizing: "border-box", background: "#fff" },
  aviso: (tipo) => ({ fontSize: 12, borderRadius: 8, padding: "9px 12px", marginTop: 10, lineHeight: 1.6,
    background: tipo === "err" ? "#FCEBEB" : tipo === "ok" ? "#EAF3DE" : "#FAEEDA",
    color: tipo === "err" ? "#A32D2D" : tipo === "ok" ? "#3B6D11" : "#854F0B" }),
};

// ── Editor de horario semanal (día + hora inicio/fin por jornada) ──
function EditorHorario({ horario, setHorario, boxTipo }) {
  const sug = HORARIO_SUGERIDO[boxTipo] || ["09:00", "14:00"];
  const activo = dia => horario.find(h => h.dia === dia);
  const toggle = dia => setHorario(h => activo(dia) ? h.filter(x => x.dia !== dia)
    : [...h, { dia, hora_inicio: sug[0], hora_fin: sug[1] }].sort((a, b) => a.dia - b.dia));
  const cambiar = (dia, campo, valor) => setHorario(h => h.map(x => x.dia === dia ? { ...x, [campo]: valor } : x));
  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
        {DIAS.map(([dia, nombre]) => (
          <button key={dia} type="button" onClick={() => toggle(dia)}
            style={{ padding: "6px 12px", borderRadius: 16, fontSize: 12, cursor: "pointer", fontWeight: 600,
              border: `1px solid ${activo(dia) ? "#111" : "#ddd"}`, background: activo(dia) ? "#111" : "#fff", color: activo(dia) ? "#fff" : "#555" }}>
            {nombre}
          </button>
        ))}
      </div>
      {horario.map(h => (
        <div key={h.dia} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 13 }}>
          <span style={{ width: 36, fontWeight: 600 }}>{NOMBRE_DIA[h.dia]}</span>
          <input type="time" step="1800" min="08:00" max="20:00" value={h.hora_inicio} onChange={e => cambiar(h.dia, "hora_inicio", e.target.value)} style={{ ...S.input, width: 110 }} />
          <span>a</span>
          <input type="time" step="1800" min="08:00" max="20:00" value={h.hora_fin} onChange={e => cambiar(h.dia, "hora_fin", e.target.value)} style={{ ...S.input, width: 110 }} />
        </div>
      ))}
    </div>
  );
}

// ── Resultado de la vista previa (jornadas + conflictos) ──
function VistaPrevia({ prev, excluirConflictos, setExcluirConflictos }) {
  if (!prev) return null;
  const fechasConflicto = [...new Set((prev.conflictos || []).map(c => c.fecha))];
  return (
    <div style={{ marginTop: 12, background: "#f8f8f8", borderRadius: 10, padding: 12, fontSize: 13 }}>
      <div><strong>{prev.jornadas}</strong> jornadas · {prev.desde} → {prev.hasta} · {prev.box}</div>
      <div style={{ color: "#666", fontSize: 12, marginTop: 2 }}>Horario: {prev.horario} · Valor: {fmt(prev.precio_mensual)}/mes</div>
      {prev.excluidas_previas?.length > 0 && (
        <div style={{ color: "#666", fontSize: 12, marginTop: 2 }}>
          Se mantienen fuera {prev.excluidas_previas.length} jornada(s) que se cancelaron a mano: {prev.excluidas_previas.join(", ")}
        </div>
      )}
      {prev.conflictos.length === 0 ? (
        <div style={S.aviso("ok")}>✓ Sin conflictos: todas las jornadas están libres en el espacio físico.</div>
      ) : (
        <div style={S.aviso("err")}>
          <strong>{prev.conflictos.length} conflicto(s) en {fechasConflicto.length} fecha(s).</strong> Las reservas existentes NO se tocan.
          <div style={{ maxHeight: 160, overflowY: "auto", marginTop: 6 }}>
            {prev.conflictos.map((c, i) => (
              <div key={i} style={{ fontSize: 12 }}>• {c.fecha} · jornada {c.jornada} choca con {c.ocupa} — {c.origen}</div>
            ))}
          </div>
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 8, cursor: "pointer", color: "#111" }}>
            <input type="checkbox" checked={excluirConflictos} onChange={e => setExcluirConflictos(e.target.checked)} />
            Asignar sin esas {fechasConflicto.length} fecha(s) (quedan fuera del plan)
          </label>
        </div>
      )}
    </div>
  );
}

// ── Formulario de asignación / modificación ──
function FormAsignacion({ def, asignacion, profesionales, onListo, onCancelar }) {
  const esModif = !!asignacion;
  const manana = (() => { const d = new Date(hoyChile() + "T12:00:00"); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); })();
  const [profId, setProfId] = useState(asignacion?.profesional_id || "");
  const [horario, setHorario] = useState(asignacion?.horario || []);
  const [inicio, setInicio] = useState(asignacion?.fecha_inicio || manana);
  const [fin, setFin] = useState(asignacion?.fecha_vencimiento || finVigencia(manana, def.vigencia_meses));
  const [precio, setPrecio] = useState(asignacion?.plan_precio ?? def.precio_mensual);
  const [prev, setPrev] = useState(null);
  const [excluirConflictos, setExcluirConflictos] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [msg, setMsg] = useState(null);

  const invalidarPrevia = () => { setPrev(null); setExcluirConflictos(false); setMsg(null); };
  const datosBase = () => ({
    plan_especial_id: def.id, profesional_id: profId, horario,
    fecha_inicio: inicio, fecha_fin: fin,
    ...(esModif ? { plan_profesional_id: asignacion.id } : {}),
  });
  const fechasExcluidas = () => excluirConflictos ? [...new Set((prev?.conflictos || []).map(c => c.fecha))] : [];

  const previsualizar = async () => {
    setTrabajando(true); setMsg(null);
    const r = await apiGestion("plan_especial_previsualizar", datosBase());
    setTrabajando(false);
    if (!r.ok) { setPrev(null); setMsg({ tipo: "err", texto: r.error }); return; }
    setPrev(r); setExcluirConflictos(false);
  };

  const confirmar = async () => {
    if (prev?.conflictos?.length && !excluirConflictos) return;
    const prof = profesionales.find(p => p.id === profId);
    const texto = esModif
      ? `¿Aplicar los cambios al plan de ${asignacion.profesional_nombre}? Se reprograman solo sus jornadas desde mañana.`
      : `¿Asignar ${def.nombre} a ${prof?.nombre}? Se reservarán ${prev.jornadas - fechasExcluidas().length} jornadas confirmadas.`;
    if (!window.confirm(texto)) return;
    setTrabajando(true); setMsg(null);
    const r = esModif
      ? await apiGestion("plan_especial_modificar", {
          plan_profesional_id: asignacion.id, horario, fecha_fin: fin,
          precio_mensual: Number(precio), excluir: fechasExcluidas(),
        })
      : await apiGestion("plan_especial_asignar", { ...datosBase(), excluir: fechasExcluidas() });
    setTrabajando(false);
    if (!r.ok) {
      if (r.conflictos) {
        // Aparecieron conflictos nuevos desde la vista previa: se vuelve a revisar
        setPrev(null); setExcluirConflictos(false);
        setMsg({ tipo: "err", texto: `${r.error} Pulsa "Revisar disponibilidad" para ver la lista actualizada.` });
      } else {
        setMsg({ tipo: "err", texto: r.error });
      }
      return;
    }
    onListo(esModif ? "Plan especial modificado" : `Plan asignado: ${r.jornadas} jornadas reservadas`);
  };

  // Cambiar solo el valor mensual no requiere vista previa de agenda
  const soloPrecio = esModif && JSON.stringify(horario) === JSON.stringify(asignacion.horario) && fin === asignacion.fecha_vencimiento;
  const guardarPrecio = async () => {
    setTrabajando(true); setMsg(null);
    const r = await apiGestion("plan_especial_modificar", { plan_profesional_id: asignacion.id, precio_mensual: Number(precio) });
    setTrabajando(false);
    if (!r.ok) { setMsg({ tipo: "err", texto: r.error }); return; }
    onListo("Valor mensual actualizado");
  };

  return (
    <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 12 }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>{esModif ? `Modificar plan de ${asignacion.profesional_nombre}` : `Asignar ${def.nombre}`}</div>
      {!esModif && (
        <>
          <label style={S.label}>Profesional beneficiaria *</label>
          <select style={S.input} value={profId} onChange={e => { setProfId(e.target.value); invalidarPrevia(); }}>
            <option value="">— Seleccionar —</option>
            {profesionales.filter(p => p.activo !== false).map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </>
      )}
      <label style={S.label}>Días y horario semanal * <span style={{ color: "#aaa" }}>({def.jornadas_semanales} jornada{def.jornadas_semanales > 1 ? "s" : ""} por semana · 08:00 a 20:00)</span></label>
      <EditorHorario horario={horario} setHorario={h => { setHorario(h); invalidarPrevia(); }} boxTipo={def.box_tipo} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <div>
          <label style={S.label}>Inicio de vigencia *</label>
          <input type="date" style={S.input} value={inicio} min={hoyChile()} disabled={esModif}
            onChange={e => { setInicio(e.target.value); setFin(finVigencia(e.target.value, def.vigencia_meses)); invalidarPrevia(); }} />
        </div>
        <div>
          <label style={S.label}>Término de vigencia *</label>
          <input type="date" style={S.input} value={fin} min={inicio} max={finVigencia(inicio, def.vigencia_meses)}
            onChange={e => { setFin(e.target.value); invalidarPrevia(); }} />
        </div>
      </div>
      {esModif && (
        <>
          <label style={S.label}>Valor mensual acordado (CLP)</label>
          <input type="number" min="0" step="1000" style={S.input} value={precio} onChange={e => setPrecio(e.target.value)} />
        </>
      )}
      {esModif && <div style={S.aviso("warn")}>Al cambiar días, horarios o término se reprograman <strong>solo las jornadas de este plan desde mañana</strong>. Las pasadas y las de otras profesionales no se tocan.</div>}

      <VistaPrevia prev={prev} excluirConflictos={excluirConflictos} setExcluirConflictos={setExcluirConflictos} />
      {msg && <div style={S.aviso(msg.tipo)}>{msg.texto}</div>}

      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        {soloPrecio ? (
          <button style={S.btn("primary")} disabled={trabajando || Number(precio) === asignacion.plan_precio} onClick={guardarPrecio}>
            {trabajando ? "Guardando…" : "Guardar valor mensual"}
          </button>
        ) : !prev ? (
          <button style={S.btn("primary")} disabled={trabajando || (!esModif && !profId) || !horario.length} onClick={previsualizar}>
            {trabajando ? "Revisando…" : "Revisar disponibilidad"}
          </button>
        ) : (
          <button style={S.btn("success")} disabled={trabajando || (prev.conflictos.length > 0 && !excluirConflictos)} onClick={confirmar}>
            {trabajando ? "Guardando…" : esModif ? "Confirmar cambios" : "Confirmar asignación"}
          </button>
        )}
        <button style={S.btn("secondary")} onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

// ── Editor de condiciones del plan (precio, frecuencia, vigencia) ──
function FormCondiciones({ def, onListo, onCancelar }) {
  const [f, setF] = useState({ nombre: def.nombre, jornadas_semanales: def.jornadas_semanales, precio_mensual: def.precio_mensual, vigencia_meses: def.vigencia_meses, descripcion: def.descripcion || "", activo: def.activo });
  const [msg, setMsg] = useState(null);
  const guardar = async () => {
    const r = await apiGestion("plan_especial_condiciones", {
      id: def.id, nombre: f.nombre, jornadas_semanales: Number(f.jornadas_semanales),
      precio_mensual: Number(f.precio_mensual), vigencia_meses: Number(f.vigencia_meses),
      descripcion: f.descripcion, activo: !!f.activo,
    });
    if (!r.ok) { setMsg(r.error); return; }
    onListo("Condiciones actualizadas");
  };
  return (
    <div style={{ marginTop: 12, borderTop: "1px solid #eee", paddingTop: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10 }}>
        <div><label style={S.label}>Nombre</label><input style={S.input} value={f.nombre} onChange={e => setF({ ...f, nombre: e.target.value })} /></div>
        <div><label style={S.label}>Jornadas semanales</label><input type="number" min="1" max="7" style={S.input} value={f.jornadas_semanales} onChange={e => setF({ ...f, jornadas_semanales: e.target.value })} /></div>
        <div><label style={S.label}>Valor mensual (CLP)</label><input type="number" min="0" step="1000" style={S.input} value={f.precio_mensual} onChange={e => setF({ ...f, precio_mensual: e.target.value })} /></div>
        <div><label style={S.label}>Vigencia (meses)</label><input type="number" min="1" max="12" style={S.input} value={f.vigencia_meses} onChange={e => setF({ ...f, vigencia_meses: e.target.value })} /></div>
      </div>
      <label style={S.label}>Descripción</label>
      <input style={S.input} value={f.descripcion} onChange={e => setF({ ...f, descripcion: e.target.value })} />
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginTop: 10 }}>
        <input type="checkbox" checked={!!f.activo} onChange={e => setF({ ...f, activo: e.target.checked })} /> Disponible para nuevas asignaciones
      </label>
      <div style={S.aviso("warn")}>Los cambios aplican a <strong>nuevas</strong> asignaciones. Las ya asignadas conservan el valor acordado (se edita en cada asignación).</div>
      {msg && <div style={S.aviso("err")}>{msg}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <button style={S.btn("primary")} onClick={guardar}>Guardar condiciones</button>
        <button style={S.btn("secondary")} onClick={onCancelar}>Cancelar</button>
      </div>
    </div>
  );
}

// ── Historial de una asignación ──
function Historial({ planId }) {
  const [items, setItems] = useState(null);
  useEffect(() => {
    let vivo = true;
    apiGestion("plan_especial_historial", { plan_profesional_id: planId }).then(r => { if (vivo) setItems(r.ok ? r.historial : []); });
    return () => { vivo = false; };
  }, [planId]);
  if (items === null) return <div style={{ fontSize: 12, color: "#888", marginTop: 8 }}>Cargando historial…</div>;
  const ACC = { asignar: "Asignó", modificar: "Modificó", finalizar: "Finalizó", editar_condiciones: "Editó condiciones" };
  return (
    <div style={{ marginTop: 10, background: "#f8f8f8", borderRadius: 8, padding: "8px 12px" }}>
      {items.length === 0 && <div style={{ fontSize: 12, color: "#888" }}>Sin registros.</div>}
      {items.map(h => (
        <div key={h.id} style={{ fontSize: 12, padding: "4px 0", borderBottom: "1px solid #eee" }}>
          <strong>{fechaHora(h.creado_at)}</strong> · {ACC[h.accion] || h.accion} · <span style={{ color: "#555" }}>{h.usuario_nombre}</span>
          {h.accion === "modificar" && h.detalle?.despues && (
            <div style={{ color: "#666" }}>
              {h.detalle.despues.horario && <>Horario: {describirHorario(h.detalle.antes?.horario)} → {describirHorario(h.detalle.despues.horario)}. </>}
              {h.detalle.despues.fecha_fin && h.detalle.despues.fecha_fin !== h.detalle.antes?.fecha_fin && <>Término: {h.detalle.antes?.fecha_fin} → {h.detalle.despues.fecha_fin}. </>}
              {h.detalle.despues.precio_mensual != null && <>Valor: {fmt(h.detalle.antes?.precio_mensual)} → {fmt(h.detalle.despues.precio_mensual)}.</>}
            </div>
          )}
          {h.accion === "asignar" && h.detalle && <div style={{ color: "#666" }}>{h.detalle.jornadas} jornadas · {h.detalle.fecha_inicio} → {h.detalle.fecha_fin} · {fmt(h.detalle.precio_mensual)}/mes</div>}
          {h.accion === "finalizar" && h.detalle && <div style={{ color: "#666" }}>Término {h.detalle.fecha_termino} · {h.detalle.jornadas_liberadas} jornadas liberadas</div>}
        </div>
      ))}
    </div>
  );
}

// ═══════════════ COMPONENTE PRINCIPAL ═══════════════
export default function PlanesEspeciales({ defs, asignaciones, profesionales = [], onCambio }) {
  const [abierto, setAbierto] = useState(null); // { tipo, defId?, asigId? }
  const [toast, setToast] = useState(null);
  const [terminoFin, setTerminoFin] = useState(hoyChile());
  const [errFin, setErrFin] = useState(null);
  const listo = (texto) => { setAbierto(null); setToast(texto); setTimeout(() => setToast(null), 4000); onCambio && onCambio(); };

  if (defs === null) {
    return (
      <div style={{ ...S.card, borderLeft: "4px solid #EF9F27" }}>
        <strong>⭐ Planes Especiales</strong>
        <div style={S.aviso("warn")}>Falta ejecutar <code>docs/migracion-planes-especiales.sql</code> en Supabase para habilitar esta sección.</div>
      </div>
    );
  }

  const finalizar = async (a) => {
    if (!window.confirm(`¿Finalizar el plan de ${a.profesional_nombre} el ${terminoFin}? Se liberan SOLO sus jornadas posteriores a esa fecha. No se puede deshacer.`)) return;
    const r = await apiGestion("plan_especial_finalizar", { plan_profesional_id: a.id, fecha_termino: terminoFin });
    if (!r.ok) { setErrFin(r.error); return; }
    setErrFin(null);
    listo(`Plan finalizado · ${r.liberadas} jornada(s) liberada(s)`);
  };

  return (
    <div style={{ marginBottom: 28, background: "#FBFAFF", border: "1px solid #DDD6FE", borderRadius: 14, padding: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 600, margin: "0 0 2px" }}>⭐ Planes Especiales <span style={{ fontSize: 11, color: "#6D28D9", fontWeight: 600 }}>· privado</span></h3>
      <p style={{ fontSize: 12, color: "#666", margin: "0 0 14px" }}>
        Acuerdos para profesionales con antigüedad. No aparecen en el catálogo ni pueden contratarse: solo la administración los asigna, uno a uno.
      </p>
      {toast && <div style={S.aviso("ok")}>{toast}</div>}

      {defs.map(def => {
        const asigs = (asignaciones || []).filter(a => a.plan_especial_id === def.id);
        return (
          <div key={def.id} style={S.card}>
            <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 15 }}>{def.nombre} {!def.activo && <span style={{ fontSize: 11, color: "#A32D2D" }}>(desactivado)</span>}</div>
                <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>
                  {BOX_LABEL[def.box_tipo] || def.box_tipo} · {def.jornadas_semanales} jornada{def.jornadas_semanales > 1 ? "s" : ""} semanal{def.jornadas_semanales > 1 ? "es" : ""} · vigencia {def.vigencia_meses} meses
                </div>
                {def.descripcion && <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{def.descripcion}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(def.precio_mensual)}</div>
                <div style={{ fontSize: 10, color: "#888" }}>/ mes</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
              <button style={S.btn("primary", true)} disabled={!def.activo} onClick={() => setAbierto({ tipo: "asignar", defId: def.id })}>+ Asignar a una profesional</button>
              <button style={S.btn("secondary", true)} onClick={() => setAbierto({ tipo: "condiciones", defId: def.id })}>Editar condiciones</button>
            </div>
            {abierto?.tipo === "asignar" && abierto.defId === def.id && (
              <FormAsignacion def={def} profesionales={profesionales} onListo={listo} onCancelar={() => setAbierto(null)} />
            )}
            {abierto?.tipo === "condiciones" && abierto.defId === def.id && (
              <FormCondiciones def={def} onListo={listo} onCancelar={() => setAbierto(null)} />
            )}

            {/* Asignaciones de este plan */}
            {asigs.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "#666", marginBottom: 6 }}>Asignaciones ({asigs.length})</div>
                {asigs.map(a => {
                  const finalizado = !!a.finalizado_at;
                  return (
                    <div key={a.id} style={{ border: "1px solid #eee", borderRadius: 10, padding: "10px 12px", marginBottom: 8, background: finalizado ? "#fafafa" : "#fff", opacity: finalizado ? 0.75 : 1 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 6 }}>
                        <strong style={{ fontSize: 14 }}>{a.profesional_nombre}</strong>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 8,
                          background: finalizado ? "#f0f0f0" : a.verificado === "aprobado" ? "#EAF3DE" : "#FAEEDA",
                          color: finalizado ? "#666" : a.verificado === "aprobado" ? "#3B6D11" : "#854F0B" }}>
                          {finalizado ? "Finalizado" : a.verificado === "aprobado" ? "✓ Pago aprobado" : a.verificado === "pendiente" ? "⏳ Comprobante por verificar" : "Sin pago"}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "#555", marginTop: 4, lineHeight: 1.7 }}>
                        🗓 {describirHorario(a.horario)}<br />
                        Vigencia {a.fecha_inicio} → {a.fecha_vencimiento} · {a.jornadas_totales} jornadas · {fmt(a.plan_precio)}/mes<br />
                        <span style={{ color: "#888" }}>
                          Asignado por {a.asignado_por || "—"} el {fechaHora(a.asignado_at)}
                          {a.modificado_at && <> · Modificado por {a.modificado_por} el {fechaHora(a.modificado_at)}</>}
                          {finalizado && <> · Finalizado por {a.finalizado_por} el {fechaHora(a.finalizado_at)}</>}
                        </span>
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                        {!finalizado && <button style={S.btn("secondary", true)} onClick={() => setAbierto({ tipo: "modificar", asigId: a.id })}>Modificar</button>}
                        {!finalizado && <button style={{ ...S.btn("secondary", true), background: "#FCEBEB", color: "#A32D2D" }} onClick={() => { setTerminoFin(hoyChile()); setErrFin(null); setAbierto({ tipo: "finalizar", asigId: a.id }); }}>Finalizar</button>}
                        <button style={S.btn("secondary", true)} onClick={() => setAbierto(abierto?.tipo === "historial" && abierto.asigId === a.id ? null : { tipo: "historial", asigId: a.id })}>Historial</button>
                      </div>
                      {abierto?.tipo === "modificar" && abierto.asigId === a.id && (
                        <FormAsignacion def={def} asignacion={a} profesionales={profesionales} onListo={listo} onCancelar={() => setAbierto(null)} />
                      )}
                      {abierto?.tipo === "historial" && abierto.asigId === a.id && <Historial planId={a.id} />}
                      {abierto?.tipo === "finalizar" && abierto.asigId === a.id && (
                        <div style={{ marginTop: 10, borderTop: "1px solid #eee", paddingTop: 10 }}>
                          <label style={S.label}>Fecha de término</label>
                          <input type="date" style={{ ...S.input, maxWidth: 200 }} value={terminoFin} min={hoyChile()} max={a.fecha_vencimiento}
                            onChange={e => setTerminoFin(e.target.value)} />
                          <div style={S.aviso("warn")}>Se liberan solo las jornadas de este plan posteriores a la fecha elegida. Las pasadas quedan como historial.</div>
                          {errFin && <div style={S.aviso("err")}>{errFin}</div>}
                          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                            <button style={S.btn("danger")} disabled={!terminoFin} onClick={() => finalizar(a)}>Finalizar plan</button>
                            <button style={S.btn("secondary")} onClick={() => setAbierto(null)}>Cancelar</button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
