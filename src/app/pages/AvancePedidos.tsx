/**
 * AvancePedidos.tsx — En qué taller va cada orden (ruta /avance).
 *
 * Pensada para el vendedor: ve de un vistazo todas sus órdenes abiertas acomodadas por
 * la etapa en que van (sin iniciar → Diseño → … → Bordado → lista para entregar), desde
 * cuándo están ahí y qué producto las detiene, para responderle al cliente sin preguntar
 * al taller. Desde cada tarjeta puede mandarle el avance al cliente por WhatsApp o
 * correo y, cuando ya no hay producción pendiente, marcar la orden como entregada.
 *
 * El vendedor ve solo sus órdenes (RLS); los administradores ven todas y pueden filtrar
 * por vendedor. La etapa se calcula con lib/avanceProduccion.ts (la misma regla con la
 * que la BD actualiza el estado de la orden).
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Clock, Factory, MessageCircle, PackageCheck, Search, User } from "lucide-react";
import { useErpData } from "../context/ErpDataContext";
import { useAuth } from "../context/AuthContext";
import { useBusquedaUrl } from "../hooks/useBusquedaUrl";
import StatCard from "../components/StatCard";
import ContactarClienteDialog from "../components/ContactarClienteDialog";
import WorkflowStepper from "../components/WorkflowStepper";
import EntregarOrdenDialog from "../components/EntregarOrdenDialog";
import { Button } from "../components/ui/button";
import {
  ETAPAS_TABLERO,
  avanceOrden,
  claseEtapa,
  haceCuanto,
  textoEtapa,
  textoEtapaProducto,
  type AvanceOrden,
} from "../lib/avanceProduccion";
import { claseDiasRestantes, formatFecha, textoDiasRestantes } from "../lib/fechas";
import { imprimirNotaOrden, plantillasMensaje } from "../lib/notaOrden";
import type { Orden } from "../data/mockData";
import { enlaceSeguimiento, obtenerTokenSeguimiento } from "../lib/seguimientoPublico";

export default function AvancePedidos() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { ordenes, loading, marcarEntregada } = useErpData();
  const [busqueda, setBusqueda] = useBusquedaUrl();
  const [vendedor, setVendedor] = useState("todos");
  const [soloAtrasadas, setSoloAtrasadas] = useState(false);
  const [contactar, setContactar] = useState<Orden | null>(null);
  // Enlace público de seguimiento de la orden a contactar (va en el mensaje de avance).
  const [enlace, setEnlace] = useState<string | undefined>();
  const abrirContacto = async (o: Orden) => {
    let url: string | undefined;
    try {
      const t = await obtenerTokenSeguimiento(o.id);
      url = t ? enlaceSeguimiento(t) : undefined;
    } catch {
      url = undefined;
    }
    setEnlace(url);
    setContactar(o);
  };
  const [entregar, setEntregar] = useState<AvanceOrden | null>(null);

  const esAdmin = user?.rol === "admin_primario" || user?.rol === "admin_secundario";
  const puedeModificar = (o: Orden) =>
    user?.rol === "admin_primario" ||
    ((user?.rol === "admin_secundario" || user?.rol === "vendedor") && o.vendedorId === user.id);

  // Órdenes abiertas (ni entregadas ni canceladas) con su avance.
  const abiertas = useMemo(
    () =>
      ordenes
        .filter((o) => o.estadoNombre !== "Entregada" && o.estadoNombre !== "Cancelada")
        .filter((o) => user?.rol !== "vendedor" || o.vendedorId === user.id)
        .map(avanceOrden),
    [ordenes, user]
  );

  const vendedores = useMemo(
    () => [...new Map(abiertas.map((a) => [a.orden.vendedorId, a.orden.vendedor])).entries()].sort((a, b) => a[1].localeCompare(b[1])),
    [abiertas]
  );

  const termino = busqueda.trim().toLowerCase();
  const visibles = abiertas.filter(
    (a) =>
      (vendedor === "todos" || a.orden.vendedorId === vendedor) &&
      (!soloAtrasadas || a.atrasada) &&
      (!termino ||
        a.orden.numero.toLowerCase().includes(termino) ||
        a.orden.cliente.toLowerCase().includes(termino) ||
        a.orden.productos.some((p) => p.nombre.toLowerCase().includes(termino)))
  );

  // Por columna, primero lo que se entrega antes.
  const porEtapa = (clave: string) =>
    visibles
      .filter((a) => a.etapa === clave)
      .sort((a, b) => (a.diasEntrega ?? 9999) - (b.diasEntrega ?? 9999));

  const conteo = {
    sinIniciar: visibles.filter((a) => a.etapa === "sin_iniciar").length,
    enTaller: visibles.filter((a) => a.etapa !== "sin_iniciar" && a.etapa !== "lista").length,
    listas: visibles.filter((a) => a.etapa === "lista").length,
    atrasadas: visibles.filter((a) => a.atrasada).length,
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1>Avance de pedidos</h1>
        <p className="text-muted-foreground mt-1">
          En qué taller va cada orden y desde cuándo, para responderle al cliente sin preguntar al taller
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Sin iniciar" value={conteo.sinIniciar} icon={Clock} color="danger" />
        <StatCard title="En taller" value={conteo.enTaller} icon={Factory} color="warning" />
        <StatCard title="Listas para entregar" value={conteo.listas} icon={PackageCheck} color="success" />
        <StatCard
          title="Con entrega vencida"
          value={conteo.atrasadas}
          icon={AlertTriangle}
          color={conteo.atrasadas > 0 ? "danger" : "primary"}
        />
      </div>

      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por folio, cliente o producto…"
            aria-label="Buscar órdenes"
            className="w-full pl-10 pr-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        {esAdmin && (
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-muted-foreground" />
            <select
              value={vendedor}
              onChange={(e) => setVendedor(e.target.value)}
              aria-label="Filtrar por vendedor"
              className="px-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none"
            >
              <option value="todos">Todos los vendedores</option>
              {vendedores.map(([id, nombre]) => (
                <option key={id} value={id}>
                  {nombre}
                </option>
              ))}
            </select>
          </div>
        )}
        <label className="flex items-center gap-2 text-sm px-3 py-2 bg-secondary rounded-lg cursor-pointer">
          <input type="checkbox" checked={soloAtrasadas} onChange={(e) => setSoloAtrasadas(e.target.checked)} />
          Solo entregas vencidas
        </label>
      </div>

      {loading && abiertas.length === 0 ? (
        <p className="text-muted-foreground">Cargando órdenes…</p>
      ) : visibles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center text-muted-foreground">
          {abiertas.length === 0 ? "No hay órdenes abiertas." : "Ninguna orden coincide con los filtros."}
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="flex gap-4 min-w-max">
            {ETAPAS_TABLERO.map((col) => {
              const lista = porEtapa(col.clave);
              return (
                <section key={col.clave} className="w-72 shrink-0" aria-label={col.titulo}>
                  <header className="flex items-center justify-between mb-3 px-1">
                    <h2 className="text-sm font-semibold">{col.titulo}</h2>
                    <span className="text-xs rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">{lista.length}</span>
                  </header>
                  <div className="space-y-3">
                    {lista.length === 0 && (
                      <p className="text-xs text-muted-foreground px-1 py-6 text-center border border-dashed border-border rounded-lg">
                        Ninguna
                      </p>
                    )}
                    {lista.map((a) => (
                      <TarjetaAvance
                        key={a.orden.id}
                        a={a}
                        mostrarVendedor={esAdmin}
                        onAbrir={() => navigate(`/ordenes/${a.orden.id}`)}
                        onContactar={() => void abrirContacto(a.orden)}
                        onEntregar={a.etapa === "lista" && puedeModificar(a.orden) ? () => setEntregar(a) : undefined}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}

      {contactar && (
        <ContactarClienteDialog
          open={!!contactar}
          onClose={() => setContactar(null)}
          cliente={contactar.cliente}
          telefono={contactar.clienteTelefono}
          email={contactar.clienteEmail}
          plantillas={plantillasMensaje(contactar, { enlaceSeguimiento: enlace })}
          folio={`Orden ${contactar.numero}`}
          onGuardarPdf={() => imprimirNotaOrden(contactar)}
          textoPdf="Guardar nota en PDF"
        />
      )}

      <EntregarOrdenDialog
        orden={entregar?.orden ?? null}
        onClose={() => setEntregar(null)}
        onConfirmar={async (comentario) => {
          if (!entregar) return;
          await marcarEntregada(entregar.orden.id, comentario);
          toast.success(`Orden ${entregar.orden.numero} entregada`);
          setEntregar(null);
        }}
      />
    </div>
  );
}

function TarjetaAvance({
  a,
  mostrarVendedor,
  onAbrir,
  onContactar,
  onEntregar,
}: {
  a: AvanceOrden;
  mostrarVendedor: boolean;
  onAbrir: () => void;
  onContactar: () => void;
  onEntregar?: () => void;
}) {
  const o = a.orden;
  const piezas = o.productos.reduce((s, p) => s + p.cantidad, 0);
  return (
    <article className={`rounded-lg border bg-card p-3 space-y-3 ${a.atrasada ? "border-status-pending" : "border-border"}`}>
      <button type="button" onClick={onAbrir} className="block w-full text-left space-y-1 group">
        <div className="flex items-start justify-between gap-2">
          <span className="font-medium group-hover:text-primary">{o.numero}</span>
          <span className={`text-xs ${claseDiasRestantes(a.diasEntrega)}`}>
            {a.diasEntrega === null ? "Sin fecha" : textoDiasRestantes(a.diasEntrega)}
          </span>
        </div>
        <p className="text-sm truncate" title={o.cliente}>
          {o.cliente}
        </p>
        <p className="text-xs text-muted-foreground">
          {piezas} pza(s){o.fechaEntrega ? ` · entrega ${formatFecha(o.fechaEntrega)}` : ""}
          {mostrarVendedor ? ` · ${o.vendedor}` : ""}
        </p>
      </button>

      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${claseEtapa(a)}`}>
          {a.etapa === "lista" ? <CheckCircle2 className="w-3 h-3" /> : <Factory className="w-3 h-3" />}
          {textoEtapa(a)}
        </span>
        {a.desde && <span className="text-xs text-muted-foreground">{haceCuanto(a.desde)}</span>}
      </div>

      {!a.sinTalleres && (
        <div className="flex items-center gap-2" aria-label={`Avance ${a.porcentaje} %`}>
          <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
            <div className="h-full bg-primary" style={{ width: `${a.porcentaje}%` }} />
          </div>
          <span className="text-xs text-muted-foreground w-9 text-right">{a.porcentaje}%</span>
        </div>
      )}

      {/* Producto por producto (solo si hay varios o si alguno va en otra etapa). */}
      {a.productos.length > 1 && (
        <ul className="space-y-1">
          {a.productos.map((p) => (
            <li key={p.producto.id} className="flex items-start justify-between gap-2 text-xs">
              <span className="min-w-0 truncate" title={p.producto.nombre}>
                {p.producto.cantidad} × {p.producto.nombre}
                {p.producto.talla ? ` (${p.producto.talla})` : ""}
              </span>
              <span className="shrink-0 text-muted-foreground">{textoEtapaProducto(p)}</span>
            </li>
          ))}
        </ul>
      )}
      {a.productos.length === 1 && a.productos[0].total > 0 && (
        <div className="flex justify-center">
          <WorkflowStepper talleres={a.productos[0].producto.talleres} progreso={a.productos[0].producto.progreso} size="sm" />
        </div>
      )}

      <div className="flex gap-2">
        <Button size="sm" variant="outline" className="flex-1" onClick={onContactar}>
          <MessageCircle className="w-4 h-4" />
          Avisar
        </Button>
        {onEntregar && (
          <Button size="sm" className="flex-1" onClick={onEntregar}>
            <PackageCheck className="w-4 h-4" />
            Entregar
          </Button>
        )}
      </div>
    </article>
  );
}
