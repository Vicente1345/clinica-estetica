// Vercel Serverless Function — chatbot con Claude + Tool Use
// Endpoint: POST /api/chat
// Body: { messages: [{role, content}, ...] }
// Respuesta: { text, usage, tool_result? }
//
// Variables de entorno requeridas en Vercel:
//   ANTHROPIC_API_KEY
//   REACT_APP_SUPABASE_URL  (o SUPABASE_URL)
//   REACT_APP_SUPABASE_ANON_KEY  (o SUPABASE_ANON_KEY)

const Anthropic = require("@anthropic-ai/sdk");
const { createClient } = require("@supabase/supabase-js");

// ─── SYSTEM PROMPT (estable — se cachea) ───────────────────────────
const SYSTEM_PROMPT = `Eres el asistente virtual de **Barcelona Clinic** (también conocida como Cowork Salud), una clínica estética y dental premium ubicada en Puerto Varas, Chile, inaugurada en 2023. Atiendes principalmente a **pacientes** que quieren agendar hora, consultar tratamientos o pedir información. También respondes a profesionales de la salud que evalúan arrendar un box.

## Tu rol

### Función principal: Recepcionista virtual de pacientes
Cuando un paciente quiere agendar una hora:
1. Conduce una conversación amable y profesional para juntar los datos.
2. Resume y pide confirmación antes de registrar.
3. Una vez tengas datos mínimos (nombre, teléfono, motivo) y el paciente confirme, llama a la herramienta \`registrar_solicitud_paciente\`.
4. Confirma al paciente que su solicitud quedó registrada y que se le contactará por WhatsApp dentro de 2 horas hábiles para confirmar el horario.

### Función secundaria: Asistente informativo
Responde preguntas sobre tratamientos, precios, equipo profesional, ubicación y horarios.

## Estilo
Español chileno cordial, cálido y profesional. Conciso (2-4 párrafos máximo). Emojis con moderación (💜 ✨ 🦷). Si no sabes algo con certeza, sé honesto y sugiere WhatsApp +56 9 8628 4965.

## Información de la clínica

**Nombre**: Barcelona Clinic — Clínica Estética & Dental Premium
**Ubicación**: Ruta 225, Tanpu, 5550000 Puerto Varas, Los Lagos, Chile
**Teléfono / WhatsApp**: +56 9 8628 4965
**Instagram**: @barcelonaclinic.pv
**Horario**:
- Lunes a Viernes: 09:00 — 19:30
- Sábados: 09:00 — 14:00
- Domingos: cerrado

## Tratamientos y precios (para pacientes)

### ✨ Estética facial premium

**Hydrafacial** (★ Exclusiva en Puerto Varas — 7 en 1, sin downtime):
- Experiencia Platinum (60 min): $99.990
- Experiencia Intermedia (45 min): $84.990
- Experiencia Signature (30 min): $69.990

**Endymed Pro** (★ Exclusiva en Puerto Varas — RF 3DEEP, 6 generadores):
- Sesión contorno ojos o labios: $59.990
- Sesión contorno mandibular: $79.990
- Sesión rejuvenecimiento y tensado: $119.990
- Pack 3 sesiones contorno: $159.990
- Pack 3 sesiones rejuvenecimiento: $299.990
- Pack rejuvenecimiento + poros: $329.990

### Armonización Facial (Dra. Catalina de la Maza)
- Hilos PDO: $10.000 c/hilo
- Relleno de ojeras: $199.990
- Relleno de labios: $229.990
- Relleno de mentón: $229.990
- Contorno mandibular: $349.990
- Rinomodelación (sin cirugía): $259.990

### Botox
- 3 zonas (50UI — frente, entrecejo, patas de gallo): $199.990
- Full Face (100UI — 6 zonas): $349.990

### Bioestimulación
- **Sculptra** (ácido poli-L-láctico): $549.990 por sesión (2-3 sesiones recomendadas)
- **Exosomas Purasomes NC150+**:
  - 1 sesión: $179.990
  - + Endymed Pro RF: $249.990
  - + Toxina Botulínica Dysport: $349.990
  - Pack 3 sesiones: $499.990
- **Profhilo**:
  - Face: $279.990 / sesión
  - Structura: $319.990 / sesión

### Mesoterapia Vitaminas
- Mesoterapia Team Glow: $79.990
- Mesoterapia NCTF: $149.990

### Estética Corporal
- Depilación láser diodo (6 sesiones pierna completa + axila + rebaje): $150.000
- Pack láser axila + ½ pierna + rebaje (6 sesiones): $120.000
- Remodelación RF: $79.990
- Tratamiento estrías: $89.990
- Enzimas lipolíticas: $109.990

### 🦷 Odontología
- Limpieza profesional: $34.990
- Tapaduras estéticas: $50.000
- Exodoncias: $55.000
- Blanqueamiento: $89.990
- Bruxismo (placa): $45.000
- Brackets — instalación: $299.990 / control: $50.000
- Endodoncia (tratamiento de conducto): desde $99.990
- Odontopediatría: desde $12.500 / menores 4 años $15.800

## Equipo profesional

- **Dra. Catalina de la Maza** — Odontología y Medicina Estética Facial
- **Dra. Katherine Büchner** — Asesoría de Lactancia con Enfoque Odontológico
- **Dra. Carolina Minte** — Ortodoncia y Ortopedia Dental
- **Dra. Francisca Salvo** — Rehabilitación Oral y Estética Facial
- **Marjorie Orellana** — Depilación Láser Diodo y Masajes Reductivos

## Cómo agendar (flujo paciente)

Tienes **3 herramientas**:
- \`consultar_disponibilidad(fecha, hora_inicio, duracion_min, box_tipo)\` — verifica si un horario está libre. Devuelve disponible/ocupado y alternativas cercanas si hay conflicto.
- \`agendar_cita(...)\` — bloquea un horario específico con todos los datos del paciente (estado: agendada).
- \`registrar_solicitud_paciente(...)\` — solo si el paciente NO quiere elegir horario (ej: "ustedes me dan una opción").

### Flujo recomendado (paciente quiere elegir hora):
1. Pregunta el **nombre completo**.
2. Pregunta el **teléfono/WhatsApp**.
3. Pregunta el **email** (OBLIGATORIO — explícale brevemente: "También necesito tu email para enviarte la confirmación de la cita 📧"). Si el paciente se niega o dice que no tiene, déjalo en blanco y sigue.
4. Pregunta el **motivo o tratamiento** (ej: "Hydrafacial", "limpieza dental", "Botox").
5. Pregunta **fecha preferida** (convierte expresiones como "el viernes" o "mañana" a formato YYYY-MM-DD usando la fecha actual indicada en el bloque dinámico).
6. Pregunta **hora preferida** (formato HH:MM 24h).
7. **Clasifica el tratamiento en box_tipo**:
   - "estetico": Hydrafacial, Endymed, Botox, Sculptra, Exosomas, Profhilo, Mesoterapia, Armonización Facial, depilación, RF corporal, enzimas
   - "dental": limpieza, blanqueamiento, brackets, ortodoncia, endodoncia, odontopediatría, exodoncias, tapaduras
   - "medico": consultas médicas generales, controles, procedimientos médicos
8. **Estima duración_min**: 30, 45 o 60 min según tratamiento (Hydrafacial Signature 30, Intermedia 45, Platinum 60; limpieza 45; Botox 30; Endymed 60; otros 60 por defecto).
9. **Llama a \`consultar_disponibilidad\`** con esos datos.
10. Si está disponible, **resume todo (incluyendo el email) y pide confirmación**.
11. Cuando confirme, **llama a \`agendar_cita\`** con todos los datos (incluido el email). Devuelve un código.
12. Comparte el código y avisa que se le confirmará por WhatsApp + email en max 2 horas hábiles.

### Si el horario está ocupado:
La herramienta \`consultar_disponibilidad\` devuelve un campo \`alternativas\` con horarios cercanos libres ese mismo día. Ofrécele al paciente las 2-3 mejores alternativas (más cercanas a la hora pedida). Cuando elija una, llama \`consultar_disponibilidad\` otra vez para confirmar que sigue libre, y luego \`agendar_cita\`.

### Si el paciente NO quiere elegir hora:
Usa \`registrar_solicitud_paciente\` (la solicitud queda como pendiente y la admin coordina por WhatsApp).

## Reglas importantes

- **NUNCA inventes precios, profesionales, tratamientos ni horarios.** Si no aparece en este prompt, no existe — redirige a WhatsApp.
- **Horario de atención**: Lun-Vie 09:00–19:30, Sáb 09:00–14:00, Dom cerrado. Solo agenda dentro de esos rangos.
- **No agendes citas en el pasado.** Si el paciente pide una fecha pasada, ofrece la próxima fecha disponible.
- Si el paciente da un email, regístralo (es importante para enviarle confirmación).
- Si hay un error técnico al guardar, da el WhatsApp +56 9 8628 4965.

## Si te preguntan por arriendo de boxes (profesionales)

La clínica también funciona como cowork médico. Tres boxes: Estético ($10.000/h, $45.000 jornada, planes desde $170.000/mes), Dental Plan Flex sin asistente ($15.000/h, $45.000 jornada, planes desde $150.000/mes anual), Dental Plan PRO con asistente ($18.000/h, $65.000 jornada, planes desde $230.000/mes anual, Plan Exclusivo $1.350.000/mes), y Médico ($12.000/h, $55.000 jornada, planes desde $215.000/mes). Para info detallada redirige al sitio de profesionales o WhatsApp.`;

// ─── HERRAMIENTAS DEL BOT ──────────────────────────────────────────
const TOOLS = [
  {
    name: "consultar_disponibilidad",
    description:
      "Verifica si un horario específico está disponible para un tratamiento en el box correspondiente. Devuelve disponible:true/false. Si no está disponible, devuelve un array 'alternativas' con horarios cercanos libres ese mismo día. Llamar ANTES de agendar_cita.",
    input_schema: {
      type: "object",
      properties: {
        fecha: { type: "string", description: "Fecha en formato YYYY-MM-DD" },
        hora_inicio: { type: "string", description: "Hora de inicio en formato HH:MM (24h)" },
        duracion_min: { type: "integer", description: "Duración estimada en minutos (30, 45 o 60)" },
        box_tipo: {
          type: "string",
          enum: ["estetico", "dental", "medico"],
          description: "Tipo de box requerido según el tratamiento",
        },
      },
      required: ["fecha", "hora_inicio", "duracion_min", "box_tipo"],
    },
  },
  {
    name: "agendar_cita",
    description:
      "Agenda y BLOQUEA una cita en el horario indicado. Llamar SOLO después de haber consultado disponibilidad y de que el paciente haya confirmado todos los datos. Devuelve un código de solicitud.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre completo del paciente" },
        telefono: { type: "string", description: "Teléfono o WhatsApp del paciente" },
        email: { type: "string", description: "Email del paciente (recomendado, para enviarle confirmación)" },
        tratamiento: { type: "string", description: "Tratamiento específico (ej: 'Hydrafacial Platinum', 'Limpieza dental', 'Botox 3 zonas')" },
        motivo_consulta: { type: "string", description: "Motivo o razón resumida de la consulta" },
        fecha: { type: "string", description: "Fecha en formato YYYY-MM-DD" },
        hora_inicio: { type: "string", description: "Hora de inicio en formato HH:MM" },
        duracion_min: { type: "integer", description: "Duración en minutos" },
        box_tipo: { type: "string", enum: ["estetico", "dental", "medico"] },
        profesional_preferido: { type: "string", description: "Profesional preferido si lo mencionó (opcional)" },
        rut: { type: "string", description: "RUT del paciente (opcional)" },
        notas_adicionales: { type: "string", description: "Información adicional relevante (opcional)" },
      },
      required: ["nombre", "telefono", "tratamiento", "motivo_consulta", "fecha", "hora_inicio", "duracion_min", "box_tipo"],
    },
  },
  {
    name: "registrar_solicitud_paciente",
    description:
      "Registra una solicitud SIN fecha/hora específica. Solo usar si el paciente NO quiere elegir horario y prefiere que la admin lo contacte para coordinar. Si tiene fecha y hora preferida, usar agendar_cita en su lugar.",
    input_schema: {
      type: "object",
      properties: {
        nombre: { type: "string", description: "Nombre completo del paciente" },
        telefono: { type: "string", description: "Teléfono o WhatsApp del paciente" },
        motivo_consulta: { type: "string", description: "Motivo o razón de la consulta" },
        especialidad_preferida: {
          type: "string",
          enum: ["dental", "estetico", "medico", "cualquiera"],
        },
        profesional_preferido: { type: "string" },
        fecha_preferida: { type: "string", description: "Día/horario preferido en texto libre" },
        email: { type: "string" },
        rut: { type: "string" },
        notas_adicionales: { type: "string" },
      },
      required: ["nombre", "telefono", "motivo_consulta"],
    },
  },
];

// ─── HELPERS ───────────────────────────────────────────────────────
function getSupabase() {
  const url = process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// Convierte "HH:MM" a minutos desde medianoche
function hhmmToMin(hhmm) {
  const [h, m] = (hhmm || "").split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}
function minToHhmm(min) {
  const h = Math.floor(min / 60).toString().padStart(2, "0");
  const m = (min % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

// Día de semana (0=dom..6=sab) y horario de atención de la clínica
function diaSemana(fechaStr) {
  // YYYY-MM-DD -> 0..6
  const [y, m, d] = fechaStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function horarioAtencion(fechaStr) {
  const dow = diaSemana(fechaStr);
  if (dow === 0) return null; // domingo cerrado
  if (dow === 6) return { open: 9 * 60, close: 14 * 60 }; // sáb 9-14
  return { open: 9 * 60, close: 19 * 60 + 30 }; // lun-vie 9-19:30
}

// Envía email al admin avisando de nueva cita (Resend). No bloquea si falla.
async function enviarEmailAdmin(detalles) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.log("RESEND_API_KEY no configurada — saltando email");
    return;
  }
  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL || "vbecerrai@udd.cl";
  const fromAddr = process.env.RESEND_FROM || "Barcelona Clinic <onboarding@resend.dev>";

  const html = `
    <h2>📅 Nueva ${detalles.tipo === "cita" ? "cita agendada" : "solicitud sin horario"}</h2>
    <p><strong>Código:</strong> #${detalles.codigo}</p>
    <p><strong>Paciente:</strong> ${detalles.nombre}</p>
    <p><strong>Teléfono:</strong> ${detalles.telefono}</p>
    ${detalles.email ? `<p><strong>Email:</strong> ${detalles.email}</p>` : ""}
    ${detalles.tratamiento ? `<p><strong>Tratamiento:</strong> ${detalles.tratamiento}</p>` : ""}
    <p><strong>Motivo:</strong> ${detalles.motivo_consulta || "—"}</p>
    ${detalles.fecha ? `<p><strong>Fecha:</strong> ${detalles.fecha} · <strong>Hora:</strong> ${detalles.hora_inicio} – ${detalles.hora_fin}</p>` : ""}
    ${detalles.box_tipo ? `<p><strong>Box:</strong> ${detalles.box_tipo}</p>` : ""}
    ${detalles.profesional_preferido ? `<p><strong>Profesional preferido:</strong> ${detalles.profesional_preferido}</p>` : ""}
    ${detalles.notas_adicionales ? `<p><strong>Notas:</strong> ${detalles.notas_adicionales}</p>` : ""}
    <hr/>
    <p style="font-size:12px;color:#666">Entra al panel admin para confirmar por WhatsApp.</p>
  `;

  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromAddr,
        to: [adminEmail],
        subject: detalles.tipo === "cita"
          ? `Nueva cita #${detalles.codigo} — ${detalles.nombre} (${detalles.fecha} ${detalles.hora_inicio})`
          : `Nueva solicitud #${detalles.codigo} — ${detalles.nombre}`,
        html,
      }),
    });
    if (!r.ok) console.error("Resend admin error:", await r.text());
  } catch (e) {
    console.error("Resend admin throw:", e);
  }
}

// Email confirmación al paciente cuando agenda
async function enviarEmailPaciente(detalles) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !detalles.email) return;
  const fromAddr = process.env.RESEND_FROM || "Barcelona Clinic <onboarding@resend.dev>";

  const html = `
    <h2 style="color:#6B5B8A">¡Hola ${detalles.nombre}! 💜</h2>
    <p>Recibimos tu solicitud en <strong>Barcelona Clinic</strong>. Estos son los datos:</p>
    <ul>
      <li><strong>Código de solicitud:</strong> #${detalles.codigo}</li>
      <li><strong>Tratamiento:</strong> ${detalles.tratamiento || "—"}</li>
      <li><strong>Fecha:</strong> ${detalles.fecha} · ${detalles.hora_inicio} – ${detalles.hora_fin}</li>
    </ul>
    <p>Una persona del equipo te confirmará por <strong>WhatsApp</strong> dentro de las próximas 2 horas hábiles. Si necesitas modificar o cancelar, escribe al +56 9 8628 4965.</p>
    <p style="font-size:12px;color:#888">Barcelona Clinic · Ruta 225, Tanpu, Puerto Varas · @barcelonaclinic.pv</p>
  `;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: fromAddr,
        to: [detalles.email],
        subject: `Tu solicitud #${detalles.codigo} en Barcelona Clinic — pendiente de confirmar`,
        html,
      }),
    });
  } catch (e) {
    console.error("Resend paciente throw:", e);
  }
}

// ─── EJECUCIÓN DE HERRAMIENTAS ─────────────────────────────────────
async function ejecutarHerramienta(name, input) {
  const sb = getSupabase();
  if (!sb) return { error: "Servicio temporalmente no disponible. Escribe a +56 9 8628 4965." };

  if (name === "consultar_disponibilidad") {
    return await toolConsultar(sb, input);
  }
  if (name === "agendar_cita") {
    return await toolAgendar(sb, input);
  }
  if (name === "registrar_solicitud_paciente") {
    return await toolRegistrar(sb, input);
  }
  return { error: `Herramienta desconocida: ${name}` };
}

// Lee citas ocupadas de un box+fecha y devuelve [{hora_inicio_min, hora_fin_min}]
async function getOcupados(sb, fecha, box_tipo) {
  const { data, error } = await sb
    .from("solicitudes_paciente")
    .select("hora_inicio, hora_fin")
    .eq("fecha_solicitada", fecha)
    .eq("box_tipo", box_tipo)
    .in("estado", ["agendada", "contactado", "confirmada"]);
  if (error || !data) return [];
  return data
    .filter(r => r.hora_inicio && r.hora_fin)
    .map(r => ({ ini: hhmmToMin(r.hora_inicio.slice(0,5)), fin: hhmmToMin(r.hora_fin.slice(0,5)) }));
}

function haySolape(aIni, aFin, bIni, bFin) {
  return aIni < bFin && bIni < aFin;
}

async function toolConsultar(sb, input) {
  const { fecha, hora_inicio, duracion_min, box_tipo } = input;
  if (!fecha || !hora_inicio || !duracion_min || !box_tipo)
    return { error: "Faltan datos: fecha, hora_inicio, duracion_min y box_tipo son obligatorios." };

  const horario = horarioAtencion(fecha);
  if (!horario) return { disponible: false, motivo: "Domingo cerrado", alternativas: [] };

  const ini = hhmmToMin(hora_inicio);
  const fin = ini + Number(duracion_min);

  // Validar dentro de horario de atención
  if (ini < horario.open || fin > horario.close) {
    return {
      disponible: false,
      motivo: `Fuera de horario de atención (${minToHhmm(horario.open)}–${minToHhmm(horario.close)} ese día).`,
      alternativas: [],
    };
  }

  // Validar fecha pasada
  const today = new Date(); today.setHours(0,0,0,0);
  const reqDate = new Date(fecha + "T00:00:00");
  if (reqDate < today) {
    return { disponible: false, motivo: "Fecha en el pasado.", alternativas: [] };
  }

  const ocupados = await getOcupados(sb, fecha, box_tipo);
  const conflicto = ocupados.find(o => haySolape(ini, fin, o.ini, o.fin));

  if (!conflicto) {
    return { disponible: true, fecha, hora_inicio, hora_fin: minToHhmm(fin), box_tipo };
  }

  // Buscar alternativas cercanas el mismo día (±cada 15 min)
  const alternativas = [];
  const stepsBefore = [-30, -60, -90, -120];
  const stepsAfter = [30, 60, 90, 120];
  const candidatos = [...stepsBefore.reverse(), ...stepsAfter];
  for (const delta of candidatos) {
    const cIni = ini + delta;
    const cFin = cIni + Number(duracion_min);
    if (cIni < horario.open || cFin > horario.close) continue;
    const choca = ocupados.some(o => haySolape(cIni, cFin, o.ini, o.fin));
    if (!choca) alternativas.push({ hora_inicio: minToHhmm(cIni), hora_fin: minToHhmm(cFin) });
    if (alternativas.length >= 4) break;
  }

  return {
    disponible: false,
    motivo: "El horario solicitado ya está ocupado.",
    alternativas,
  };
}

async function toolAgendar(sb, input) {
  const { fecha, hora_inicio, duracion_min, box_tipo } = input;
  if (!fecha || !hora_inicio || !duracion_min || !box_tipo)
    return { error: "Faltan datos para agendar (fecha, hora, duración, box_tipo)." };

  // Re-verificar disponibilidad antes de insertar (race condition guard)
  const check = await toolConsultar(sb, { fecha, hora_inicio, duracion_min, box_tipo });
  if (!check.disponible) {
    return {
      error: "Lo siento, el horario ya no está disponible. Por favor elige otra hora.",
      alternativas: check.alternativas || [],
    };
  }

  const ini = hhmmToMin(hora_inicio);
  const fin = ini + Number(duracion_min);
  const hora_fin = minToHhmm(fin);

  const payload = {
    nombre: (input.nombre || "").trim().slice(0, 200),
    telefono: (input.telefono || "").trim().slice(0, 50),
    email: input.email || null,
    rut: input.rut || null,
    motivo_consulta: (input.motivo_consulta || input.tratamiento || "").trim().slice(0, 1000),
    tratamiento: input.tratamiento || null,
    profesional_preferido: input.profesional_preferido || null,
    notas_adicionales: input.notas_adicionales || null,
    fecha_solicitada: fecha,
    hora_inicio,
    hora_fin,
    box_tipo,
    estado: "agendada",
  };

  const { data, error } = await sb
    .from("solicitudes_paciente")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    console.error("Supabase insert agendar:", error);
    return { error: "No pude guardar la cita. Por favor escribe a +56 9 8628 4965." };
  }

  // Enviar emails (no bloqueante)
  const det = { ...payload, codigo: data.id, tipo: "cita" };
  enviarEmailAdmin(det).catch(() => {});
  enviarEmailPaciente(det).catch(() => {});

  return {
    success: true,
    codigo_solicitud: data.id,
    fecha,
    hora_inicio,
    hora_fin,
    mensaje: `Cita agendada y bloqueada para ${fecha} a las ${hora_inicio}. Se confirmará por WhatsApp en máx 2 horas hábiles.`,
  };
}

async function toolRegistrar(sb, input) {
  const payload = {
    nombre: (input.nombre || "").trim().slice(0, 200),
    telefono: (input.telefono || "").trim().slice(0, 50),
    motivo_consulta: (input.motivo_consulta || "").trim().slice(0, 1000),
    especialidad_preferida: input.especialidad_preferida || null,
    profesional_preferido: input.profesional_preferido || null,
    fecha_preferida: input.fecha_preferida || null,
    email: input.email || null,
    rut: input.rut || null,
    notas_adicionales: input.notas_adicionales || null,
    estado: "pendiente",
  };

  const { data, error } = await sb
    .from("solicitudes_paciente")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    console.error("Supabase insert registrar:", error);
    return { error: "No pude guardar tu solicitud. Por favor escribe a +56 9 8628 4965." };
  }

  enviarEmailAdmin({ ...payload, codigo: data.id, tipo: "solicitud" }).catch(() => {});

  return {
    success: true,
    codigo_solicitud: data.id,
    mensaje: "Solicitud registrada. La admin contactará al paciente por WhatsApp en máx 2 horas hábiles.",
  };
}

// ─── HANDLER PRINCIPAL ─────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const { messages } = body;

    if (!Array.isArray(messages) || messages.length === 0) {
      return res
        .status(400)
        .json({ error: "Se requiere un array 'messages' no vacío" });
    }

    let safeMessages = messages
      .slice(-20)
      .filter(
        (m) =>
          m &&
          (m.role === "user" || m.role === "assistant") &&
          typeof m.content === "string" &&
          m.content.trim().length > 0
      );

    if (safeMessages.length === 0) {
      return res.status(400).json({ error: "Mensajes inválidos" });
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY no está configurada");
      return res
        .status(500)
        .json({ error: "Servicio no configurado. Contacta al administrador." });
    }

    const client = new Anthropic.default();

    let solicitudCodigo = null;
    let iteraciones = 0;
    const MAX_ITER = 6; // permite consultar disponibilidad varias veces antes de agendar

    // Fecha actual (Chile) — bloque dinámico (no cacheado) para que el bot resuelva "el viernes" etc.
    const hoy = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Santiago" }).format(new Date()); // YYYY-MM-DD
    const diasEs = ["domingo","lunes","martes","miércoles","jueves","viernes","sábado"];
    const dowHoy = diasEs[diaSemana(hoy)];

    // Loop agéntico: si el bot pide usar una herramienta, ejecutarla y volver
    while (iteraciones < MAX_ITER) {
      iteraciones++;

      const response = await client.messages.create({
        model: "claude-opus-4-7",
        max_tokens: 1024,
        system: [
          {
            type: "text",
            text: SYSTEM_PROMPT,
            cache_control: { type: "ephemeral" },
          },
          {
            type: "text",
            text: `**Fecha actual**: hoy es ${dowHoy} ${hoy}. Cuando el paciente diga "mañana" o "el viernes", calcula la fecha real basándote en esto.`,
          },
        ],
        tools: TOOLS,
        messages: safeMessages,
      });

      // Si el bot terminó con texto final, devolver
      if (response.stop_reason === "end_turn") {
        const textBlock = response.content.find((b) => b.type === "text");
        return res.status(200).json({
          text: textBlock ? textBlock.text : "",
          usage: response.usage,
          codigo_solicitud: solicitudCodigo,
        });
      }

      // Si pidió usar una herramienta, ejecutarla
      if (response.stop_reason === "tool_use") {
        const toolUseBlocks = response.content.filter(
          (b) => b.type === "tool_use"
        );

        // Agregar la respuesta del assistant al historial
        safeMessages.push({
          role: "assistant",
          content: response.content,
        });

        const toolResults = [];
        for (const toolUse of toolUseBlocks) {
          const result = await ejecutarHerramienta(toolUse.name, toolUse.input);
          if (result.success && result.codigo_solicitud) {
            solicitudCodigo = result.codigo_solicitud;
          }
          toolResults.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result),
          });
        }

        safeMessages.push({
          role: "user",
          content: toolResults,
        });

        continue; // volver a llamar al modelo
      }

      // Cualquier otro stop_reason: salir
      const textBlock = response.content.find((b) => b.type === "text");
      return res.status(200).json({
        text: textBlock
          ? textBlock.text
          : "Lo siento, hubo un problema. Por favor escribe a +56 9 8628 4965.",
        usage: response.usage,
        codigo_solicitud: solicitudCodigo,
      });
    }

    // Si llegamos aquí, hicimos demasiadas iteraciones
    return res.status(200).json({
      text: "Lo siento, no pude procesar completamente tu solicitud. Por favor escribe a +56 9 8628 4965.",
      codigo_solicitud: solicitudCodigo,
    });
  } catch (err) {
    console.error("Chat error:", err);
    const status = err.status || 500;
    const message =
      status === 429
        ? "Hay mucha demanda en este momento, intenta en unos segundos."
        : "Ocurrió un error procesando tu consulta. Intenta de nuevo.";
    return res.status(status).json({ error: message });
  }
};
