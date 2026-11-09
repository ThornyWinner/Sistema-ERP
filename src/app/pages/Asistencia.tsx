/**
 * Asistencia.tsx — Control de asistencia del personal (solo admin primario).
 *
 * Pestañas:
 *  - Día:       resumen de un día por empleado (entrada, salida, horas, estado: a tiempo,
 *               retardo, falta, descanso, vacaciones…), con la foto y la distancia de cada
 *               checada; checada manual y procesamiento de faltas.
 *  - Sedes y QR: ubicación y radio permitido de cada sede, y su código QR para imprimir.
 *  - Horarios y personal: horarios de cada sede, tolerancia, y asignación de horario y
 *               fecha de inicio del control a cada empleado.
 *
 * Los retardos y faltas los registra la BD (ver sql/asistencia.sql) en Incidencias:
 * el retardo al checar la entrada y la falta cada noche (pg_cron) para el día anterior.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import QRCode from "qrcode";
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Clock,
  Crosshair,
  MapPin,
  Plus,
  Printer,
  RefreshCw,
  Shield,
  UserX,
  Users,
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../context/AuthContext";
import { formatFecha, hoyISO } from "../lib/fechas";
import { tipoIncidenciaInfo, type TipoIncidencia } from "../lib/laboral";
import StatCard from "../components/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "../components/Card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";

// ----- Tipos ---------------------------------------------------------------------------
interface Sede {
  id: string;
  nombre: string;
  latitud: number | null;
  longitud: number | null;
  radio_m: number;
  token_qr: string;
  activo: boolean;
}
interface HorarioDia {
  dia_semana: number;
  hora_entrada: string;
  hora_salida: string;
}
interface Horario {
  id: string;
  nombre: string;
  sede_id: string;
  tolerancia_min: number;
  horario_dias: HorarioDia[];
}
interface EmpleadoAsistencia {
  id: string;
  nombre: string;
  puesto: string | null;
  activo: boolean;
  fecha_ingreso: string;
  fecha_baja: string | null;
  horario_id: string | null;
  asistencia_desde: string | null;
}
interface Checada {
  id: string;
  empleado_id: string;
  sede_id: string | null;
  tipo: "entrada" | "salida";
  fecha: string;
  fecha_hora: string;
  distancia_m: number | null;
  precision_m: number | null;
  foto_path: string | null;
  origen: "qr" | "manual";
  notas: string | null;
}
interface IncidenciaDia {
  empleado_id: string;
  tipo: TipoIncidencia;
  minutos_retardo: number | null;
  origen: "manual" | "checador";
}

const DIAS = ["", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const CLASE_SELECT =
  "h-9 w-full rounded-md border border-input bg-input-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";
/** Saltillo (America/Monterrey) está en UTC-6 todo el año. */
const OFFSET_LOCAL = "-06:00";

const horaLocal = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: "America/Monterrey" });
const hhmm = (t: string) => t.slice(0, 5);
const isoDow = (fecha: string) => {
  const d = new Date(`${fecha}T12:00:00`).getDay();
  return d === 0 ? 7 : d;
};
const urlChecar = (token: string) => `${window.location.origin}/checar?sede=${token}`;

type Pestana = "dia" | "sedes" | "horarios";

export default function Asistencia() {
  const { user } = useAuth();
  const esAdmin = user?.rol === "admin_primario";
  const [pestana, setPestana] = useState<Pestana>("dia");

  const [sedes, setSedes] = useState<Sede[]>([]);
  const [horarios, setHorarios] = useState<Horario[]>([]);
  const [empleados, setEmpleados] = useState<EmpleadoAsistencia[]>([]);
  const [cargando, setCargando] = useState(true);

  const cargarConfig = useCallback(async () => {
    const [s, h, e] = await Promise.all([
      supabase.from("sedes").select("*").order("nombre"),
      supabase.from("horarios").select("id,nombre,sede_id,tolerancia_min,horario_dias(dia_semana,hora_entrada,hora_salida)").order("nombre"),
      supabase
        .from("empleados")
        .select("id,nombre,puesto,activo,fecha_ingreso,fecha_baja,horario_id,asistencia_desde")
        .order("nombre"),
    ]);
    const error = s.error || h.error || e.error;
    if (error) toast.error("No se pudo cargar la configuración de asistencia", { description: error.message });
    else {
      setSedes(s.data as Sede[]);
      setHorarios(h.data as Horario[]);
      setEmpleados(e.data as EmpleadoAsistencia[]);
    }
    setCargando(false);
  }, []);

  useEffect(() => {
    if (esAdmin) void cargarConfig();
  }, [esAdmin, cargarConfig]);

  if (!esAdmin) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center">
          <Shield className="w-16 h-16 text-neutral-300 dark:text-neutral-600 mx-auto mb-4" />
          <h2 className="text-2xl mb-2">Acceso Restringido</h2>
          <p className="text-muted-foreground">Solo el administrador primario consulta la asistencia del personal</p>
        </div>
      </div>
    );
  }

  const pestanas: { clave: Pestana; texto: string }[] = [
    { clave: "dia", texto: "Asistencia del día" },
    { clave: "sedes", texto: "Sedes y QR" },
    { clave: "horarios", texto: "Horarios y personal" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1>Asistencia</h1>
        <p className="text-muted-foreground mt-1">
          Checadas por QR con selfie y ubicación; los retardos y las faltas se registran solos en Incidencias
        </p>
      </div>

      <div className="flex gap-1 border-b border-border overflow-x-auto" role="tablist">
        {pestanas.map((p) => (
          <button
            key={p.clave}
            role="tab"
            aria-selected={pestana === p.clave}
            onClick={() => setPestana(p.clave)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition-colors ${
              pestana === p.clave ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {p.texto}
          </button>
        ))}
      </div>

      {cargando ? (
        <p className="py-12 text-center text-muted-foreground">Cargando…</p>
      ) : pestana === "dia" ? (
        <ResumenDia empleados={empleados} horarios={horarios} sedes={sedes} />
      ) : pestana === "sedes" ? (
        <SedesQR sedes={sedes} onCambio={cargarConfig} />
      ) : (
        <HorariosPersonal horarios={horarios} sedes={sedes} empleados={empleados} onCambio={cargarConfig} />
      )}
    </div>
  );
}

// =========================================================================================
// Resumen del día
// =========================================================================================

type EstadoDia =
  | { clave: "sin_control" | "descanso" | "inhabil" | "vacaciones" | "pendiente" | "sin_entrada" | "a_tiempo" | "falta"; texto: string }
  | { clave: "retardo"; texto: string }
  | { clave: "justificado"; texto: string };

const CLASE_ESTADO: Record<EstadoDia["clave"], string> = {
  sin_control: "bg-secondary text-muted-foreground",
  descanso: "bg-secondary text-muted-foreground",
  inhabil: "bg-secondary text-muted-foreground",
  vacaciones: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  justificado: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  pendiente: "bg-secondary text-muted-foreground",
  sin_entrada: "bg-status-pending-bg text-status-pending-text",
  a_tiempo: "bg-status-completed-bg text-status-completed-text",
  retardo: "bg-status-in-progress-bg text-status-in-progress-text",
  falta: "bg-status-pending-bg text-status-pending-text",
};

function ResumenDia({ empleados, horarios, sedes }: { empleados: EmpleadoAsistencia[]; horarios: Horario[]; sedes: Sede[] }) {
  const [fecha, setFecha] = useState(hoyISO());
  const [checadas, setChecadas] = useState<Checada[]>([]);
  const [incidencias, setIncidencias] = useState<IncidenciaDia[]>([]);
  const [enVacaciones, setEnVacaciones] = useState<Set<string>>(new Set());
  const [inhabil, setInhabil] = useState<string | null>(null);
  const [manualAbierta, setManualAbierta] = useState(false);
  const [foto, setFoto] = useState<{ url: string; titulo: string } | null>(null);
  const [procesando, setProcesando] = useState(false);

  const cargarDia = useCallback(async () => {
    const [c, i, v, d] = await Promise.all([
      supabase.from("checadas").select("*").eq("fecha", fecha).order("fecha_hora"),
      supabase
        .from("incidencias")
        .select("empleado_id,tipo,minutos_retardo,origen")
        .lte("fecha_inicio", fecha)
        .gte("fecha_fin", fecha),
      supabase.from("vacaciones").select("empleado_id").lte("fecha_inicio", fecha).gte("fecha_fin", fecha),
      supabase.from("dias_inhabiles").select("descripcion").eq("fecha", fecha).maybeSingle(),
    ]);
    const error = c.error || i.error || v.error || d.error;
    if (error) {
      toast.error("No se pudo cargar la asistencia del día", { description: error.message });
      return;
    }
    setChecadas(c.data as Checada[]);
    setIncidencias(i.data as IncidenciaDia[]);
    setEnVacaciones(new Set((v.data ?? []).map((x: any) => x.empleado_id)));
    setInhabil((d.data as any)?.descripcion ?? null);
  }, [fecha]);

  useEffect(() => {
    void cargarDia();
  }, [cargarDia]);

  const hoy = hoyISO();
  const activos = empleados.filter((e) => e.activo && !e.fecha_baja);
  const sedeNombre = (id: string | null) => sedes.find((s) => s.id === id)?.nombre ?? "—";

  const filas = useMemo(
    () =>
      activos.map((e) => {
        const horario = horarios.find((h) => h.id === e.horario_id);
        const dia = horario?.horario_dias.find((d) => d.dia_semana === isoDow(fecha));
        const propias = checadas.filter((c) => c.empleado_id === e.id);
        const entrada = propias.find((c) => c.tipo === "entrada");
        const salidas = propias.filter((c) => c.tipo === "salida");
        const salida = salidas[salidas.length - 1];
        const inc = incidencias.filter((i) => i.empleado_id === e.id);
        const retardo = inc.find((i) => i.tipo === "retardo");
        const falta = inc.find((i) => i.tipo === "falta_injustificada");
        const justificante = inc.find((i) =>
          ["incapacidad", "permiso_con_goce", "permiso_sin_goce", "falta_justificada", "suspension"].includes(i.tipo)
        );

        let estado: EstadoDia;
        if (!horario || !e.asistencia_desde || fecha < e.asistencia_desde) estado = { clave: "sin_control", texto: "Sin control" };
        else if (inhabil) estado = { clave: "inhabil", texto: "Día inhábil" };
        else if (enVacaciones.has(e.id)) estado = { clave: "vacaciones", texto: "Vacaciones" };
        else if (justificante) estado = { clave: "justificado", texto: tipoIncidenciaInfo[justificante.tipo].texto };
        else if (!dia) estado = { clave: "descanso", texto: "Descanso" };
        else if (entrada)
          estado = retardo
            ? { clave: "retardo", texto: `Retardo ${retardo.minutos_retardo ?? ""} min` }
            : { clave: "a_tiempo", texto: "A tiempo" };
        else if (falta) estado = { clave: "falta", texto: "Falta" };
        else if (fecha === hoy) {
          const limite = new Date(`${fecha}T${hhmm(dia.hora_entrada)}:00${OFFSET_LOCAL}`).getTime() + (horario.tolerancia_min * 60000);
          estado = Date.now() <= limite ? { clave: "pendiente", texto: "Aún en tolerancia" } : { clave: "sin_entrada", texto: "Sin entrada" };
        } else estado = { clave: "sin_entrada", texto: "Sin entrada (falta por procesar)" };

        const horas =
          entrada && salida ? (new Date(salida.fecha_hora).getTime() - new Date(entrada.fecha_hora).getTime()) / 3600000 : null;
        return { empleado: e, horario, dia, entrada, salida, estado, horas, propias };
      }),
    [activos, horarios, checadas, incidencias, enVacaciones, inhabil, fecha, hoy]
  );

  const controlados = filas.filter((f) => f.estado.clave !== "sin_control");
  const conteo = (claves: EstadoDia["clave"][]) => filas.filter((f) => claves.includes(f.estado.clave)).length;

  const verFoto = async (c: Checada, nombre: string) => {
    if (!c.foto_path) return;
    const { data, error } = await supabase.storage.from("asistencia").createSignedUrl(c.foto_path, 120);
    if (error) return toast.error("No se pudo abrir la foto", { description: error.message });
    setFoto({ url: data.signedUrl, titulo: `${nombre} · ${c.tipo} ${horaLocal(c.fecha_hora)}` });
  };

  const procesarFaltas = async () => {
    setProcesando(true);
    const { data, error } = await supabase.rpc("procesar_faltas", { p_desde: fecha, p_hasta: fecha });
    setProcesando(false);
    if (error) return toast.error("No se pudieron procesar las faltas", { description: error.message });
    toast.success(data ? `Se registraron ${data} falta(s)` : "No hubo faltas que registrar");
    void cargarDia();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="as-fecha">Día</Label>
          <Input id="as-fecha" type="date" value={fecha} max={hoy} onChange={(e) => e.target.value && setFecha(e.target.value)} className="w-44" />
        </div>
        <div className="flex flex-wrap gap-2">
          {fecha < hoy && (
            <Button variant="outline" onClick={procesarFaltas} disabled={procesando}>
              <UserX className="w-4 h-4" />
              {procesando ? "Procesando…" : "Procesar faltas del día"}
            </Button>
          )}
          <Button onClick={() => setManualAbierta(true)}>
            <Plus className="w-4 h-4" />
            Checada manual
          </Button>
        </div>
      </div>

      {inhabil && (
        <p className="rounded-lg bg-secondary px-4 py-3 text-sm">
          <strong>{formatFecha(fecha)}</strong> es día inhábil: {inhabil}. No se generan faltas ni retardos.
        </p>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Con control" value={controlados.length} icon={Users} color="primary" footer={`de ${filas.length} empleados activos`} />
        <StatCard title="A tiempo" value={conteo(["a_tiempo"])} icon={CheckCircle2} color="success" footer="Entrada dentro de la tolerancia" />
        <StatCard title="Retardos" value={conteo(["retardo"])} icon={Clock} color="warning" footer="Registrados en Incidencias" />
        <StatCard title="Faltas / sin entrada" value={conteo(["falta", "sin_entrada"])} icon={UserX} color="danger" footer="Faltas se registran cada noche" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{formatFecha(fecha)}</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empleado</TableHead>
                <TableHead>Horario del día</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Salida</TableHead>
                <TableHead>Horas</TableHead>
                <TableHead>Estado</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((f) => (
                <TableRow key={f.empleado.id}>
                  <TableCell>
                    <p className="font-medium">{f.empleado.nombre}</p>
                    <p className="text-xs text-muted-foreground">{f.horario?.nombre ?? "Sin horario"}</p>
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {f.dia ? `${hhmm(f.dia.hora_entrada)} – ${hhmm(f.dia.hora_salida)}` : "—"}
                  </TableCell>
                  <TableCell>
                    <ChecadaCelda c={f.entrada} sede={sedeNombre} onFoto={(c) => verFoto(c, f.empleado.nombre)} />
                  </TableCell>
                  <TableCell>
                    <ChecadaCelda c={f.salida} sede={sedeNombre} onFoto={(c) => verFoto(c, f.empleado.nombre)} />
                  </TableCell>
                  <TableCell className="text-sm tabular-nums">
                    {f.horas != null ? `${Math.floor(f.horas)} h ${Math.round((f.horas % 1) * 60)} min` : "—"}
                  </TableCell>
                  <TableCell>
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${CLASE_ESTADO[f.estado.clave]}`}>
                      {f.estado.texto}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {filas.some((f) => f.estado.clave === "sin_control") && (
            <p className="mt-3 text-xs text-muted-foreground">
              "Sin control": falta asignar horario o fecha de inicio del control en la pestaña Horarios y personal.
            </p>
          )}
        </CardContent>
      </Card>

      <ChecadaManualDialog
        abierto={manualAbierta}
        onClose={() => setManualAbierta(false)}
        empleados={activos}
        fechaInicial={fecha}
        onGuardada={() => void cargarDia()}
      />

      <Dialog open={!!foto} onOpenChange={(a) => !a && setFoto(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Foto de la checada</DialogTitle>
            <DialogDescription>{foto?.titulo}</DialogDescription>
          </DialogHeader>
          {foto && <img src={foto.url} alt={`Foto de ${foto.titulo}`} className="w-full rounded-lg" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ChecadaCelda({ c, sede, onFoto }: { c?: Checada; sede: (id: string | null) => string; onFoto: (c: Checada) => void }) {
  if (!c) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="text-sm">
      <div className="flex items-center gap-1.5">
        <span className="tabular-nums font-medium">{horaLocal(c.fecha_hora)}</span>
        {c.foto_path && (
          <button type="button" onClick={() => onFoto(c)} className="text-primary hover:opacity-80" aria-label="Ver foto de la checada">
            <Camera className="w-4 h-4" />
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">
        {c.origen === "manual"
          ? `Manual${c.notas ? `: ${c.notas}` : ""}`
          : `${sede(c.sede_id)}${c.distancia_m != null ? ` · ${Math.round(c.distancia_m)} m` : ""}`}
      </p>
    </div>
  );
}

function ChecadaManualDialog({
  abierto,
  onClose,
  empleados,
  fechaInicial,
  onGuardada,
}: {
  abierto: boolean;
  onClose: () => void;
  empleados: EmpleadoAsistencia[];
  fechaInicial: string;
  onGuardada: () => void;
}) {
  const [empleadoId, setEmpleadoId] = useState("");
  const [tipo, setTipo] = useState<"entrada" | "salida">("entrada");
  const [fecha, setFecha] = useState(fechaInicial);
  const [hora, setHora] = useState("08:00");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    setEmpleadoId("");
    setTipo("entrada");
    setFecha(fechaInicial);
    setHora("08:00");
    setMotivo("");
  }, [abierto, fechaInicial]);

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    setGuardando(true);
    const { data, error } = await supabase.rpc("registrar_checada_manual", {
      p_empleado: empleadoId,
      p_fecha_hora: `${fecha}T${hora}:00${OFFSET_LOCAL}`,
      p_tipo: tipo,
      p_notas: motivo.trim(),
    });
    setGuardando(false);
    if (error) return toast.error("No se registró la checada", { description: error.message });
    const r = data as { retardo_min: number | null };
    toast.success("Checada registrada", { description: r?.retardo_min ? `Se registró un retardo de ${r.retardo_min} min.` : undefined });
    onGuardada();
    onClose();
  };

  return (
    <Dialog open={abierto} onOpenChange={(a) => !a && !guardando && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Checada manual</DialogTitle>
          <DialogDescription>
            Para cuando el empleado no pudo checar (celular sin batería, sin señal). Aplica las mismas reglas de
            retardo y reemplaza la falta automática de ese día.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="cm-emp">Empleado</Label>
            <select id="cm-emp" className={CLASE_SELECT} value={empleadoId} onChange={(e) => setEmpleadoId(e.target.value)} required>
              <option value="" disabled>
                Elige un empleado…
              </option>
              {empleados.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="cm-tipo">Tipo</Label>
              <select id="cm-tipo" className={CLASE_SELECT} value={tipo} onChange={(e) => setTipo(e.target.value as any)}>
                <option value="entrada">Entrada</option>
                <option value="salida">Salida</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cm-fecha">Fecha</Label>
              <Input id="cm-fecha" type="date" value={fecha} max={hoyISO()} onChange={(e) => setFecha(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cm-hora">Hora</Label>
              <Input id="cm-hora" type="time" value={hora} onChange={(e) => setHora(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cm-motivo">Motivo *</Label>
            <Input
              id="cm-motivo"
              placeholder="Ej. Se le descargó el celular; confirmado con cámara de vigilancia"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={300}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!empleadoId || !motivo.trim() || guardando}>
              {guardando ? "Guardando…" : "Registrar checada"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =========================================================================================
// Sedes y QR
// =========================================================================================

function SedesQR({ sedes, onCambio }: { sedes: Sede[]; onCambio: () => void }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Para registrar la ubicación de una sede, abre esta página desde un celular <strong>estando en la sede</strong> y pulsa
        "Usar mi ubicación actual". Luego imprime su QR y pégalo a la entrada.
      </p>
      <div className="grid gap-6 lg:grid-cols-3">
        {sedes.map((s) => (
          <SedeCard key={s.id} sede={s} onCambio={onCambio} />
        ))}
      </div>
    </div>
  );
}

function SedeCard({ sede, onCambio }: { sede: Sede; onCambio: () => void }) {
  const [lat, setLat] = useState(sede.latitud?.toString() ?? "");
  const [lng, setLng] = useState(sede.longitud?.toString() ?? "");
  const [radio, setRadio] = useState(String(sede.radio_m));
  const [qr, setQr] = useState<string | null>(null);
  const [ubicando, setUbicando] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setLat(sede.latitud?.toString() ?? "");
    setLng(sede.longitud?.toString() ?? "");
    setRadio(String(sede.radio_m));
    QRCode.toDataURL(urlChecar(sede.token_qr), { width: 480, margin: 2, errorCorrectionLevel: "M" })
      .then(setQr)
      .catch(() => setQr(null));
  }, [sede]);

  const usarUbicacion = () => {
    if (!navigator.geolocation) return toast.error("Este navegador no permite obtener la ubicación");
    setUbicando(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
        setUbicando(false);
        toast.success(`Ubicación obtenida (±${Math.round(pos.coords.accuracy)} m)`, {
          description: pos.coords.accuracy > 50 ? "La precisión es baja; intenta cerca de una ventana o en exterior." : undefined,
        });
      },
      () => {
        setUbicando(false);
        toast.error("No se pudo obtener la ubicación", { description: "Permite el acceso a la ubicación e inténtalo de nuevo." });
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  };

  const guardar = async () => {
    const la = Number(lat), lo = Number(lng), ra = Number(radio);
    if (!lat || !lng || Number.isNaN(la) || Number.isNaN(lo) || Math.abs(la) > 90 || Math.abs(lo) > 180)
      return toast.error("Latitud o longitud no válidas");
    if (!(ra >= 20 && ra <= 2000)) return toast.error("El radio debe estar entre 20 y 2000 m");
    setGuardando(true);
    const { error } = await supabase.from("sedes").update({ latitud: la, longitud: lo, radio_m: Math.round(ra) }).eq("id", sede.id);
    setGuardando(false);
    if (error) return toast.error("No se pudo guardar la sede", { description: error.message });
    toast.success(`Ubicación de ${sede.nombre} guardada`);
    onCambio();
  };

  const regenerar = async () => {
    if (!confirm(`¿Generar un QR nuevo para ${sede.nombre}? El QR impreso actual dejará de funcionar.`)) return;
    const { error } = await supabase.rpc("regenerar_qr_sede", { p_sede: sede.id });
    if (error) return toast.error("No se pudo regenerar el QR", { description: error.message });
    toast.success("QR regenerado; imprime y reemplaza el anterior");
    onCambio();
  };

  const imprimir = () => {
    if (!qr) return;
    const w = window.open("", "_blank", "width=600,height=800");
    if (!w) return toast.error("Permite las ventanas emergentes para imprimir el QR");
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>QR ${sede.nombre}</title>
      <style>body{font-family:Arial,sans-serif;text-align:center;margin:40px;color:#111}
      img.qr{width:340px;height:340px} h1{font-size:28px;margin:8px 0} p{font-size:16px;margin:6px 0}
      img.logo{height:70px}</style></head><body>
      <img class="logo" src="${window.location.origin}/logo-uis.png" alt="">
      <h1>Checador de asistencia</h1><p><strong>${sede.nombre}</strong></p>
      <img class="qr" src="${qr}" alt="Código QR">
      <p>1. Escanea este código con la cámara de tu celular.</p>
      <p>2. Inicia sesión, tómate la foto y registra tu entrada o salida.</p>
      <script>window.onload=function(){window.print()}<\/script></body></html>`);
    w.document.close();
  };

  const configurada = sede.latitud != null && sede.longitud != null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2">
          {sede.nombre}
          <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
              configurada ? "bg-status-completed-bg text-status-completed-text" : "bg-status-pending-bg text-status-pending-text"
            }`}
          >
            {configurada ? "Lista" : "Sin ubicación"}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex justify-center">
          {qr ? (
            <img src={qr} alt={`Código QR para checar en ${sede.nombre}`} className="w-44 h-44 rounded-lg bg-white p-1" />
          ) : (
            <div className="w-44 h-44 rounded-lg bg-muted" />
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={imprimir} disabled={!qr}>
            <Printer className="w-4 h-4" /> Imprimir
          </Button>
          <Button variant="outline" onClick={regenerar} aria-label="Generar un QR nuevo">
            <RefreshCw className="w-4 h-4" />
          </Button>
        </div>

        <div className="space-y-3 pt-3 border-t border-border">
          <Button variant="outline" className="w-full" onClick={usarUbicacion} disabled={ubicando}>
            <Crosshair className="w-4 h-4" /> {ubicando ? "Obteniendo ubicación…" : "Usar mi ubicación actual"}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor={`lat-${sede.id}`}>Latitud</Label>
              <Input id={`lat-${sede.id}`} inputMode="decimal" value={lat} onChange={(e) => setLat(e.target.value)} placeholder="25.42…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`lng-${sede.id}`}>Longitud</Label>
              <Input id={`lng-${sede.id}`} inputMode="decimal" value={lng} onChange={(e) => setLng(e.target.value)} placeholder="-101.00…" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`radio-${sede.id}`}>Radio permitido (metros)</Label>
            <Input id={`radio-${sede.id}`} type="number" min={20} max={2000} value={radio} onChange={(e) => setRadio(e.target.value)} />
            <p className="text-xs text-muted-foreground">Recomendado 100–200 m: el GPS dentro de edificios puede variar.</p>
          </div>
          {lat && lng && (
            <a
              href={`https://www.google.com/maps?q=${lat},${lng}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
            >
              <MapPin className="w-4 h-4" /> Ver en el mapa
            </a>
          )}
          <Button className="w-full" onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar ubicación"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// =========================================================================================
// Horarios y personal
// =========================================================================================

function HorariosPersonal({
  horarios,
  sedes,
  empleados,
  onCambio,
}: {
  horarios: Horario[];
  sedes: Sede[];
  empleados: EmpleadoAsistencia[];
  onCambio: () => void;
}) {
  const activos = empleados.filter((e) => e.activo && !e.fecha_baja);
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Horarios</CardTitle>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Horario</TableHead>
                {DIAS.slice(1).map((d) => (
                  <TableHead key={d}>{d}</TableHead>
                ))}
                <TableHead>Tolerancia</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {horarios.map((h) => (
                <TableRow key={h.id}>
                  <TableCell>
                    <p className="font-medium">{h.nombre}</p>
                    <p className="text-xs text-muted-foreground">{sedes.find((s) => s.id === h.sede_id)?.nombre}</p>
                  </TableCell>
                  {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                    const dia = h.horario_dias.find((x) => x.dia_semana === d);
                    return (
                      <TableCell key={d} className="text-xs tabular-nums whitespace-nowrap">
                        {dia ? (
                          <>
                            {hhmm(dia.hora_entrada)}
                            <br />
                            {hhmm(dia.hora_salida)}
                          </>
                        ) : (
                          <span className="text-muted-foreground">Descanso</span>
                        )}
                      </TableCell>
                    );
                  })}
                  <TableCell>
                    <ToleranciaInput horario={h} onCambio={onCambio} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Personal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 overflow-x-auto">
          <p className="text-sm text-muted-foreground">
            El control (retardos y faltas) empieza en la fecha indicada. Antes de activarlo, asegúrate de que la sede tenga su
            QR pegado y su ubicación registrada.
          </p>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Empleado</TableHead>
                <TableHead>Horario</TableHead>
                <TableHead>Control desde</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {activos.map((e) => (
                <EmpleadoHorarioFila key={e.id} empleado={e} horarios={horarios} onCambio={onCambio} />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function ToleranciaInput({ horario, onCambio }: { horario: Horario; onCambio: () => void }) {
  const [valor, setValor] = useState(String(horario.tolerancia_min));
  useEffect(() => setValor(String(horario.tolerancia_min)), [horario.tolerancia_min]);
  const guardar = async () => {
    const n = Number(valor);
    if (n === horario.tolerancia_min) return;
    if (!Number.isInteger(n) || n < 0 || n > 120) {
      setValor(String(horario.tolerancia_min));
      return toast.error("La tolerancia debe ser de 0 a 120 minutos");
    }
    const { error } = await supabase.from("horarios").update({ tolerancia_min: n }).eq("id", horario.id);
    if (error) return toast.error("No se pudo guardar la tolerancia", { description: error.message });
    toast.success(`Tolerancia de ${horario.nombre}: ${n} min`);
    onCambio();
  };
  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        min={0}
        max={120}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onBlur={guardar}
        className="w-20"
        aria-label={`Tolerancia en minutos de ${horario.nombre}`}
      />
      <span className="text-xs text-muted-foreground">min</span>
    </div>
  );
}

function EmpleadoHorarioFila({ empleado, horarios, onCambio }: { empleado: EmpleadoAsistencia; horarios: Horario[]; onCambio: () => void }) {
  const [horarioId, setHorarioId] = useState(empleado.horario_id ?? "");
  const [desde, setDesde] = useState(empleado.asistencia_desde ?? "");
  const [guardando, setGuardando] = useState(false);
  const cambio = horarioId !== (empleado.horario_id ?? "") || desde !== (empleado.asistencia_desde ?? "");

  const guardar = async () => {
    if (desde && !horarioId) return toast.error("Asigna un horario antes de activar el control");
    setGuardando(true);
    const { error } = await supabase
      .from("empleados")
      .update({ horario_id: horarioId || null, asistencia_desde: desde || null })
      .eq("id", empleado.id);
    setGuardando(false);
    if (error) return toast.error("No se pudo guardar", { description: error.message });
    toast.success(`${empleado.nombre}: ${desde ? `control desde ${formatFecha(desde)}` : "sin control de asistencia"}`);
    onCambio();
  };

  return (
    <TableRow>
      <TableCell>
        <p className="font-medium">{empleado.nombre}</p>
        <p className="text-xs text-muted-foreground">{empleado.puesto ?? "Sin puesto"}</p>
      </TableCell>
      <TableCell className="min-w-56">
        <select
          className={CLASE_SELECT}
          value={horarioId}
          onChange={(e) => setHorarioId(e.target.value)}
          aria-label={`Horario de ${empleado.nombre}`}
        >
          <option value="">Sin horario</option>
          {horarios.map((h) => (
            <option key={h.id} value={h.id}>
              {h.nombre}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell>
        <Input
          type="date"
          value={desde}
          min={empleado.fecha_ingreso}
          onChange={(e) => setDesde(e.target.value)}
          className="w-44"
          aria-label={`Inicio del control de asistencia de ${empleado.nombre}`}
        />
      </TableCell>
      <TableCell className="text-right">
        <Button size="sm" variant={cambio ? "default" : "outline"} onClick={guardar} disabled={!cambio || guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </Button>
        {!horarioId && <AlertTriangle className="inline w-4 h-4 ml-2 text-status-in-progress" aria-label="Sin horario" />}
      </TableCell>
    </TableRow>
  );
}
