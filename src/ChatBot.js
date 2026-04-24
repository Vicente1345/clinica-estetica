// ChatBot — burbuja flotante reusable
// Uso: <ChatBot variante="publico" /> en Landing.js o <ChatBot variante="interno" usuario={user} /> en App.js
import { useState, useRef, useEffect } from "react";

const COLORS = {
  lila: "#9B8EC4",
  lilaPale: "#EDE8F7",
  rosa: "#E8B4C0",
  rosaPale: "#FAEEF1",
  cafe: "#3D2B1F",
  cafeClaro: "#6B4C3B",
  blanco: "#FFFFFF",
  gris: "#888888",
  beige: "#F5EFE6",
};

const SALUDO = {
  publico:
    "👋 ¡Hola! Soy el asistente virtual de Cowork Salud. Puedo ayudarte con info sobre nuestros boxes, planes y precios. ¿En qué te ayudo?",
  interno:
    "👋 ¡Hola! ¿En qué te puedo ayudar? Puedo responderte sobre planes, precios, condiciones de arriendo o términos del cowork.",
};

export default function ChatBot({ variante = "publico", usuario = null }) {
  const [abierto, setAbierto] = useState(false);
  const [mensajes, setMensajes] = useState([
    { role: "assistant", content: SALUDO[variante] || SALUDO.publico },
  ]);
  const [input, setInput] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const fondoRef = useRef(null);

  // Auto-scroll al final al recibir mensaje nuevo
  useEffect(() => {
    if (fondoRef.current) {
      fondoRef.current.scrollTop = fondoRef.current.scrollHeight;
    }
  }, [mensajes, cargando]);

  const enviar = async (e) => {
    if (e) e.preventDefault();
    const texto = input.trim();
    if (!texto || cargando) return;

    const nuevoUser = { role: "user", content: texto };
    const nuevoHistorial = [...mensajes, nuevoUser];
    setMensajes(nuevoHistorial);
    setInput("");
    setError("");
    setCargando(true);

    try {
      // Enviar solo user/assistant al backend (saltar el saludo inicial si es del bot)
      const apiMessages = nuevoHistorial
        .filter((m) => m.role === "user" || m.role === "assistant")
        .map((m) => ({ role: m.role, content: m.content }));

      const resp = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        throw new Error(data.error || "Error en el servidor");
      }

      setMensajes((m) => [
        ...m,
        {
          role: "assistant",
          content: data.text || "(sin respuesta)",
          codigo_solicitud: data.codigo_solicitud || null,
        },
      ]);
    } catch (err) {
      console.error(err);
      setError(err.message || "No se pudo conectar con el chatbot.");
      setMensajes((m) => [
        ...m,
        {
          role: "assistant",
          content:
            "😕 Disculpa, tuve un problema técnico. Por favor escríbenos directo por WhatsApp al +56 9 8628 4965.",
        },
      ]);
    } finally {
      setCargando(false);
    }
  };

  const limpiar = () => {
    setMensajes([
      { role: "assistant", content: SALUDO[variante] || SALUDO.publico },
    ]);
    setError("");
  };

  return (
    <>
      {/* Burbuja flotante */}
      <button
        onClick={() => setAbierto((o) => !o)}
        aria-label={abierto ? "Cerrar chat" : "Abrir chat"}
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: 60,
          height: 60,
          borderRadius: "50%",
          background: abierto ? COLORS.cafeClaro : COLORS.lila,
          color: COLORS.blanco,
          border: "none",
          cursor: "pointer",
          fontSize: 26,
          boxShadow: "0 6px 22px rgba(155,142,196,0.5)",
          zIndex: 1000,
          transition: "all .25s",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {abierto ? "×" : "💬"}
      </button>

      {/* Ventana del chat */}
      {abierto && (
        <div
          style={{
            position: "fixed",
            bottom: 100,
            right: 24,
            width: "min(380px, 92vw)",
            height: "min(560px, 75vh)",
            background: COLORS.blanco,
            borderRadius: 16,
            boxShadow: "0 12px 40px rgba(61,43,31,0.25)",
            zIndex: 999,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            fontFamily: "system-ui, sans-serif",
          }}
        >
          {/* Header */}
          <div
            style={{
              background: `linear-gradient(135deg, ${COLORS.lila}, ${COLORS.rosa})`,
              padding: "14px 18px",
              color: COLORS.blanco,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: ".02em" }}>
                Asistente Cowork Salud
              </div>
              <div style={{ fontSize: 11, opacity: 0.9, marginTop: 2 }}>
                {usuario ? `Hola ${usuario.nombre || ""}` : "Pregúntame sobre planes y precios"}
              </div>
            </div>
            <button
              onClick={limpiar}
              title="Limpiar conversación"
              style={{
                background: "rgba(255,255,255,0.2)",
                border: "none",
                color: COLORS.blanco,
                fontSize: 11,
                padding: "5px 10px",
                borderRadius: 12,
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              ↻ Limpiar
            </button>
          </div>

          {/* Mensajes */}
          <div
            ref={fondoRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "16px 14px",
              background: COLORS.beige,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {mensajes.map((m, i) => (
              <div
                key={i}
                style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "85%",
                  background: m.role === "user" ? COLORS.lila : COLORS.blanco,
                  color: m.role === "user" ? COLORS.blanco : COLORS.cafe,
                  padding: "10px 14px",
                  borderRadius:
                    m.role === "user" ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                  fontSize: 13,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  boxShadow: "0 1px 3px rgba(61,43,31,0.08)",
                }}
              >
                {m.content}
                {m.codigo_solicitud && (
                  <div
                    style={{
                      marginTop: 8,
                      padding: "6px 10px",
                      background: "#E8F5E9",
                      color: "#1B5E20",
                      borderRadius: 8,
                      fontSize: 11,
                      fontWeight: 700,
                      border: "1px solid #A5D6A7",
                    }}
                  >
                    ✅ Código de solicitud: #{m.codigo_solicitud}
                  </div>
                )}
              </div>
            ))}
            {cargando && (
              <div
                style={{
                  alignSelf: "flex-start",
                  background: COLORS.blanco,
                  padding: "10px 14px",
                  borderRadius: "16px 16px 16px 4px",
                  fontSize: 13,
                  color: COLORS.gris,
                  fontStyle: "italic",
                }}
              >
                escribiendo<span className="dots">...</span>
              </div>
            )}
            {error && (
              <div
                style={{
                  fontSize: 11,
                  color: "#A32D2D",
                  background: "#FCEBEB",
                  padding: "6px 10px",
                  borderRadius: 8,
                  alignSelf: "center",
                }}
              >
                ⚠ {error}
              </div>
            )}
          </div>

          {/* Input */}
          <form
            onSubmit={enviar}
            style={{
              borderTop: `1px solid ${COLORS.lilaPale}`,
              padding: "10px 12px",
              display: "flex",
              gap: 8,
              background: COLORS.blanco,
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu pregunta..."
              disabled={cargando}
              style={{
                flex: 1,
                padding: "10px 12px",
                borderRadius: 22,
                border: `1px solid ${COLORS.lilaPale}`,
                background: COLORS.beige,
                fontSize: 13,
                color: COLORS.cafe,
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <button
              type="submit"
              disabled={cargando || !input.trim()}
              style={{
                background: cargando || !input.trim() ? COLORS.gris : COLORS.lila,
                color: COLORS.blanco,
                border: "none",
                padding: "0 18px",
                borderRadius: 22,
                cursor: cargando || !input.trim() ? "default" : "pointer",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              ➤
            </button>
          </form>
          <div
            style={{
              fontSize: 9,
              color: COLORS.gris,
              textAlign: "center",
              padding: "4px 0 8px",
              fontFamily: "system-ui",
            }}
          >
            Powered by Claude · Las respuestas pueden contener errores
          </div>
        </div>
      )}
    </>
  );
}
