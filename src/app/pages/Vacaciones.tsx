/**
 * Vacaciones.tsx — Permisos Vacacionales (ruta /vacaciones). Solo administrador primario.
 *
 * Control de vacaciones del personal conforme a la Ley Federal del Trabajo:
 *  - Indicadores: empleados activos, días pendientes, empleados con vacaciones
 *    atrasadas (más de 6 meses sin otorgarse, Art. 81) y quién está de vacaciones hoy.
 *  - Tabla de empleados con antigüedad, días pendientes, situación y próximo aniversario.
 *  - Detalle del empleado elegido: cada año de servicio (derecho, tomados, pendientes,
 *    plazos) y su historial de vacaciones con la prima pagada.
 *  - Referencia de la tabla de días del Art. 76.
 * Los cálculos están en lib/vacaciones.ts; las tablas y reglas en sql/vacaciones.sql.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CalendarDays, Palmtree, Pencil, Plus, Scale, Shield, Trash2, Users } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { formatFecha } from "../lib/fechas";
import {
  diasPorAntiguedad,
  estadoPeriodoInfo,
  resumenEmpleado,
  type Empleado,
  type EstadoPeriodo,
  type Vacacion,
} from "../lib/vacaciones";
import StatCard from "../components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "../components/Card";
import { Button } from "../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import EmpleadoDialog from "../components/vacaciones/EmpleadoDialog";
import RegistrarVacacionesDialog from "../components/vacaciones/RegistrarVacacionesDialog";

/** Situación más urgente de un empleado, para la columna "Situación". */
const PRIORIDAD: EstadoPeriodo[] = ["atrasado", "vigente", "completo"];

const dinero = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function Vacaciones() {
  const { user, users, refreshUsers } = useAuth();
  const esAdmin = user?.rol === "admin_primario";
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [vacaciones, setVacaciones] = useState<Vacacion[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  // Empleado cuyo detalle se muestra.
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  // Diálogos: empleado en edición ("nuevo" = alta) y empleado al que se registran vacaciones.
  const [dialogoEmpleado, setDialogoEmpleado] = useState<Empleado | "nuevo" | null>(null);
  const [registrarPara, setRegistrarPara] = useState<Empleado | null>(null);

  const cargar = useCallback(async () => {
    const [emp, vac] = await Promise.all([
      supabase.from("empleados").select("*").order("nombre"),
      supabase.from("vacaciones").select("*").order("fecha_inicio", { ascending: false }),
    ]);
    if (emp.error || vac.error) {
      toast.error("No se pudo cargar el control de vacaciones", { description: (emp.error || vac.error)!.message });
    } else {
      // Los campos numeric de PostgreSQL pueden llegar como texto.
      setEmpleados(emp.data.map((e: any) => ({ ...e, salario_diario: Number(e.salario_diario), porcentaje_prima: Number(e.porcentaje_prima) })));
      setVacaciones(vac.data.map((v: any) => ({ ...v, prima_vacacional: Number(v.prima_vacacional) })));
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    if (!esAdmin) return;
    void cargar();
    refreshUsers().catch(() => {});
  }, [esAdmin, cargar]);

  if (!esAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Shield className="w-16 h-16 text-neutral-300 mx-auto mb-4" />
          <h2 className="text-2xl mb-2">Acceso Restringido</h2>
          <p className="text-neutral-500">Solo el administrador primario gestiona los permisos vacacionales</p>
        </div>
      </div>
    );
  }

  const eliminarVacacion = async (v: Vacacion) => {
    if (!confirm(`¿Eliminar las vacaciones del ${formatFecha(v.fecha_inicio)} al ${formatFecha(v.fecha_fin)}?`)) return;
    const { error } = await supabase.from("vacaciones").delete().eq("id", v.id);
    if (error) {
      toast.error("No se pudo eliminar el registro", { description: error.message });
      return;
    }
    toast.success("Registro eliminado");
    void cargar();
  };

  const filas = empleados.map((e) => ({ empleado: e, resumen: resumenEmpleado(e, vacaciones) }));
  const activos = filas.filter((f) => f.empleado.activo);
  const visibles = mostrarInactivos ? filas : activos;
  const conAtraso = activos.filter((f) => f.resumen.atrasados.length > 0);
  const deVacaciones = activos.filter((f) => f.resumen.enVacaciones);
  const seleccionado = filas.find((f) => f.empleado.id === seleccionadoId) ?? null;
  const usuariosOcupados = new Set(empleados.map((e) => e.usuario_id).filter((id): id is string => !!id));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1>Permisos Vacacionales</h1>
          <p className="text-muted-foreground mt-1">Control de vacaciones del personal conforme a la Ley Federal del Trabajo</p>
        </div>
        <Button onClick={() => setDialogoEmpleado("nuevo")}>
          <Plus className="w-4 h-4" />
          Nuevo empleado
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard title="Empleados Activos" value={activos.length} icon={Users} color="primary" footer={`${empleados.length - activos.length} inactivos`} />
        <StatCard
          title="Días Pendientes"
          value={activos.reduce((acc, f) => acc + f.resumen.pendientes, 0)}
          icon={CalendarDays}
          color="warning"
          footer="Por otorgar, sin contar prescritos"
        />
        <StatCard title="Vacaciones Atrasadas" value={conAtraso.length} icon={AlertTriangle} color="danger" footer="Empleados fuera del plazo de 6 meses" />
        <StatCard
          title="De Vacaciones Hoy"
          value={deVacaciones.length}
          icon={Palmtree}
          color="success"
          footer={deVacaciones.map((f) => f.empleado.nombre.split(" ")[0]).join(", ") || "Nadie"}
        />
      </div>

      {/* Avisos de vacaciones fuera del plazo del Art. 81 */}
      {conAtraso.length > 0 && (
        <Card className="border-status-pending">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-status-pending-text">
              <AlertTriangle className="w-5 h-5" />
              Vacaciones atrasadas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              La LFT (Art. 81) obliga a otorgar las vacaciones dentro de los 6 meses siguientes al aniversario.
            </p>
            {conAtraso.flatMap((f) =>
              f.resumen.atrasados.map((p) => (
                <div key={`${f.empleado.id}-${p.anio}`} className="flex flex-wrap items-center justify-between gap-2 p-3 bg-status-pending-bg rounded-lg">
                  <span className="font-medium">{f.empleado.nombre}</span>
                  <span className="text-sm">
                    Año {p.anio}: <strong>{p.pendientes}</strong> días pendientes · plazo venció el {formatFecha(p.limiteOtorgar)} · prescriben el{" "}
                    {formatFecha(p.prescribe)}
                  </span>
                  <Button size="sm" variant="outline" onClick={() => setRegistrarPara(f.empleado)}>
                    Registrar
                  </Button>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}

      {/* Tabla de empleados */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Empleados</CardTitle>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <input type="checkbox" checked={mostrarInactivos} onChange={(e) => setMostrarInactivos(e.target.checked)} className="w-4 h-4" />
            Mostrar inactivos
          </label>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="px-6">Empleado</TableHead>
                <TableHead>Ingreso</TableHead>
                <TableHead>Antigüedad</TableHead>
                <TableHead>Días pendientes</TableHead>
                <TableHead>Situación</TableHead>
                <TableHead>Próximo aniversario</TableHead>
                <TableHead className="text-right px-6">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibles.map(({ empleado: e, resumen: r }) => {
                const estados = new Set(r.periodos.map((p) => p.estado));
                const situacion = PRIORIDAD.find((s) => estados.has(s));
                return (
                  <TableRow
                    key={e.id}
                    onClick={() => setSeleccionadoId(e.id)}
                    className={`cursor-pointer ${seleccionadoId === e.id ? "bg-secondary" : ""} ${e.activo ? "" : "opacity-60"}`}
                  >
                    <TableCell className="px-6">
                      <p className="font-medium">{e.nombre}</p>
                      <p className="text-xs text-muted-foreground">
                        {e.puesto || "Sin puesto"}
                        {!e.activo && " · Inactivo"}
                        {r.enVacaciones && " · De vacaciones"}
                      </p>
                    </TableCell>
                    <TableCell>{formatFecha(e.fecha_ingreso)}</TableCell>
                    <TableCell>{r.anios === 0 ? "Menos de 1 año" : `${r.anios} ${r.anios === 1 ? "año" : "años"}`}</TableCell>
                    <TableCell className="font-semibold">{r.pendientes}</TableCell>
                    <TableCell>
                      {situacion ? (
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${estadoPeriodoInfo[situacion].clase}`}>
                          {estadoPeriodoInfo[situacion].texto}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Sin derecho aún</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <p className="text-sm">{formatFecha(r.proximoAniversario)}</p>
                      <p className="text-xs text-muted-foreground">Generará {r.diasProximoAnio} días</p>
                    </TableCell>
                    <TableCell className="text-right px-6" onClick={(ev) => ev.stopPropagation()}>
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="outline" onClick={() => setRegistrarPara(e)} disabled={r.pendientes === 0}>
                          <Palmtree className="w-4 h-4" />
                          Vacaciones
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setDialogoEmpleado(e)} title="Editar empleado">
                          <Pencil className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {!cargando && visibles.length === 0 && (
            <p className="p-8 text-center text-sm text-muted-foreground">
              Aún no hay empleados registrados. Usa "Nuevo empleado" para comenzar.
            </p>
          )}
          {cargando && <p className="p-8 text-center text-sm text-muted-foreground">Cargando…</p>}
        </CardContent>
      </Card>

      {/* Detalle del empleado elegido */}
      {seleccionado && (
        <Card>
          <CardHeader className="flex flex-row items-start justify-between gap-4">
            <div>
              <CardTitle>{seleccionado.empleado.nombre}</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Ingreso: {formatFecha(seleccionado.empleado.fecha_ingreso)} · Salario diario: {dinero(seleccionado.empleado.salario_diario)} · Prima:{" "}
                {seleccionado.empleado.porcentaje_prima} %
              </p>
            </div>
            <Button size="sm" onClick={() => setRegistrarPara(seleccionado.empleado)} disabled={seleccionado.resumen.pendientes === 0}>
              <Plus className="w-4 h-4" />
              Registrar vacaciones
            </Button>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h3 className="font-semibold mb-2">Años de servicio</h3>
              {seleccionado.resumen.periodos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Aún no cumple un año de servicio. El {formatFecha(seleccionado.resumen.proximoAniversario)} tendrá derecho a{" "}
                  {seleccionado.resumen.diasProximoAnio} días.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Año</TableHead>
                      <TableHead>Disponibles desde</TableHead>
                      <TableHead>Otorgar antes del</TableHead>
                      <TableHead>Prescriben</TableHead>
                      <TableHead>Derecho</TableHead>
                      <TableHead>Tomados</TableHead>
                      <TableHead>Pendientes</TableHead>
                      <TableHead>Situación</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...seleccionado.resumen.periodos].reverse().map((p) => (
                      <TableRow key={p.anio}>
                        <TableCell className="font-medium">{p.anio}</TableCell>
                        <TableCell>{formatFecha(p.aniversario)}</TableCell>
                        <TableCell>{formatFecha(p.limiteOtorgar)}</TableCell>
                        <TableCell>{formatFecha(p.prescribe)}</TableCell>
                        <TableCell>{p.derecho}</TableCell>
                        <TableCell>{p.tomados}</TableCell>
                        <TableCell className="font-semibold">{p.pendientes}</TableCell>
                        <TableCell>
                          <span
                            className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${estadoPeriodoInfo[p.estado].clase}`}
                            title={estadoPeriodoInfo[p.estado].ayuda}
                          >
                            {estadoPeriodoInfo[p.estado].texto}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>

            <div>
              <h3 className="font-semibold mb-2">Historial de vacaciones</h3>
              {(() => {
                const historial = vacaciones.filter((v) => v.empleado_id === seleccionado.empleado.id);
                if (historial.length === 0) return <p className="text-sm text-muted-foreground">Sin vacaciones registradas.</p>;
                return (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Fechas</TableHead>
                        <TableHead>Año de servicio</TableHead>
                        <TableHead>Días</TableHead>
                        <TableHead>Prima vacacional</TableHead>
                        <TableHead>Notas</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {historial.map((v) => (
                        <TableRow key={v.id}>
                          <TableCell>
                            {formatFecha(v.fecha_inicio)} – {formatFecha(v.fecha_fin)}
                          </TableCell>
                          <TableCell>{v.anio_servicio}</TableCell>
                          <TableCell>{v.dias}</TableCell>
                          <TableCell>{dinero(v.prima_vacacional)}</TableCell>
                          <TableCell className="max-w-xs truncate text-muted-foreground">{v.notas}</TableCell>
                          <TableCell className="text-right">
                            <Button size="sm" variant="ghost" onClick={() => eliminarVacacion(v)} title="Eliminar registro">
                              <Trash2 className="w-4 h-4 text-status-pending" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                );
              })()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Referencia legal */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Scale className="w-5 h-5 text-primary" />
            Ley Federal del Trabajo
          </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <p className="text-sm font-medium mb-2">Días de vacaciones por años de servicio (Art. 76)</p>
            <div className="grid grid-cols-4 gap-2 text-sm">
              {[
                ["1 año", 1], ["2 años", 2], ["3 años", 3], ["4 años", 4], ["5 años", 5], ["6–10", 6],
                ["11–15", 11], ["16–20", 16], ["21–25", 21], ["26–30", 26], ["31–35", 31],
              ].map(([texto, anios]) => (
                <div key={texto} className="p-2 bg-secondary rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">{texto}</p>
                  <p className="font-semibold">{diasPorAntiguedad(anios as number)} días</p>
                </div>
              ))}
            </div>
          </div>
          <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-5">
            <li>Se cuentan en días laborables (lunes a sábado); los días de descanso obligatorio del Art. 74 no cuentan.</li>
            <li>Al menos 12 días se disfrutan de forma continua, salvo que el trabajador decida dividirlos (Art. 78).</li>
            <li>No pueden pagarse en lugar de disfrutarse, salvo al terminar la relación laboral (Art. 79).</li>
            <li>Prima vacacional de al menos 25 % del salario de los días de vacaciones (Art. 80).</li>
            <li>Deben otorgarse dentro de los 6 meses siguientes al aniversario (Art. 81).</li>
            <li>El derecho a reclamarlas prescribe un año después de ese plazo (Art. 516).</li>
          </ul>
        </CardContent>
      </Card>

      <EmpleadoDialog
        empleado={dialogoEmpleado}
        usuarios={users}
        usuariosOcupados={usuariosOcupados}
        onClose={() => setDialogoEmpleado(null)}
        onSaved={cargar}
      />
      <RegistrarVacacionesDialog
        empleado={registrarPara}
        periodos={registrarPara ? resumenEmpleado(registrarPara, vacaciones).periodos : []}
        onClose={() => setRegistrarPara(null)}
        onSaved={cargar}
      />
    </div>
  );
}
