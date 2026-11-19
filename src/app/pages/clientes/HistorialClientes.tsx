/**
 * HistorialClientes.tsx — Historial de clientes / CRM ligero (ruta /clientes/historial).
 *
 * Por cliente: cuántas órdenes, cuánto ha comprado, su última compra, cada cuánto
 * compra y el seguimiento (último y próximo contacto). Filtros rápidos:
 *  - Para recontactar: inactivos (N días o más sin comprar) o que "ya les toca" según
 *    su frecuencia de compra.
 *  - Seguimiento de hoy: con un próximo contacto programado para hoy o antes.
 * Desde aquí se abre el historial completo del cliente (qué compra, tallas, repetir un
 * pedido) y se le escribe por WhatsApp o correo.
 *
 * El vendedor ve sus clientes y sus propias órdenes; los admins, todo (sql/historial_clientes.sql).
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { CalendarClock, Download, MessageCircle, NotebookPen, Search, UserRoundX, Users } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useBusquedaUrl } from "../../hooks/useBusquedaUrl";
import StatCard from "../../components/StatCard";
import ContactarClienteDialog from "../../components/ContactarClienteDialog";
import RegistrarContactoDialog from "../../components/clientes/RegistrarContactoDialog";
import { Button } from "../../components/ui/button";
import {
  RESULTADO_CONTACTO,
  SITUACION_INFO,
  cargarResumenClientes,
  plantillasRecontacto,
  seguimientoVencido,
  situacionCliente,
  proximaCompra,
  recompraCercana,
  type CanalContacto,
  type ResumenCliente,
} from "../../lib/clientesCrm";
import { formatFecha, hoyISO } from "../../lib/fechas";
import { formatMonto } from "../../lib/pagos";
import { descargarArchivo, escribirCsv } from "../../lib/facturacion";
import { hasPermission } from "../../utils/permissions";

type Filtro = "todos" | "recontactar" | "seguimiento" | "sin_compras";

const FILTROS: { clave: Filtro; texto: string }[] = [
  { clave: "todos", texto: "Todos" },
  { clave: "recontactar", texto: "Para recontactar" },
  { clave: "seguimiento", texto: "Seguimiento de hoy" },
  { clave: "sin_compras", texto: "Sin compras" },
];

const UMBRALES = [60, 90, 180, 365];

export default function HistorialClientes() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [filas, setFilas] = useState<ResumenCliente[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useBusquedaUrl();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [diasInactivo, setDiasInactivo] = useState(90);
  const [contactar, setContactar] = useState<ResumenCliente | null>(null);
  const [registrar, setRegistrar] = useState<{ cliente: ResumenCliente; canal?: CanalContacto } | null>(null);

  const puedeRegistrar = !!user && hasPermission(user.rol, "/clientes/historial", "canCreate");

  const cargar = async () => {
    setCargando(true);
    try {
      setFilas(await cargarResumenClientes());
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? "Error desconocido");
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargar();
  }, []);

  const conSituacion = useMemo(
    () => filas.map((r) => ({ r, situacion: situacionCliente(r, diasInactivo) })),
    [filas, diasInactivo]
  );

  const conteo = {
    conCompras: conSituacion.filter((x) => x.r.ordenes > 0).length,
    recontactar: conSituacion.filter((x) => x.situacion === "inactivo" || x.situacion === "atrasado").length,
    seguimiento: filas.filter(seguimientoVencido).length,
  };

  const termino = busqueda.trim().toLowerCase();
  const visibles = conSituacion
    .filter(({ r, situacion }) => {
      if (filtro === "recontactar" && situacion !== "inactivo" && situacion !== "atrasado") return false;
      if (filtro === "seguimiento" && !seguimientoVencido(r)) return false;
      if (filtro === "sin_compras" && r.ordenes > 0) return false;
      if (!termino) return true;
      return [r.razonSocial, r.nombreComercial, r.telefono, r.email, r.vendedor]
        .some((v) => v?.toLowerCase().includes(termino));
    })
    // En "para recontactar", primero los que más tiempo llevan sin comprar.
    .sort((a, b) =>
      filtro === "recontactar"
        ? (b.r.diasSinComprar ?? 0) - (a.r.diasSinComprar ?? 0)
        : filtro === "seguimiento"
        ? (a.r.proximoContacto ?? "").localeCompare(b.r.proximoContacto ?? "")
        : 0
    );

  const exportar = () => {
    const csv = escribirCsv(
      ["Cliente", "Teléfono", "Correo", "Órdenes", "Piezas", "Comprado", "Última compra", "Días sin comprar", "Frecuencia (días)", "Próxima compra estimada", "Situación", "Vendedor", "Próximo contacto"],
      visibles.map(({ r, situacion }) => [
        r.razonSocial,
        r.telefono ?? "",
        r.email ?? "",
        r.ordenes,
        r.piezas,
        r.comprado,
        r.ultimaCompra ?? "",
        r.diasSinComprar ?? "",
        r.frecuenciaDias ?? "",
        proximaCompra(r) ?? "",
        SITUACION_INFO[situacion].texto,
        r.vendedor ?? "",
        r.proximoContacto ?? "",
      ])
    );
    descargarArchivo(`clientes-${hoyISO()}.csv`, csv);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>Historial de clientes</h1>
          <p className="text-muted-foreground mt-1">
            Qué ha comprado cada cliente, cuándo fue su última compra y a quién toca volver a buscar
          </p>
        </div>
        <Button variant="outline" onClick={exportar} disabled={visibles.length === 0}>
          <Download className="w-4 h-4" />
          Exportar CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Clientes con compras" value={conteo.conCompras} icon={Users} />
        <StatCard
          title={`Para recontactar (${diasInactivo}+ días o ya les toca)`}
          value={conteo.recontactar}
          icon={UserRoundX}
          color={conteo.recontactar > 0 ? "warning" : "primary"}
        />
        <StatCard
          title="Seguimientos para hoy"
          value={conteo.seguimiento}
          icon={CalendarClock}
          color={conteo.seguimiento > 0 ? "danger" : "primary"}
        />
      </div>

      <div className="flex flex-col lg:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar cliente, teléfono, correo o vendedor…"
            aria-label="Buscar clientes"
            className="w-full pl-10 pr-4 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
        </div>
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Filtrar clientes">
          {FILTROS.map((f) => (
            <button
              key={f.clave}
              type="button"
              role="tab"
              aria-selected={filtro === f.clave}
              onClick={() => setFiltro(f.clave)}
              className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                filtro === f.clave ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-secondary/70"
              }`}
            >
              {f.texto}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          Inactivo desde
          <select
            value={diasInactivo}
            onChange={(e) => setDiasInactivo(Number(e.target.value))}
            className="px-3 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none"
          >
            {UMBRALES.map((d) => (
              <option key={d} value={d}>
                {d} días
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <div className="rounded-lg border border-status-pending p-6 text-sm">
          <p className="font-medium">No se pudo cargar el historial.</p>
          <p className="text-muted-foreground mt-1">{error}. ¿Ya se aplicó sql/historial_clientes.sql?</p>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-secondary text-left text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3 text-right">Compras</th>
                <th className="px-4 py-3">Última compra</th>
                <th className="px-4 py-3">Compra cada</th>
                <th className="px-4 py-3">Seguimiento</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {cargando && filas.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    Cargando clientes…
                  </td>
                </tr>
              )}
              {!cargando && visibles.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    Ningún cliente coincide con el filtro.
                  </td>
                </tr>
              )}
              {visibles.map(({ r, situacion }) => (
                <tr key={r.clienteId} className="hover:bg-secondary/40">
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => navigate(`/clientes/historial/${r.clienteId}`)}
                      className="font-medium text-left hover:text-primary"
                    >
                      {r.razonSocial}
                    </button>
                    <div className="flex flex-wrap items-center gap-2 mt-1">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${SITUACION_INFO[situacion].clase}`}>
                        {SITUACION_INFO[situacion].texto}
                      </span>
                      {r.telefono && <span className="text-xs text-muted-foreground">{r.telefono}</span>}
                      {r.vendedor && user?.rol !== "vendedor" && (
                        <span className="text-xs text-muted-foreground">· {r.vendedor}</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <p className="font-medium">{r.ordenes > 0 ? formatMonto(r.comprado) : "—"}</p>
                    <p className="text-xs text-muted-foreground">
                      {r.ordenes} orden(es) · {r.piezas} pza(s)
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    {r.ultimaCompra ? (
                      <>
                        <p>{formatFecha(r.ultimaCompra)}</p>
                        <p className={`text-xs ${situacion === "inactivo" ? "text-status-pending-text" : "text-muted-foreground"}`}>
                          hace {r.diasSinComprar} día(s)
                        </p>
                      </>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.frecuenciaDias ? `${r.frecuenciaDias} días` : "—"}
                    {(() => {
                      // Próxima compra estimada (los vendedores reciben un aviso 14 días antes).
                      const proxima = proximaCompra(r);
                      if (!proxima) return null;
                      return (
                        <p className={`text-xs ${recompraCercana(proxima) ? "text-status-in-progress-text font-medium" : ""}`}>
                          Próxima ≈ {formatFecha(proxima, { day: "numeric", month: "short" })}
                        </p>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    {r.ultimoContacto ? (
                      <p className="text-xs">
                        {formatFecha(r.ultimoContacto.slice(0, 10))}
                        {r.ultimoResultado && (
                          <span className={`ml-1 rounded-full px-2 py-0.5 ${RESULTADO_CONTACTO[r.ultimoResultado].clase}`}>
                            {RESULTADO_CONTACTO[r.ultimoResultado].texto}
                          </span>
                        )}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground">Sin seguimiento</p>
                    )}
                    {r.proximoContacto && (
                      <p className={`text-xs mt-1 ${seguimientoVencido(r) ? "text-status-pending-text font-medium" : "text-muted-foreground"}`}>
                        Próximo: {formatFecha(r.proximoContacto)}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="icon"
                        variant="ghost"
                        title="Escribir al cliente"
                        aria-label={`Escribir a ${r.razonSocial}`}
                        onClick={() => setContactar(r)}
                      >
                        <MessageCircle className="w-4 h-4" />
                      </Button>
                      {puedeRegistrar && (
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Registrar seguimiento"
                          aria-label={`Registrar seguimiento de ${r.razonSocial}`}
                          onClick={() => setRegistrar({ cliente: r })}
                        >
                          <NotebookPen className="w-4 h-4" />
                        </Button>
                      )}
                      <Button size="sm" variant="outline" onClick={() => navigate(`/clientes/historial/${r.clienteId}`)}>
                        Historial
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {contactar && (
        <ContactarClienteDialog
          open={!!contactar}
          onClose={() => setContactar(null)}
          cliente={contactar.razonSocial}
          telefono={contactar.telefono}
          email={contactar.email}
          plantillas={plantillasRecontacto(contactar, user?.nombre ?? "")}
          folio={contactar.razonSocial}
          onEnviado={(_tipo, canal) => {
            const c = contactar;
            setContactar(null);
            // Al escribirle, se propone anotar el seguimiento.
            if (puedeRegistrar && c) setRegistrar({ cliente: c, canal });
          }}
        />
      )}

      <RegistrarContactoDialog
        cliente={registrar ? { id: registrar.cliente.clienteId, nombre: registrar.cliente.razonSocial } : null}
        canalInicial={registrar?.canal}
        onClose={() => setRegistrar(null)}
        onGuardado={() => {
          setRegistrar(null);
          void cargar();
        }}
      />
    </div>
  );
}
