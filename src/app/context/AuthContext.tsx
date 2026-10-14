/**
 * AuthContext.tsx — Contexto global de autenticación y administración de usuarios.
 *
 * Responsabilidades:
 *  - Restaurar la sesión de Supabase al cargar la página y cargar el perfil del usuario.
 *  - Iniciar y cerrar sesión (login / logout).
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
import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, UserRole } from '../types/auth';
import { supabase, createIsolatedClient } from '../lib/supabase';

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
          loadProfile(session.user.id).catch(() => setUser(null)).finally(() => setLoading(false));
        }, 0);
      } else if (event === 'SIGNED_OUT') {
        // Sesión cerrada (manualmente, por expiración o desde otra pestaña): limpiar estado.
        setUser(null);
        setUsers([]);
      }
    });
    // Al desmontar, cancelar la suscripción para evitar fugas de memoria.
    return () => listener.subscription.unsubscribe();
  }, []);

  // Inicia sesión con email/contraseña; si las credenciales son válidas, carga el perfil.
  const login = async (email: string, password: string) => { const { data, error } = await supabase.auth.signInWithPassword({ email, password }); if (error || !data.user) return false; await loadProfile(data.user.id); return true; };
  // Cierra la sesión en Supabase y limpia el estado local.
  const logout = async () => { await supabase.auth.signOut(); setUser(null); setUsers([]); };

  /**
   * Crea un usuario nuevo en dos pasos:
   *  1. Registra la cuenta en Supabase Auth con un cliente aislado (para no cerrar la
   *     sesión del administrador que está creando el usuario).
   *  2. Inserta el perfil en la tabla `usuarios` vinculado a esa cuenta.
   */
  const addUser = async (newUser: Omit<User, 'id'>, password: string) => {
    if (!newUser.email) throw new Error('El email es obligatorio');
    const rolId = await getRoleId(newUser.rol);
    const { data, error } = await createIsolatedClient().auth.signUp({ email: newUser.email, password });
    if (error) throw new Error(error.message);
    // Supabase devuelve un usuario sin identidades cuando el correo ya está registrado.
    if (!data.user || data.user.identities?.length === 0) throw new Error('Ese correo ya tiene una cuenta registrada');
    const { error: insertError } = await supabase.from('usuarios').insert({ auth_user_id: data.user.id, rol_id: rolId, nombre: newUser.nombre, username: newUser.username, email: newUser.email, estado: newUser.estado });
    // 23505 = violación de restricción UNIQUE en PostgreSQL (username o email duplicado).
    if (insertError) throw new Error(insertError.code === '23505' ? 'El usuario o el email ya existen' : insertError.message);
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
   * Elimina el perfil de un usuario. Si tiene registros relacionados la base de datos
   * lo impide (código 23503 = violación de llave foránea) y se sugiere desactivarlo.
   */
  const deleteUser = async (id: string) => {
    const { error } = await supabase.from('usuarios').delete().eq('id', id);
    if (error) throw new Error(error.code === '23503' ? 'El usuario tiene registros asociados (órdenes, movimientos, etc.). Márcalo como inactivo en lugar de eliminarlo.' : error.message);
    await refreshUsers();
  };

  return <AuthContext.Provider value={{ user, isAuthenticated: !!user, loading, login, logout, users, refreshUsers, addUser, updateUser, deleteUser }}>{children}</AuthContext.Provider>;
};

/** Hook para acceder al contexto de autenticación. Debe usarse dentro de <AuthProvider>. */
export const useAuth = () => { const context = useContext(AuthContext); if (!context) throw new Error('useAuth must be used within AuthProvider'); return context; };
