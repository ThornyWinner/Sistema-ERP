/**
 * ListasTallas.tsx — Listas de tallas que llena el cliente (ruta /tallas).
 *
 * El vendedor crea una lista por pedido (cliente, prendas, colores y tallas) y manda el
 * enlace al contacto del cliente; cada empleado captura su talla desde el celular. Aquí
 * se ven las listas con cuántas personas ya respondieron; al abrir una se ve el
 * concentrado y se crea la orden (ListaTallasDetalle). Vendedor: las suyas; admins: todas.
 */
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { ClipboardList, Copy, Plus, Ruler, Users } from "lucide-react";
import { Card, CardContent } from "../../components/Card";
import PermissionButton from "../../components/PermissionButton";
import ListaTallasDialog from "../../components/tallas/ListaTallasDialog";
import { useAuth } from "../../context/AuthContext";
import { useBusquedaUrl } from "../../hooks/useBusquedaUrl";
import { copiarTexto } from "../../lib/contacto";
import { formatFecha } from "../../lib/fechas";
import { cargarListas, crearLista, enlaceTallas, type ListaTallas } from "../../lib/listasTallas";

export default function ListasTallas() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [listas, setListas] = useState<ListaTallas[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [busqueda, setBusqueda] = useBusquedaUrl();

  const cargar = useCallback(async () => {
    try {
      setListas(await cargarListas());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const q = busqueda.trim().toLowerCase();
  const visibles = listas.filter(
    (l) => !q || l.titulo.toLowerCase().includes(q) || l.clienteNombre.toLowerCase().includes(q)
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1>Tallas del cliente</h1>
          <p className="text-muted-foreground mt-1">
            Manda un enlace y cada persona del cliente captura su talla; la orden se arma sola
          </p>
        </div>
        <PermissionButton
          requiredPermission="canCreate"
          onClick={() => setCreando(true)}
          className="flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="w-5 h-5" />
          Nueva lista
        </PermissionButton>
      </div>

      <input
        type="search"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Buscar por cliente o título…"
        className="w-full max-w-md px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
        aria-label="Buscar listas"
      />

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">
          No se pudieron cargar las listas: {error}. ¿Ya se aplicó sql/listas_tallas.sql?
        </p>
      )}

      {cargando ? (
        <p className="text-sm text-muted-foreground">Cargando…</p>
      ) : visibles.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center text-sm text-muted-foreground space-y-2">
            <Ruler className="w-8 h-8 mx-auto opacity-50" />
            <p>{listas.length ? "Ninguna lista coincide con la búsqueda." : "Aún no hay listas de tallas."}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibles.map((l) => (
            <Card key={l.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/tallas/${l.id}`} className="min-w-0 group">
                    <h3 className="font-semibold text-foreground truncate group-hover:text-primary">{l.titulo}</h3>
                    <p className="text-sm text-muted-foreground truncate">{l.clienteNombre}</p>
                  </Link>
                  <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium flex-shrink-0 ${
                      l.ordenId
                        ? "bg-secondary text-foreground"
                        : l.estado === "abierta"
                        ? "bg-status-completed-bg text-status-completed-text"
                        : "bg-secondary text-muted-foreground"
                    }`}
                  >
                    {l.ordenId ? "Con orden" : l.estado === "abierta" ? "Abierta" : "Cerrada"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <Users className="w-4 h-4" /> {l.respuestas} persona{l.respuestas === 1 ? "" : "s"}
                  </span>
                  <span>{l.productos.length} prenda{l.productos.length === 1 ? "" : "s"}</span>
                  {l.cierra && <span>Límite {formatFecha(l.cierra)}</span>}
                </div>
                {user?.rol !== "vendedor" && l.vendedor && <p className="text-xs text-muted-foreground">Vendedor: {l.vendedor}</p>}
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/tallas/${l.id}`)}
                    className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm"
                  >
                    <ClipboardList className="w-4 h-4" /> Ver tallas
                  </button>
                  {l.estado === "abierta" && (
                    <button
                      onClick={() => copiarTexto(enlaceTallas(l.token), "Enlace")}
                      className="flex items-center gap-1.5 px-3 py-2 bg-secondary rounded-lg hover:bg-secondary/80 text-sm"
                    >
                      <Copy className="w-4 h-4" /> Enlace
                    </button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ListaTallasDialog
        open={creando}
        onClose={() => setCreando(false)}
        onGuardar={async (l) => {
          if (!user) return false;
          try {
            const id = await crearLista(l, user.id);
            toast.success("Lista creada", { description: "Copia el enlace y mándaselo al cliente." });
            navigate(`/tallas/${id}`);
            return true;
          } catch (e) {
            toast.error("No se pudo crear la lista", { description: (e as Error).message });
            return false;
          }
        }}
      />
    </div>
  );
}
