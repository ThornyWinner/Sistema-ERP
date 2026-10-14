/**
 * supabase.ts — Configuración del cliente de Supabase (base de datos + autenticación).
 *
 * Las credenciales se leen de variables de entorno de Vite (archivo .env):
 *  - VITE_SUPABASE_URL:             URL del proyecto de Supabase.
 *  - VITE_SUPABASE_PUBLISHABLE_KEY: clave pública (publishable/anon). Puede exponerse en
 *                                   el navegador porque el acceso real a los datos lo
 *                                   controlan las políticas RLS de la base de datos.
 */
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Falla al arrancar si falta la configuración, en lugar de producir errores confusos más tarde.
if (!url || !key) {
  throw new Error('Faltan VITE_SUPABASE_URL y VITE_SUPABASE_PUBLISHABLE_KEY');
}

// Cliente principal compartido por toda la app: guarda la sesión en localStorage
// y renueva el token de acceso automáticamente.
export const supabase = createClient(url, key);

// Cliente sin sesión persistente: permite registrar cuentas nuevas sin reemplazar la sesión del administrador.
// Usa un storageKey distinto para no sobrescribir la sesión guardada del cliente principal.
export const createIsolatedClient = () =>
  createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'sb-isolated-signup' } });
