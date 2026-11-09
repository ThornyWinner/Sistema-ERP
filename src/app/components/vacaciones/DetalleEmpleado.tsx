/**
 * DetalleEmpleado.tsx — Detalle de un empleado en Permisos Vacacionales, en pestañas:
 *  - Vacaciones:  años de servicio (derecho, tomados, pendientes, plazos) e historial.
 *  - Incidencias: retardos, faltas, incapacidades, permisos y suspensiones, con aviso
 *                 de causal de rescisión por faltas (Art. 47 fr. X).
 *  - Expediente:  riesgos ante una demanda (Arts. 784, 804 y 805) y documentos.
 *  - Terminación: cálculo de finiquito o liquidación y baja (FiniquitoPanel).
 */
import { useState } from "react";
import { useTransicionBreve } from "../../hooks/useTransicionBreve";
import Esqueleto from "../Esqueleto";
import { toast } from "sonner";
import { AlertTriangle, Download, FileText, Info, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { formatFecha } from "../../lib/fechas";
import {
  analizarIncidencias,
  evaluarRiesgos,
  tipoDocumentoInfo,
  tipoIncidenciaInfo,
  type Documento,
  type Finiquito,
  type Incidencia,
  type TipoDocumento,
} from "../../lib/laboral";
import { estadoPeriodoInfo, resumenEmpleado, type Empleado, type Vacacion } from "../../lib/vacaciones";
import { Card, CardContent, CardHeader, CardTitle } from "../Card";
import { Button } from "../ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";
import IncidenciaDialog from "./IncidenciaDialog";
import DocumentoDialog from "./DocumentoDialog";
import FiniquitoPanel from "./FiniquitoPanel";

type Pestana = "vacaciones" | "incidencias" | "expediente" | "terminacion";

interface DetalleEmpleadoProps {
  empleado: Empleado;
  vacaciones: Vacacion[];
  incidencias: Incidencia[];
  documentos: Documento[];
  finiquitos: Finiquito[];
  onRegistrarVacaciones: () => void;
  /** Recarga los datos después de cualquier cambio. */
  onCambios: () => void;
}

const dinero = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const nivelClase = {
  alto: "bg-status-pending-bg text-status-pending-text",
  medio: "bg-status-in-progress-bg text-status-in-progress-text",
  info: "bg-secondary text-muted-foreground",
};

export default function DetalleEmpleado(props: DetalleEmpleadoProps) {
  const { empleado, vacaciones, incidencias, documentos, finiquitos, onRegistrarVacaciones, onCambios } = props;
  const [pestana, setPestana] = useState<Pestana>("vacaciones");
  // Skeleton breve al cambiar de pestaña.
  const cambiandoPestana = useTransicionBreve(pestana, 250);
  const [dialogoIncidencia, setDialogoIncidencia] = useState(false);
  // Tipo sugerido al abrir el diálogo de documento (null = cerrado).
  const [dialogoDocumento, setDialogoDocumento] = useState<TipoDocumento | null>(null);

  const resumen = resumenEmpleado(empleado, vacaciones);
  const propiasVac = vacaciones.filter((v) => v.empleado_id === empleado.id);
  const propiasInc = incidencias.filter((i) => i.empleado_id === empleado.id).sort((a, b) => b.fecha_inicio.localeCompare(a.fecha_inicio));
  const propiosDocs = documentos.filter((d) => d.empleado_id === empleado.id).sort((a, b) => b.fecha.localeCompare(a.fecha));
  const analisis = analizarIncidencias(propiasInc);
  const riesgos = evaluarRiesgos(empleado, { vacaciones, incidencias, documentos, finiquitos });
  const riesgosAltos = riesgos.filter((r) => r.nivel === "alto").length;

  const eliminar = async (tabla: "vacaciones" | "incidencias", id: string, texto: string) => {
    if (!confirm(`¿Eliminar ${texto}?`)) return;
    const { error } = await supabase.from(tabla).delete().eq("id", id);
    if (error) return toast.error("No se pudo eliminar", { description: error.message });
    toast.success("Registro eliminado");
    onCambios();
  };

  const abrirArchivo = async (d: Documento) => {
    const { data, error } = await supabase.storage.from("expedientes").createSignedUrl(d.archivo_path!, 60);
    if (error) return toast.error("No se pudo abrir el archivo", { description: error.message });
    window.open(data.signedUrl, "_blank", "noopener");
  };

  const eliminarDocumento = async (d: Documento) => {
    if (!confirm(`¿Eliminar "${tipoDocumentoInfo[d.tipo].texto}" del expediente?`)) return;
    if (d.archivo_path) await supabase.storage.from("expedientes").remove([d.archivo_path]);
    const { error } = await supabase.from("documentos").delete().eq("id", d.id);
    if (error) return toast.error("No se pudo eliminar", { description: error.message });
    toast.success("Documento eliminado");
    onCambios();
  };

  const pestanas: { clave: Pestana; texto: string; aviso?: number }[] = [
    { clave: "vacaciones", texto: "Vacaciones" },
    { clave: "incidencias", texto: "Incidencias", aviso: analisis.causal?.vigente ? 1 : 0 },
    { clave: "expediente", texto: "Expediente", aviso: riesgosAltos },
    { clave: "terminacion", texto: "Terminación" },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <CardTitle>{empleado.nombre}</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {empleado.puesto || "Sin puesto"} · Ingreso: {formatFecha(empleado.fecha_ingreso)} · Salario diario: {dinero(empleado.salario_diario)} ·
              Prima: {empleado.porcentaje_prima} %
              {empleado.fecha_baja && ` · Baja: ${formatFecha(empleado.fecha_baja)}`}
            </p>
          </div>
        </div>
        {/* Pestañas */}
        <div className="flex gap-1 border-b border-border mt-4 overflow-x-auto">
          {pestanas.map((p) => (
            <button
              key={p.clave}
              onClick={() => setPestana(p.clave)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
                pestana === p.clave ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {p.texto}
              {!!p.aviso && <span className="px-1.5 py-0.5 rounded-full text-xs bg-status-pending dark:bg-red-600 text-white">{p.aviso}</span>}
            </button>
          ))}
        </div>
      </CardHeader>

      {/* El contenido de la pestaña nueva se muestra unos instantes como su propio esqueleto */}
      <Esqueleto activo={cambiandoPestana}>
      <CardContent className="space-y-6">
        {/* ============ Vacaciones ============ */}
        {pestana === "vacaciones" && (
          <>
            <div className="flex justify-end">
              <Button size="sm" onClick={onRegistrarVacaciones} disabled={resumen.pendientes === 0}>
                <Plus className="w-4 h-4" />
                Registrar vacaciones
              </Button>
            </div>
            {resumen.periodos.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aún no cumple un año de servicio. El {formatFecha(resumen.proximoAniversario)} tendrá derecho a {resumen.diasProximoAnio} días.
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
                  {[...resumen.periodos].reverse().map((p) => (
                    <TableRow key={p.anio}>
                      <TableCell className="font-medium">{p.anio}</TableCell>
                      <TableCell>{formatFecha(p.aniversario)}</TableCell>
                      <TableCell>{formatFecha(p.limiteOtorgar)}</TableCell>
                      <TableCell>{formatFecha(p.prescribe)}</TableCell>
                      <TableCell>{p.derecho}</TableCell>
                      <TableCell>{p.tomados}</TableCell>
                      <TableCell className="font-semibold">{p.pendientes}</TableCell>
                      <TableCell>
                        <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${estadoPeriodoInfo[p.estado].clase}`} title={estadoPeriodoInfo[p.estado].ayuda}>
                          {estadoPeriodoInfo[p.estado].texto}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div>
              <h3 className="font-semibold mb-2">Historial de vacaciones</h3>
              {propiasVac.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin vacaciones registradas.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fechas</TableHead>
                      <TableHead>Año de servicio</TableHead>
                      <TableHead>Días</TableHead>
                      <TableHead>Prima vacacional</TableHead>
                      <TableHead>Recibo firmado</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {propiasVac.map((v) => {
                      const recibo = propiosDocs.some((d) => d.vacacion_id === v.id && d.tipo === "recibo_vacaciones" && d.firmado);
                      return (
                        <TableRow key={v.id}>
                          <TableCell>
                            {formatFecha(v.fecha_inicio)} – {formatFecha(v.fecha_fin)}
                          </TableCell>
                          <TableCell>{v.anio_servicio}</TableCell>
                          <TableCell>{v.dias}</TableCell>
                          <TableCell>{dinero(v.prima_vacacional)}</TableCell>
                          <TableCell>
                            {recibo ? (
                              <span className="text-xs text-status-completed-text">Sí</span>
                            ) : (
                              <button className="text-xs text-primary hover:underline" onClick={() => setDialogoDocumento("recibo_vacaciones")}>
                                Agregar recibo
                              </button>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              size="sm"
                              variant="ghost"
                              title="Eliminar registro"
                              onClick={() => eliminar("vacaciones", v.id, `las vacaciones del ${formatFecha(v.fecha_inicio)} al ${formatFecha(v.fecha_fin)}`)}
                            >
                              <Trash2 className="w-4 h-4 text-status-pending" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </div>
          </>
        )}

        {/* ============ Incidencias ============ */}
        {pestana === "incidencias" && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-6 text-sm">
                <span>
                  Faltas injustificadas (30 días): <strong>{analisis.faltasUltimos30}</strong>
                </span>
                <span>
                  Retardos (30 días): <strong>{analisis.retardosUltimos30}</strong>
                </span>
              </div>
              <Button size="sm" onClick={() => setDialogoIncidencia(true)} disabled={!!empleado.fecha_baja}>
                <Plus className="w-4 h-4" />
                Registrar incidencia
              </Button>
            </div>

            {analisis.causal && (
              <div className={`p-4 rounded-lg ${analisis.causal.vigente ? "bg-status-pending-bg" : "bg-secondary"}`}>
                <p className="flex items-center gap-2 font-medium">
                  <AlertTriangle className="w-4 h-4" />
                  {analisis.causal.faltas} faltas injustificadas entre el {formatFecha(analisis.causal.desde)} y el {formatFecha(analisis.causal.hasta)}
                </p>
                <p className="text-sm mt-1">
                  Más de 3 faltas en 30 días son causal de rescisión sin responsabilidad para la empresa (Art. 47 fr. X).{" "}
                  {analisis.causal.vigente
                    ? `El plazo para ejercerla vence el ${formatFecha(analisis.causal.limite)} (un mes, Art. 517 fr. I).`
                    : `El plazo para ejercerla venció el ${formatFecha(analisis.causal.limite)} (Art. 517 fr. I).`}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Para rescindir: actas administrativas de cada falta y aviso de rescisión por escrito con la causa y la fecha, entregado al trabajador
                  o por medio del Tribunal dentro de los 5 días hábiles siguientes (Art. 47).
                </p>
              </div>
            )}

            <p className="flex gap-2 text-xs text-muted-foreground">
              <Info className="w-4 h-4 shrink-0" />
              Los retardos no pueden descontarse como multa (Art. 107). Solo procede no pagar el tiempo no laborado y las medidas que
              establezca el Reglamento Interior de Trabajo (Art. 423), como la suspensión de hasta 8 días.
            </p>

            {propiasInc.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin incidencias registradas.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Fechas</TableHead>
                    <TableHead>Detalle</TableHead>
                    <TableHead>Acta / documento</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {propiasInc.map((i) => {
                    const respaldo = i.acta_administrativa || propiosDocs.some((d) => d.incidencia_id === i.id);
                    return (
                      <TableRow key={i.id}>
                        <TableCell>
                          <span className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${tipoIncidenciaInfo[i.tipo].clase}`}>
                            {tipoIncidenciaInfo[i.tipo].texto}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {formatFecha(i.fecha_inicio)}
                          {i.fecha_fin !== i.fecha_inicio && ` – ${formatFecha(i.fecha_fin)}`}
                        </TableCell>
                        <TableCell className="text-sm">
                          {i.minutos_retardo ? `${i.minutos_retardo} min. ` : ""}
                          <span className="text-muted-foreground">{i.motivo}</span>
                        </TableCell>
                        <TableCell>
                          {respaldo ? (
                            <span className="text-xs text-status-completed-text">Sí</span>
                          ) : i.tipo === "falta_injustificada" || i.tipo === "suspension" ? (
                            <button className="text-xs text-primary hover:underline" onClick={() => setDialogoDocumento("acta_administrativa")}>
                              Agregar acta
                            </button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" title="Eliminar" onClick={() => eliminar("incidencias", i.id, "esta incidencia")}>
                            <Trash2 className="w-4 h-4 text-status-pending" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </>
        )}

        {/* ============ Expediente ============ */}
        {pestana === "expediente" && (
          <>
            <div>
              <h3 className="font-semibold mb-1 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-primary" />
                Riesgos ante una demanda
              </h3>
              <p className="text-xs text-muted-foreground mb-3">
                En juicio, la empresa debe probar estos hechos (Art. 784) con los documentos que está obligada a conservar (Art. 804). Si no los
                exhibe, se presumen ciertos los hechos que alegue el trabajador (Art. 805).
              </p>
              {riesgos.length === 0 ? (
                <p className="text-sm text-status-completed-text">Expediente completo para los puntos que revisa el sistema.</p>
              ) : (
                <div className="space-y-2">
                  {riesgos.map((r) => (
                    <div key={r.titulo} className={`p-3 rounded-lg ${nivelClase[r.nivel]}`}>
                      <p className="font-medium text-sm">
                        {r.nivel === "alto" ? "Riesgo alto · " : r.nivel === "medio" ? "Riesgo medio · " : ""}
                        {r.titulo}
                      </p>
                      <p className="text-xs mt-1">{r.detalle}</p>
                      <p className="text-xs mt-1 opacity-80">Fundamento: {r.fundamento}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">Documentos</h3>
                <Button size="sm" onClick={() => setDialogoDocumento("contrato")}>
                  <Plus className="w-4 h-4" />
                  Agregar documento
                </Button>
              </div>
              {propiosDocs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin documentos en el expediente.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Documento</TableHead>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Firmado</TableHead>
                      <TableHead>Archivo</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {propiosDocs.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>
                          <p className="font-medium flex items-center gap-2">
                            <FileText className="w-4 h-4 text-muted-foreground" />
                            {tipoDocumentoInfo[d.tipo].texto}
                          </p>
                          {d.descripcion && <p className="text-xs text-muted-foreground">{d.descripcion}</p>}
                        </TableCell>
                        <TableCell>{formatFecha(d.fecha)}</TableCell>
                        <TableCell>{d.firmado ? "Sí" : <span className="text-status-pending-text">No</span>}</TableCell>
                        <TableCell>
                          {d.archivo_path ? (
                            <Button size="sm" variant="ghost" onClick={() => abrirArchivo(d)}>
                              <Download className="w-4 h-4" />
                              Ver
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">En papel</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" title="Eliminar" onClick={() => eliminarDocumento(d)}>
                            <Trash2 className="w-4 h-4 text-status-pending" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </>
        )}

        {/* ============ Terminación ============ */}
        {pestana === "terminacion" && (
          <FiniquitoPanel empleado={empleado} vacaciones={vacaciones} finiquitos={finiquitos} onSaved={onCambios} />
        )}
      </CardContent>
      </Esqueleto>

      <IncidenciaDialog empleado={dialogoIncidencia ? empleado : null} onClose={() => setDialogoIncidencia(false)} onSaved={onCambios} />
      <DocumentoDialog
        empleado={dialogoDocumento ? empleado : null}
        tipoInicial={dialogoDocumento ?? undefined}
        incidencias={incidencias}
        vacaciones={vacaciones}
        finiquitos={finiquitos}
        onClose={() => setDialogoDocumento(null)}
        onSaved={onCambios}
      />
    </Card>
  );
}
