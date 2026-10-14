/**
 * ProtectedRoute.tsx — Guarda de rutas que exige una sesión iniciada.
 *
 * - Mientras AuthContext restaura la sesión (loading), muestra "Cargando...".
 * - Si no hay usuario autenticado, redirige a /login guardando la ruta de origen
 *   en `state.from` para poder regresar a ella después de iniciar sesión.
 * - Si hay sesión, renderiza el contenido protegido.
 */
import React from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  /** Contenido que solo debe verse con sesión iniciada. */
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, loading } = useAuth();
  // Ruta actual; se pasa a /login para volver a ella tras autenticarse.
  const location = useLocation();

  // Evita redirigir a /login antes de saber si existe una sesión guardada.
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 text-neutral-500">
        Cargando...
      </div>
    );
  }

  // `replace` sustituye la entrada del historial para que "Atrás" no regrese a la ruta protegida.
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
