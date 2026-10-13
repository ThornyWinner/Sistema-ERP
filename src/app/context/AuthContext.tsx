import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, UserRole } from '../types/auth';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  users: User[];
  refreshUsers: () => Promise<void>;
  updateUser: (id: string, user: Partial<User>) => Promise<void>;
}
const AuthContext = createContext<AuthContextType | undefined>(undefined);
const mapUser = (row: any): User => ({ id: row.id, nombre: row.nombre, username: row.username, email: row.email, rol: row.roles?.nombre as UserRole, estado: row.estado, ultimoAcceso: row.ultimo_acceso ? new Date(row.ultimo_acceso).toLocaleString('es-MX') : 'Nunca' });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const refreshUsers = async () => { const { data, error } = await supabase.from('usuarios').select('id,nombre,username,email,estado,ultimo_acceso,roles(nombre)').order('nombre'); if (error) throw error; setUsers((data ?? []).map(mapUser)); };
  const loadProfile = async (authId: string) => { const { data, error } = await supabase.from('usuarios').select('id,nombre,username,email,estado,ultimo_acceso,roles(nombre)').eq('auth_user_id', authId).single(); if (error) throw error; const profile = mapUser(data); if (profile.estado !== 'activo') throw new Error('Tu usuario está inactivo'); setUser(profile); await supabase.rpc('actualizar_mi_ultimo_acceso'); await refreshUsers(); };
  useEffect(() => { supabase.auth.getSession().then(async ({ data }) => { if (data.session) await loadProfile(data.session.user.id); setLoading(false); }).catch(() => setLoading(false)); const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { if (session) void loadProfile(session.user.id); else setUser(null); }); return () => listener.subscription.unsubscribe(); }, []);
  const login = async (email: string, password: string) => { const { data, error } = await supabase.auth.signInWithPassword({ email, password }); if (error || !data.user) return false; await loadProfile(data.user.id); return true; };
  const logout = async () => { await supabase.auth.signOut(); setUser(null); };
  const updateUser = async (id: string, updates: Partial<User>) => { const { error } = await supabase.from('usuarios').update({ nombre:updates.nombre, username:updates.username, email:updates.email, estado:updates.estado }).eq('id', id); if (error) throw error; await refreshUsers(); };
  return <AuthContext.Provider value={{ user, isAuthenticated:!!user, loading, login, logout, users, refreshUsers, updateUser }}>{children}</AuthContext.Provider>;
};
export const useAuth = () => { const context = useContext(AuthContext); if (!context) throw new Error('useAuth must be used within AuthProvider'); return context; };
