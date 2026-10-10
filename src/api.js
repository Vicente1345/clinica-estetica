// src/api.js — Llamadas autenticadas a los endpoints del servidor.
// Centraliza el token de sesión (emitido por /api/login). Ninguna pantalla
// habla directo con Supabase: con RLS cerrada, la anon key del bundle solo
// sirve para subir comprobantes (INSERT-only al bucket) y nada más.
import { sb } from './supabase';

export const tokenSesion = () => {
  try { return JSON.parse(sessionStorage.getItem('cli_user') || '{}')._token || ''; } catch { return ''; }
};

// Sesión expirada (los tokens duran 12 h): volver al login en vez de dejar
// la pantalla congelada con datos vacíos
function siSesionExpirada(r) {
  if (r.status !== 401) return false;
  try { sessionStorage.removeItem('cli_user'); } catch {}
  window.location.reload();
  return true;
}

export async function apiGet(ruta) {
  try {
    const r = await fetch(ruta, { headers: { Authorization: `Bearer ${tokenSesion()}` } });
    if (siSesionExpirada(r)) return { ok: false, error: 'Sesión expirada' };
    return await r.json();
  } catch { return { ok: false, error: 'Error de conexión' }; }
}

export async function apiGestion(op, datos) {
  try {
    const r = await fetch('/api/gestion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSesion()}` },
      body: JSON.stringify({ op, datos }),
    });
    if (siSesionExpirada(r)) return { ok: false, error: 'Sesión expirada' };
    return await r.json();
  } catch { return { ok: false, error: 'Error de conexión' }; }
}

// Disponibilidad pública sanitizada (con token, el staff recibe el detalle)
export async function apiOcupacion(params = '') {
  try {
    const r = await fetch('/api/ocupacion' + params, { headers: { Authorization: `Bearer ${tokenSesion()}` } });
    return await r.json();
  } catch { return { ok: false, error: 'Error de conexión' }; }
}

// Abre un comprobante vía URL firmada generada en el servidor
export async function abrirComprobante(tabla, id) {
  try {
    const r = await fetch('/api/comprobante-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenSesion()}` },
      body: JSON.stringify({ tabla, id }),
    });
    const data = await r.json();
    if (data.ok && data.url) { window.open(data.url, '_blank'); return true; }
    return false;
  } catch { return false; }
}

// Subida del comprobante: única operación que permanece con la anon key
// (INSERT-only; la policy de storage impide listar, leer o sobrescribir)
export function subirArchivoComprobante(path, file) {
  return sb.storage.from('comprobantes').upload(path, file, { upsert: false });
}
