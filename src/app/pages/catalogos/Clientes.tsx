/**
 * Clientes.tsx — Catálogo de clientes con datos fiscales (ruta /catalogos/clientes).
 * Equivale a Catálogos ▸ Clientes de CONTPAQi Vende.
 *
 * Indica qué clientes tienen completos los datos para facturar (RFC, régimen, CP y uso
 * de CFDI). Crean y editan: admin primario, admin secundario y vendedores (igual que las
 * políticas de la tabla `clientes`).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, CircleAlert, Download, Plus, Search, Users } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import { hasPermission } from "../../utils/permissions";
import { useBusquedaUrl } from "../../hooks/useBusquedaUrl";
import { Card, CardContent } from "../../components/Card";
import StatCard from "../../components/StatCard";
import { Button } from "../../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import ClienteDialog, { type ClienteCatalogo } from "../../components/catalogos/ClienteDialog";
import { REGIMENES_FISCALES, RFC_REGEX, describirSat } from "../../lib/sat";
import { descargarArchivo, escribirCsv } from "../../lib/facturacion";

const COLUMNAS =
  "id,razon_social,nombre_comercial,rfc,regimen_fiscal,codigo_postal,uso_cfdi,email,email_cc,telefono," +
  "contacto,direccion,metodo_pago_cfdi,forma_pago_cfdi,dias_credito,limite_credito,notas";

const fiscalCompleto = (c: ClienteCatalogo) =>
  !!c.rfc && RFC_REGEX.test(c.rfc) && !!c.regimen_fiscal && !!c.codigo_postal && !!c.uso_cfdi;

type Filtro = "todos" | "completos" | "incompletos";

export default function Clientes() {
  const { user } = useAuth();
  const puedeEditar = !!user && hasPermission(user.rol, "/catalogos/clientes", "canEdit");
  const [clientes, setClientes] = useState<ClienteCatalogo[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useBusquedaUrl();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [abierto, setAbierto] = useState<{ cliente: ClienteCatalogo | null } | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    const { data, error } = await supabase.from("clientes").select(COLUMNAS).order("razon_social").range(0, 9999);
    setCargando(false);
    if (error) {
      toast.error(`No se pudieron cargar los clientes: ${error.message}. ¿Ya se aplicó sql/facturacion.sql?`);
      return;
    }
    setClientes((data ?? []) as unknown as ClienteCatalogo[]);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const filtrados = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return clientes.filter((c) => {
      if (filtro === "completos" && !fiscalCompleto(c)) return false;
      if (filtro === "incompletos" && fiscalCompleto(c)) return false;
      if (!q) return true;
      return [c.razon_social, c.nombre_comercial, c.rfc, c.email, c.contacto, c.telefono]
        .some((v) => v?.toLowerCase().includes(q));
    });
  }, [clientes, busqueda, filtro]);

  const completos = clientes.filter(fiscalCompleto).length;

  const descargar = () =>
    descargarArchivo(
      "Clientes.csv",
      escribirCsv(
        ["Nombre comercial", "RFC", "Correo", "Régimen fiscal", "Código postal", "Razón social", "Teléfono",
         "Días de crédito", "Límite de crédito", "Método de pago", "Forma de pago", "Uso de CFDI"],
        filtrados.map((c) => [c.nombre_comercial, c.rfc, c.email, c.regimen_fiscal, c.codigo_postal, c.razon_social,
          c.telefono, c.dias_credito, c.limite_credito, c.metodo_pago_cfdi, c.forma_pago_cfdi, c.uso_cfdi])
      )
    );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Mis Clientes</h1>
          <p className="text-muted-foreground mt-1">Catálogo de clientes y sus datos para facturar</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {puedeEditar && (
            <Button onClick={() => setAbierto({ cliente: null })}>
              <Plus /> Nuevo cliente
            </Button>
          )}
          <Button variant="outline" onClick={descargar} disabled={filtrados.length === 0}>
            <Download /> Descarga
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard title="Clientes" value={clientes.length} icon={Users} />
        <StatCard title="Listos para facturar" value={completos} icon={CheckCircle2} color="success" />
        <StatCard title="Sin datos fiscales completos" value={clientes.length - completos} icon={CircleAlert} color="warning" />
      </div>

      <Card>
        <CardContent className="p-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="search"
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por razón social, nombre comercial, RFC, correo…"
                className="w-full h-9 pl-9 pr-3 bg-secondary rounded-md border border-transparent text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <select
              value={filtro}
              onChange={(e) => setFiltro(e.target.value as Filtro)}
              className="h-9 rounded-md border border-input bg-input-background px-3 text-sm"
              aria-label="Filtrar por datos fiscales"
            >
              <option value="todos">Todos</option>
              <option value="completos">Listos para facturar</option>
              <option value="incompletos">Datos fiscales incompletos</option>
            </select>
          </div>

          <p className="text-sm text-muted-foreground">
            {filtrados.length.toLocaleString("es-MX")} de {clientes.length.toLocaleString("es-MX")} clientes
          </p>

          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Razón social</TableHead>
                  <TableHead>RFC</TableHead>
                  <TableHead>Régimen fiscal</TableHead>
                  <TableHead>CP</TableHead>
                  <TableHead>Uso CFDI</TableHead>
                  <TableHead>Correo</TableHead>
                  <TableHead>Pago</TableHead>
                  <TableHead>Datos fiscales</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {cargando && clientes.length === 0 &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell colSpan={8}>
                        <div className="h-5 rounded bg-secondary animate-pulse" />
                      </TableCell>
                    </TableRow>
                  ))}
                {!cargando && filtrados.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="py-12 text-center text-muted-foreground">
                      Ningún cliente coincide con la búsqueda.
                    </TableCell>
                  </TableRow>
                )}
                {filtrados.slice(0, 300).map((c) => (
                  <TableRow key={c.id} onClick={() => setAbierto({ cliente: c })} className="cursor-pointer">
                    <TableCell className="max-w-[260px]">
                      <span className="block truncate font-medium" title={c.razon_social}>{c.razon_social}</span>
                      {c.nombre_comercial && <span className="block truncate text-xs text-muted-foreground">{c.nombre_comercial}</span>}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{c.rfc ?? "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm" title={describirSat(REGIMENES_FISCALES, c.regimen_fiscal)}>
                      {describirSat(REGIMENES_FISCALES, c.regimen_fiscal) || "—"}
                    </TableCell>
                    <TableCell>{c.codigo_postal ?? "—"}</TableCell>
                    <TableCell>{c.uso_cfdi ?? "—"}</TableCell>
                    <TableCell className="max-w-[200px] truncate text-sm">{c.email ?? "—"}</TableCell>
                    <TableCell className="text-sm whitespace-nowrap">
                      {c.metodo_pago_cfdi ?? "—"}
                      {c.dias_credito ? ` · ${c.dias_credito} días` : ""}
                    </TableCell>
                    <TableCell>
                      {fiscalCompleto(c) ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-status-completed-bg text-status-completed-text">Completos</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-status-in-progress-bg text-status-in-progress-text">Incompletos</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {filtrados.length > 300 && (
            <p className="text-sm text-muted-foreground text-center">Se muestran los primeros 300; afina la búsqueda para ver más.</p>
          )}
        </CardContent>
      </Card>

      <ClienteDialog
        open={!!abierto}
        cliente={abierto?.cliente ?? null}
        soloLectura={!puedeEditar}
        onClose={() => setAbierto(null)}
        onGuardado={cargar}
      />
    </div>
  );
}
