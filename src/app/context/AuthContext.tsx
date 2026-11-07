/**
 * AuthContext.tsx — Contexto global de autenticación y administración de usuarios.
 *
 * Responsabilidades:
 *  - Restaurar la sesión de Supabase al cargar la página y cargar el perfil del usuario.
 *  - Iniciar y cerrar sesión (login / logout).
 *  - Cerrar la sesión automáticamente tras INACTIVIDAD_MS sin actividad (ver
 *    hooks/useSesionInactividad.ts); el motivo queda en `motivoCierre` para que
 *    Login muestre "Tu sesión expiró".
 *  - CRUD de usuarios del sistema (tabla `usuarios` + cuentas de Supabase Auth).
 *
 * Modelo de datos:
 *  - Supabase Auth guarda las credenciales (email/contraseña).
 *  - La tabla `usuarios` guarda el perfil (nombre, username, estado, rol) y se vincula
 *    con Auth mediante la columna `auth_user_id`.
 *  - La tabla `roles` contiene los roles; `usuarios.rol_id` apunta a ella.
 *
 * Uso: envolver la app con <AuthProvider> y consumir con el hook useAuth().
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import type { User, UserRole } from '../types/auth';
import { supabase, createIsolatedClient } from '../lib/supabase';
import {
  guardarMotivoCierre,
  leerMotivoCierre,
  registrarActividadAhora,
  sesionInactivaExpirada,
  useSesionInactividad,
} from '../hooks/useSesionInactividad';

/** Motivo de un cierre de sesión automático (null = cierre manual o sin cierre). */
export type MotivoCierre = 'inactividad' | null;

/** Valores y funciones que expone el contexto. */
interface AuthContextType {
  /** Usuario con sesión iniciada (null si no hay sesión). */
  user: User | null;
  isAuthenticated: boolean;
  /** true mientras se restaura la sesión inicial; evita redirigir a /login antes de tiempo. */
  loading: boolean;
  /** Devuelve false si las credenciales son incorrectas; lanza error si el perfil no es válido. */
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  /** Por qué se cerró la sesión automáticamente; Login lo muestra como aviso. */
  motivoCierre: MotivoCierre;
  /** Lista de usuarios (solo se llena al llamar a refreshUsers, p. ej. en Gestión de Usuarios). */
  users: User[];
  refreshUsers: () => Promise<void>;
  addUser: (user: Omit<User, 'id'>, password: string) => Promise<void>;
  updateUser: (id: string, user: Partial<User>) => Promise<void>;
  deleteUser: (id: string) => Promise<void>;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Columnas a consultar de `usuarios`; `roles(nombre)` hace un join con la tabla roles.
const USER_FIELDS = 'id,nombre,username,email,estado,ultimo_acceso,roles(nombre)';

// Convierte una fila de la base de datos (snake_case) al tipo User de la app.
// La fecha de último acceso se formatea en español de México.
const mapUser = (row: any): User => ({ id: row.id, nombre: row.nombre, username: row.username, email: row.email, rol: row.roles?.nombre as UserRole, estado: row.estado, ultimoAcceso: row.ultimo_acceso ? new Date(row.ultimo_acceso).toLocaleString('es-MX') : 'Nunca' });

// Obtiene el UUID de un rol a partir de su nombre (necesario para guardar `rol_id`).
const getRoleId = async (rol: UserRole) => { const { data, error } = await supabase.from('roles').select('id').eq('nombre', rol).single(); if (error || !data) throw new Error(`No existe el rol "${rol}" en la base de datos`); return data.id as string; };

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [motivoCierre, setMotivoCierre] = useState<MotivoCierre>(() => leerMotivoCierre() as MotivoCierre);

  /**
   * Cierra la sesión por inactividad. scope 'local' cierra solo este navegador (todas
   * sus pestañas), sin invalidar las sesiones del usuario en otros equipos.
   * El motivo se guarda en localStorage para que las demás pestañas también lo muestren.
   */
  const expirarSesion = useCallback(async () => {
    guardarMotivoCierre('inactividad');
    setMotivoCierre('inactividad');
    setUser(null);
    setUsers([]);
    await supabase.auth.signOut({ scope: 'local' });
  }, []);

  // Vigila la inactividad solo mientras hay sesión.
  useSesionInactividad(!!user, () => {
    void expirarSesion();
    toast.info('Tu sesión expiró por inactividad', { description: 'Inicia sesión de nuevo para continuar.' });
  });

  // Recarga la lista completa de usuarios ordenada por nombre.
  const refreshUsers = async () => { const { data, error } = await supabase.from('usuarios').select(USER_FIELDS).order('nombre'); if (error) throw error; setUsers((data ?? []).map(mapUser)); };

  /**
   * Carga el perfil (tabla `usuarios`) asociado a una cuenta de Supabase Auth.
   * Valida que el perfil exista y esté activo; si no, cierra la sesión y lanza un error.
   * Si todo es correcto, guarda el usuario y registra la fecha de último acceso.
   */
  const loadProfile = async (authId: string) => {
    const { data, error } = await supabase.from('usuarios').select(USER_FIELDS).eq('auth_user_id', authId).maybeSingle();
    if (error) throw error;
    // Sin perfil o inactivo: cerrar la sesión de Supabase para que el token deje de ser válido.
    if (!data) { await supabase.auth.signOut(); setUser(null); throw new Error('Tu cuenta no tiene un perfil de usuario asignado'); }
    const profile = mapUser(data);
    if (profile.estado !== 'activo') { await supabase.auth.signOut(); setUser(null); throw new Error('Tu usuario está inactivo'); }
    setUser(profile);
    // Función SQL (RPC) en Supabase que actualiza `ultimo_acceso` del usuario actual.
    await supabase.rpc('actualizar_mi_ultimo_acceso');
  };

  useEffect(() => {
    // INITIAL_SESSION restaura la sesión al cargar; SIGNED_IN lo maneja login() para poder reportar errores.
    // Se difiere con setTimeout porque Supabase recomienda no llamar a la API dentro del callback.
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') {
        setTimeout(() => {
          // Sin sesión guardada: terminar la carga (ProtectedRoute enviará a /login).
          if (!session) { setLoading(false); return; }
          // La sesión quedó guardada pero el usuario no volvió en más del límite
          // (p. ej. cerró el navegador): se cierra en lugar de restaurarla.
          if (sesionInactivaExpirada()) { expirarSesion().finally(() => setLoading(false)); return; }
          loadProfile(session.user.id).catch(() => setUser(null)).finally(() => setLoading(false));
        }, 0);
      } else if (event === 'SIGNED_OUT') {
        // Sesión cerrada (manualmente, por expiración o desde otra pestaña): limpiar estado.
        setUser(null);
        setUsers([]);
        // Si otra pestaña cerró la sesión por inactividad, mostrar el mismo motivo aquí.
        setMotivoCierre(leerMotivoCierre() as MotivoCierre);
      }
    });
    // Al desmontar, cancelar la suscripción para evitar fugas de memoria.
    return () => listener.subscription.unsubscribe();
  }, [expirarSesion]);

  // Inicia sesión con email/contraseña; si las credenciales son válidas, carga el perfil.
  // Al entrar se reinicia el contador de inactividad y se descarta el aviso de expiración.
  const login = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.user) return false;
    registrarActividadAhora();
    guardarMotivoCierre(null);
    setMotivoCierre(null);
    await loadProfile(data.user.id);
    return true;
  };
  // Cierra la sesión en Supabase y limpia el estado local (cierre manual: sin aviso).
  const logout = async () => { guardarMotivoCierre(null); setMotivoCierre(null); await supabase.auth.signOut(); setUser(null); setUsers([]); };

  /**
   * Crea un usuario nuevo en dos pasos:
   *  1. Registra la cuenta en Supabase Auth con un cliente aislado (para no cerrar la
   *     sesión del administrador que está creando el usuario).
   *  2. Completa el perfil en la tabla `usuarios`. El trigger `on_auth_user_created` ya
   *     insertó un perfil básico (sin rol) al crear la cuenta, así que se actualiza ese;
   *     solo si no existe se inserta uno nuevo.
   * Antes de crear la cuenta se comprueba que el username y el email no estén en uso,
   * para no crear nada si van a fallar. Si aun así el paso 2 falla, se deshace el alta
   * completa con la RPC `eliminar_usuario`, para no dejar una cuenta de Auth con un
   * perfil sin rol.
   */
  const addUser = async (newUser: Omit<User, 'id'>, password: string) => {
    if (!newUser.email) throw new Error('El email es obligatorio');
    const rolId = await getRoleId(newUser.rol);

    // ilike sin comodines = comparación sin distinguir mayúsculas (los correos no las distinguen).
    const [{ data: mismoUsername }, { data: mismoEmail }] = await Promise.all([
      supabase.from('usuarios').select('id').eq('username', newUser.username).limit(1),
      supabase.from('usuarios').select('id').ilike('email', newUser.email.replace(/[\\%_]/g, '\\$&')).limit(1),
    ]);
    if (mismoUsername?.length) throw new Error(`El usuario "${newUser.username}" ya existe`);
    if (mismoEmail?.length) throw new Error(`El email ${newUser.email} ya está registrado`);

    const { data, error } = await createIsolatedClient().auth.signUp({ email: newUser.email, password });
    if (error) throw new Error(error.message);
    // Supabase devuelve un usuario sin identidades cuando el correo ya está registrado.
    if (!data.user || data.user.identities?.length === 0) throw new Error('Ese correo ya tiene una cuenta registrada');
    const authId = data.user.id;
    const perfil = { rol_id: rolId, nombre: newUser.nombre, username: newUser.username, email: newUser.email, estado: newUser.estado };

    const { data: actualizado, error: updateError } = await supabase.from('usuarios').update(perfil).eq('auth_user_id', authId).select('id');
    let perfilError = updateError;
    if (!perfilError && !actualizado?.length) {
      ({ error: perfilError } = await supabase.from('usuarios').insert({ auth_user_id: authId, ...perfil }));
    }
    if (perfilError) {
      // Deshacer: borrar el perfil básico del trigger y la cuenta de Auth recién creada.
      const { data: huerfano } = await supabase.from('usuarios').select('id').eq('auth_user_id', authId).maybeSingle();
      const { error: rollbackError } = huerfano ? await supabase.rpc('eliminar_usuario', { p_usuario: huerfano.id }) : { error: null };
      // 23505 = violación de restricción UNIQUE en PostgreSQL (username o email duplicado).
      const motivo = perfilError.code === '23505' ? 'El usuario o el email ya existen' : perfilError.message;
      throw new Error(rollbackError ? `${motivo}. La cuenta de acceso quedó creada sin perfil completo; elimínala desde la lista de usuarios.` : motivo);
    }
    await refreshUsers();
  };

  /**
   * Actualiza el perfil de un usuario. Si cambia el rol, se traduce a `rol_id`.
   * Si el usuario editado es el que tiene la sesión, también se actualiza `user`.
   * Nota: esto modifica el perfil, no el email/contraseña de Supabase Auth.
   */
  const updateUser = async (id: string, updates: Partial<User>) => {
    const row: Record<string, unknown> = { nombre: updates.nombre, username: updates.username, email: updates.email, estado: updates.estado };
    if (updates.rol) row.rol_id = await getRoleId(updates.rol);
    const { data, error } = await supabase.from('usuarios').update(row).eq('id', id).select(USER_FIELDS).single();
    if (error) throw new Error(error.code === '23505' ? 'El usuario o el email ya existen' : error.message);
    if (id === user?.id) setUser(mapUser(data));
    await refreshUsers();
  };

  /**
   * Elimina un usuario completo: su perfil en `usuarios` y su cuenta de Supabase Auth,
   * con la RPC `eliminar_usuario` (sql/eliminar_usuario.sql), que solo permite hacerlo
   * al administrador primario. Si tiene registros relacionados la base de datos lo
   * impide (código 23503 = violación de llave foránea), no borra nada y se sugiere
   * desactivarlo.
   */
  const deleteUser = async (id: string) => {
    const { error } = await supabase.rpc('eliminar_usuario', { p_usuario: id });
    if (error) {
      if (error.code === '23503') throw new Error('El usuario tiene registros asociados (órdenes, movimientos, etc.). Márcalo como inactivo en lugar de eliminarlo.');
      // PGRST202 = la función no existe en la base de datos (falta aplicar el script).
      if (error.code === 'PGRST202') throw new Error('Falta instalar la función eliminar_usuario en Supabase (sql/eliminar_usuario.sql).');
      throw new Error(error.message);
    }
    await refreshUsers();
  };

  return <AuthContext.Provider value={{ user, isAuthenticated: !!user, loading, login, logout, motivoCierre, users, refreshUsers, addUser, updateUser, deleteUser }}>{children}</AuthContext.Provider>;
};

/** Hook para acceder al contexto de autenticación. Debe usarse dentro de <AuthProvider>. */
export const useAuth = () => { const context = useContext(AuthContext); if (!context) throw new Error('useAuth must be used within AuthProvider'); return context; };
