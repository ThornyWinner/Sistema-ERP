/**
 * Vacaciones.tsx — Permisos Vacacionales (ruta /vacaciones). Solo administrador primario.
 *
 * Control laboral del personal conforme a la Ley Federal del Trabajo y al Art. 123
 * constitucional:
 *  - Indicadores: empleados activos, días pendientes, vacaciones atrasadas (Art. 81),
 *    alertas laborales (causal por faltas y riesgos altos ante demanda) y quién está
 *    de vacaciones hoy.
 *  - Avisos de vacaciones atrasadas y de causales de rescisión por faltas vigentes.
 *  - Tabla de empleados con antigüedad, días pendientes, situación y próximo aniversario.
 *  - Detalle del empleado elegido (DetalleEmpleado): vacaciones, incidencias,
 *    expediente con riesgos legales y terminación (finiquito o liquidación).
 *  - Referencia de la LFT.
 * Cálculos: lib/vacaciones.ts y lib/laboral.ts. Tablas y reglas: sql/vacaciones.sql y
 * sql/expediente_laboral.sql.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CalendarDays, Gavel, Palmtree, Pencil, Plus, Scale, Shield, Users } from "lucide-react";
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
import { analizarIncidencias, evaluarRiesgos, type Documento, type Finiquito, type Incidencia } from "../lib/laboral";
import StatCard from "../components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "../components/Card";
import { Button } from "../components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import EmpleadoDialog from "../components/vacaciones/EmpleadoDialog";
import RegistrarVacacionesDialog from "../components/vacaciones/RegistrarVacacionesDialog";
import DetalleEmpleado from "../components/vacaciones/DetalleEmpleado";

/** Situación más urgente de un empleado, para la columna "Situación". */
const PRIORIDAD: EstadoPeriodo[] = ["atrasado", "vigente", "completo"];

export default function Vacaciones() {
  const { user, users, refreshUsers } = useAuth();
  const esAdmin = user?.rol === "admin_primario";
  const [empleados, setEmpleados] = useState<Empleado[]>([]);
  const [vacaciones, setVacaciones] = useState<Vacacion[]>([]);
  const [incidencias, setIncidencias] = useState<Incidencia[]>([]);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [finiquitos, setFiniquitos] = useState<Finiquito[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarInactivos, setMostrarInactivos] = useState(false);
  // Empleado cuyo detalle se muestra.
  const [seleccionadoId, setSeleccionadoId] = useState<string | null>(null);
  // Diálogos: empleado en edición ("nuevo" = alta) y empleado al que se registran vacaciones.
  const [dialogoEmpleado, setDialogoEmpleado] = useState<Empleado | "nuevo" | null>(null);
  const [registrarPara, setRegistrarPara] = useState<Empleado | null>(null);

  const cargar = useCallback(async () => {
    const [emp, vac, inc, doc, fin] = await Promise.all([
      supabase.from("empleados").select("*").order("nombre"),
      supabase.from("vacaciones").select("*").order("fecha_inicio", { ascending: false }),
      supabase.from("incidencias").select("*").order("fecha_inicio", { ascending: false }),
      supabase.from("documentos").select("*").order("fecha", { ascending: false }),
      supabase.from("finiquitos").select("*").order("created_at", { ascending: false }),
    ]);
    const error = emp.error || vac.error || inc.error || doc.error || fin.error;
    if (error) {
      toast.error("No se pudo cargar el control laboral", { description: error.message });
    } else {
      // Los campos numeric de PostgreSQL pueden llegar como texto.
      setEmpleados(emp.data!.map((e: any) => ({ ...e, salario_diario: Number(e.salario_diario), porcentaje_prima: Number(e.porcentaje_prima) })));
      setVacaciones(vac.data!.map((v: any) => ({ ...v, prima_vacacional: Number(v.prima_vacacional) })));
      setIncidencias(inc.data as Incidencia[]);
      setDocumentos(doc.data as Documento[]);
      setFiniquitos(fin.data!.map((f: any) => ({ ...f, total: Number(f.total), salario_diario: Number(f.salario_diario), salario_diario_integrado: Number(f.salario_diario_integrado) })));
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
          <Shield className="w-16 h-16 text-neutral-300 dark:text-neutral-600 mx-auto mb-4" />
          <h2 className="text-2xl mb-2">Acceso Restringido</h2>
          <p className="text-muted-foreground">Solo el administrador primario gestiona los permisos vacacionales</p>
        </div>
      </div>
    );
  }

  const filas = empleados.map((e) => ({ empleado: e, resumen: resumenEmpleado(e, vacaciones) }));
  const activos = filas.filter((f) => f.empleado.activo);
  const visibles = mostrarInactivos ? filas : activos;
  const conAtraso = activos.filter((f) => f.resumen.atrasados.length > 0);
  const deVacaciones = activos.filter((f) => f.resumen.enVacaciones);
  const seleccionado = filas.find((f) => f.empleado.id === seleccionadoId) ?? null;
  // Causales de rescisión por faltas aún dentro de plazo y empleados con riesgo alto ante demanda.
  const causales = activos
    .map((f) => ({ empleado: f.empleado, causal: analizarIncidencias(incidencias.filter((i) => i.empleado_id === f.empleado.id)).causal }))
    .filter((c) => c.causal?.vigente);
  const conRiesgoAlto = filas.filter((f) =>
    evaluarRiesgos(f.empleado, { vacaciones, incidencias, documentos, finiquitos }).some((r) => r.nivel === "alto")
  ).length;
  const usuariosOcupados = new Set(empleados.map((e) => e.usuario_id).filter((id): id is string => !!id));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1>Permisos Vacacionales</h1>
          <p className="text-muted-foreground mt-1">
            Vacaciones, incidencias, expediente y terminación del personal conforme a la Ley Federal del Trabajo
          </p>
        </div>
        <Button onClick={() => setDialogoEmpleado("nuevo")}>
          <Plus className="w-4 h-4" />
          Nuevo empleado
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
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
          title="Alertas Laborales"
          value={causales.length + conRiesgoAlto}
          icon={Gavel}
          color="danger"
          footer={`${causales.length} causal(es) por faltas · ${conRiesgoAlto} con riesgo alto`}
        />
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

      {/* Causales de rescisión por faltas dentro de plazo (Art. 47 fr. X y Art. 517 fr. I) */}
      {causales.length > 0 && (
        <Card className="border-status-pending">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-status-pending-text">
              <Gavel className="w-5 h-5" />
              Causales de rescisión por faltas
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {causales.map(({ empleado: e, causal }) => (
              <div key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-3 bg-status-pending-bg rounded-lg">
                <span className="font-medium">{e.nombre}</span>
                <span className="text-sm">
                  {causal!.faltas} faltas injustificadas en 30 días · plazo para rescindir hasta el {formatFecha(causal!.limite)}
                </span>
                <Button size="sm" variant="outline" onClick={() => setSeleccionadoId(e.id)}>
                  Ver incidencias
                </Button>
              </div>
            ))}
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
        <DetalleEmpleado
          empleado={seleccionado.empleado}
          vacaciones={vacaciones}
          incidencias={incidencias}
          documentos={documentos}
          finiquitos={finiquitos}
          onRegistrarVacaciones={() => setRegistrarPara(seleccionado.empleado)}
          onCambios={cargar}
        />
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
            <li>Más de 3 faltas injustificadas en 30 días son causal de rescisión (Art. 47 fr. X); el patrón tiene un mes para ejercerla (Art. 517 fr. I).</li>
            <li>No se permiten multas por retardos (Art. 107); la suspensión disciplinaria es de máximo 8 días (Art. 423 fr. X).</li>
            <li>La empresa debe probar antigüedad, faltas, salario, vacaciones, aguinaldo y la causa de terminación (Art. 784), y conservar sus documentos (Art. 804); si no los exhibe, se presume lo que alegue el trabajador (Art. 805).</li>
            <li>El despido injustificado se indemniza con 3 meses de salario (Art. 123 A fr. XXII constitucional; Arts. 48 y 50 LFT).</li>
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
