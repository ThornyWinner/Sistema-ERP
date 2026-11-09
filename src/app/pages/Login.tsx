/**
 * Login.tsx — Pantalla de inicio de sesión (ruta pública /login).
 *
 * Pide correo y contraseña y los valida con Supabase Auth (a través de useAuth().login).
 * - Credenciales incorrectas → mensaje "Usuario o contraseña incorrectos".
 * - Cuenta sin perfil o inactiva → se muestra el mensaje de error que lanza AuthContext.
 * - Éxito → redirige a la página que el usuario intentaba abrir (o al Dashboard).
 * Si ya hay sesión iniciada, redirige directamente sin mostrar el formulario.
 * Si la sesión se cerró por inactividad, muestra el aviso "Tu sesión expiró"; al
 * volver a entrar regresa a la página en la que estaba.
 */
import React, { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Lock, User, AlertCircle, Clock } from 'lucide-react';
import ThemeToggle from '../components/ThemeToggle';

export default function Login() {
  // Aunque se llama "username", contiene el correo electrónico (Supabase Auth usa email).
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  // Mensaje de error a mostrar sobre el formulario.
  const [error, setError] = useState('');
  // true mientras se espera la respuesta del login (deshabilita el botón).
  const [loading, setLoading] = useState(false);
  // authLoading: AuthContext todavía está restaurando una posible sesión previa.
  const { login, isAuthenticated, loading: authLoading, motivoCierre } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  // Ruta de origen guardada por ProtectedRoute (con sus parámetros, p. ej. el ?sede= del
  // QR del checador); si no existe, se vuelve a "/".
  const origen = (location.state as { from?: { pathname?: string; search?: string } } | null)?.from;
  const from = origen?.pathname ? `${origen.pathname}${origen.search ?? ''}` : '/';

  // Envía las credenciales y gestiona los tres resultados posibles (éxito, fallo, error).
  const handleSubmit = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const success = await login(username, password);
      if (success) {
        navigate(from, { replace: true });
      } else {
        setError('Usuario o contraseña incorrectos');
      }
    } catch (err) {
      // Errores lanzados por loadProfile (sin perfil, usuario inactivo) o de red.
      setError(err instanceof Error ? err.message : 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  // Usuario ya autenticado: no tiene sentido mostrar el login.
  if (!authLoading && isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-background px-4">
      {/* Alternar modo claro / oscuro también antes de iniciar sesión */}
      <ThemeToggle className="absolute top-4 right-4" />
      <div className="w-full max-w-md">
        {/* Logotipo y nombre del sistema (versión con letras blancas en modo oscuro) */}
        <div className="text-center mb-8">
          <img
            src="/logo-uis.png"
            alt="Uniformes Industriales de Saltillo"
            className="mx-auto w-full max-w-[280px] h-auto mb-4 dark:hidden"
          />
          <img
            src="/logo-uis-dark.png"
            alt="Uniformes Industriales de Saltillo"
            className="mx-auto w-full max-w-[280px] h-auto mb-4 hidden dark:block"
          />
          <h1 className="text-3xl mb-2">Sistema ERP</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Iniciar Sesión</CardTitle>
            <CardDescription>
              Ingresa tus credenciales para acceder al sistema
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Aviso de sesión expirada por inactividad (se oculta si hay un error) */}
              {!error && motivoCierre === 'inactividad' && (
                <div
                  role="status"
                  className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 dark:text-amber-300 dark:bg-amber-500/10 dark:border-amber-500/30 px-3 py-2 rounded-lg"
                >
                  <Clock className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <span>
                    <strong className="font-medium">Tu sesión expiró</strong> por inactividad.
                    Inicia sesión de nuevo para continuar.
                  </span>
                </div>
              )}

              {/* Alerta de error (solo si hay mensaje) */}
              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/10 px-3 py-2 rounded-lg">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/* Campo de correo con icono dentro del input */}
              <div className="space-y-2">
                    <Label htmlFor="username">Correo electrónico</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="username"
                    type="email"
                    placeholder="Ingresa tu correo electrónico"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    className="pl-10"
                    required
                    autoComplete="username"
                  />
                </div>
              </div>

              {/* Campo de contraseña */}
              <div className="space-y-2">
                <Label htmlFor="password">Contraseña</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Ingresa tu contraseña"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10"
                    required
                    autoComplete="current-password"
                  />
                </div>
              </div>

              <Button 
                type="submit" 
                className="w-full bg-[#059669] hover:bg-[#047857]"
                disabled={loading}
              >
                {loading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
