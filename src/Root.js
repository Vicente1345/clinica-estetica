import { useState } from 'react';
import Landing from './Landing';
import App from './App';

// ─── ROOT ──────────────────────────────────────────────────────────
// Muestra la Landing page por defecto.
// Cuando el usuario hace login desde el modal, se pasa a la App.
// Cuando hace "Cerrar sesión", vuelve a la Landing.

export default function Root() {
  const [usuario, setUsuario] = useState(() => {
    // Si hay sesión guardada, recuperarla
    try {
      const u = sessionStorage.getItem('cli_user');
      return u ? JSON.parse(u) : null;
    } catch { return null; }
  });

  const handleLogin = (u) => {
    sessionStorage.setItem('cli_user', JSON.stringify(u));
    setUsuario(u);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('cli_user');
    setUsuario(null);
  };

  // Si hay usuario logueado → mostrar la App
  if (usuario) {
    return <App usuarioInicial={usuario} onLogout={handleLogout} />;
  }

  // Si no → mostrar la Landing con el modal de login
  return <Landing onLogin={handleLogin} />;
}
