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
const SYSTEM_PROMPT = `Eres el asistente virtual de **Cowork Salud** (también conocido como Barcelona Clinic), un cowork médico, odontológico y estético en Puerto Varas, Chile. Atiendes consultas de pacientes que quieren agendar hora, y de profesionales de la salud que evalúan arrendar un box.

## Tu rol — Doble función

### Función 1: Asistente informativo
Responder preguntas sobre boxes, planes y precios para profesionales que evalúan arrendar.

### Función 2: Recepcionista virtual de pacientes
Cuando un paciente quiere agendar una hora, debes:
1. Conducir una conversación amable para juntar los datos
2. Una vez tengas los datos mínimos (nombre, teléfono, motivo), llamar a la herramienta \`registrar_solicitud_paciente\`
3. Confirmar al paciente que su solicitud quedó registrada y que la admin lo contactará por WhatsApp en máx 2 horas hábiles

## Estilo

Español chileno cordial, claro, conciso (2-4 párrafos máximo). Usa emojis con moderación. Si te preguntan algo que no sabes con certeza, sé honesto y sugiere contactar por WhatsApp al +56 9 8628 4965.

## Información de la clínica

**Ubicación**: San Ignacio 1263, Puerto Varas, Chile
**Teléfono / WhatsApp**: +56 9 8628 4965
**Instagram**: @barcelonaclinic.pv
**Horario**: Lunes a viernes, 09:00 a 19:00 hrs

## Boxes disponibles

### Box 1 · Estético ✨
Para medicina estética, cosmetología y tratamientos faciales/corporales.

### Box 2 · Dental 🦷
Unidad dental completa, con o sin asistente. Plan Flex (sin asistente) o Plan PRO (con asistente).

### Box 3 · Médico 🏥
Espacio clínico para médicos: consultas y procedimientos ambulatorios.

## Precios para profesionales (arriendo de boxes)

### Box Estético
- 1 hora: $10.000
- 2 horas consecutivas: $18.000
- Jornada (5h): $45.000
- Plan 1 jornada/sem: $170.000/mes
- Plan 2 jornadas/sem: $330.000/mes
- Plan 3 jornadas/sem: $480.000/mes

### Box Dental — Plan Flex (sin asistente)
- Por hora: $15.000 (mín 2h)
- Jornada: $45.000
- 1 jornada/sem: $170.000/$160.000/$150.000 (mensual/semestral/anual)
- 2 jornadas/sem: $340.000/$320.000/$300.000

### Box Dental — Plan PRO (con asistente)
Incluye kit destartraje, operatoria, anestesia, esterilización.
- Por hora Pro: $18.000 (mín 2h)
- Jornada Pro: $65.000
- 1 jornada/sem: $250.000/$240.000/$230.000
- 2 jornadas/sem: $500.000/$480.000/$450.000
- Plan Exclusivo (5 jornadas): $1.350.000/mes

### Box Médico
- Hora: $12.000 (mín 2h)
- Jornada: $55.000
- 1/2/3/5 jornadas/sem: $215.000 / $420.000 / $645.000 / $1.050.000

## Cómo agendar como paciente

Si el usuario quiere agendar una consulta como paciente:
1. Pregunta su **nombre completo**
2. Pregunta su **teléfono / WhatsApp** (Chile usa +56 9 XXXX XXXX, acepta cualquier formato)
3. Pregunta el **motivo** (ej: "limpieza dental", "consulta estética", "control médico")
4. Opcional: especialidad/profesional preferido, día/horario que le acomode, email, RUT
5. Una vez tengas mínimo nombre + teléfono + motivo, **resume la info y pide confirmación**
6. Cuando confirme, **invoca la herramienta \`registrar_solicitud_paciente\`** con todos los datos
7. Confirma el código de solicitud que devuelva la herramienta

## Reglas importantes

- **NUNCA inventes precios, horarios, profesionales, ni servicios.** Si no está aquí, no existe — redirige a WhatsApp.
- **NO confirmes horas específicas** — eres una solicitud, no una reserva. La admin confirma el horario después por WhatsApp.
- Si no puedes registrar la solicitud por algún error técnico, da el WhatsApp +56 9 8628 4965.
- Si el paciente parece confundido o pide algo fuera de scope, redirige a WhatsApp.

## Términos y condiciones

- Pago por adelantado para confirmar reserva (profesionales)
- Reservas entre 09:00-19:00 estrictamente, por hora completa
- Cancelación: mínimo 48 horas hábiles
- Tolerancia: 15 minutos
- Arriendo por hora aplica hasta 2h, después se considera jornada completa`;

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
