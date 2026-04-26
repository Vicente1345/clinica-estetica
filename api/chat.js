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

1. Pregunta el **nombre completo**.
2. Pregunta el **teléfono/WhatsApp** (formato chileno +56 9 XXXX XXXX, acepta cualquier formato).
3. Pregunta el **motivo o tratamiento** (ej: "Hydrafacial", "limpieza dental", "consulta de Botox", "depilación láser").
4. Opcionalmente pregunta: profesional preferido, día/horario que acomode, email.
5. Cuando tengas nombre + teléfono + motivo, **resume y pide confirmación** ("¿Confirmas que registre tu solicitud?").
6. Cuando confirme, **llama a la herramienta \`registrar_solicitud_paciente\`** con todos los datos.
7. Comparte el código de solicitud y avisa que se le contactará por WhatsApp para confirmar el horario.

## Reglas importantes

- **NUNCA inventes precios, profesionales, tratamientos ni horarios.** Si no aparece en este prompt, no existe — redirige a WhatsApp.
- **NO confirmes horas específicas** — el sistema actual genera una **solicitud**, no una reserva confirmada. La admin coordina el horario final por WhatsApp en máximo 2 horas hábiles.
- Si el paciente pregunta por disponibilidad concreta, dile: "Voy a registrar tu solicitud y la admin te confirmará el horario disponible más cercano por WhatsApp en máx 2 horas hábiles."
- Si hay un error técnico al guardar, da el WhatsApp +56 9 8628 4965.

## Si te preguntan por arriendo de boxes (profesionales)

La clínica también funciona como cowork médico. Tres boxes: Estético ($10.000/h, $45.000 jornada, planes desde $170.000/mes), Dental Plan Flex sin asistente ($15.000/h, $45.000 jornada, planes desde $150.000/mes anual), Dental Plan PRO con asistente ($18.000/h, $65.000 jornada, planes desde $230.000/mes anual, Plan Exclusivo $1.350.000/mes), y Médico ($12.000/h, $55.000 jornada, planes desde $215.000/mes). Para info detallada redirige al sitio de profesionales o WhatsApp.`;

// ─── HERRAMIENTAS DEL BOT ──────────────────────────────────────────
const TOOLS = [
  {
    name: "registrar_solicitud_paciente",
    description:
      "Registra una solicitud de hora de un paciente. Llamar SOLO cuando el paciente confirme que quiere agendar y se tengan al menos nombre, teléfono y motivo de consulta. Devuelve un código de solicitud.",
    input_schema: {
      type: "object",
      properties: {
        nombre: {
          type: "string",
          description: "Nombre completo del paciente",
        },
        telefono: {
          type: "string",
          description: "Teléfono o WhatsApp del paciente (cualquier formato)",
        },
        motivo_consulta: {
          type: "string",
          description: "Motivo o razón de la consulta",
        },
        especialidad_preferida: {
          type: "string",
          enum: ["dental", "estetico", "medico", "cualquiera"],
          description: "Especialidad preferida si la mencionó",
        },
        profesional_preferido: {
          type: "string",
          description:
            "Nombre del profesional preferido si lo mencionó (opcional)",
        },
        fecha_preferida: {
          type: "string",
          description:
            "Día/horario preferido en texto libre (ej: 'lunes en la mañana', 'cualquier día después de las 17:00')",
        },
        email: {
          type: "string",
          description: "Email del paciente (opcional)",
        },
        rut: {
          type: "string",
          description: "RUT del paciente (opcional)",
        },
        notas_adicionales: {
          type: "string",
          description:
            "Cualquier información adicional relevante que mencionó el paciente",
        },
      },
      required: ["nombre", "telefono", "motivo_consulta"],
    },
  },
];

// ─── EJECUCIÓN DE HERRAMIENTAS ─────────────────────────────────────
async function ejecutarHerramienta(name, input) {
  if (name !== "registrar_solicitud_paciente") {
    return { error: `Herramienta desconocida: ${name}` };
  }

  const supabaseUrl =
    process.env.REACT_APP_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey =
    process.env.REACT_APP_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return {
      error:
        "Servicio temporalmente no disponible. Por favor escribe a +56 9 8628 4965.",
    };
  }

  try {
    const sb = createClient(supabaseUrl, supabaseKey);
    const { data, error } = await sb
      .from("solicitudes_paciente")
      .insert({
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
      })
      .select("id")
      .single();

    if (error) {
      console.error("Supabase insert error:", error);
      return {
        error:
          "No pude guardar tu solicitud. Por favor escribe a +56 9 8628 4965.",
      };
    }

    return {
      success: true,
      codigo_solicitud: data.id,
      mensaje:
        "Solicitud registrada correctamente. La admin contactará al paciente por WhatsApp dentro de las próximas 2 horas hábiles.",
    };
  } catch (err) {
    console.error("Tool execution error:", err);
    return {
      error:
        "Error técnico. Por favor escribe a +56 9 8628 4965.",
    };
  }
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
    const MAX_ITER = 4; // hard cap para no entrar en loop

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
