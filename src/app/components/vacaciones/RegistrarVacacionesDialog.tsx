/**
 * RegistrarVacacionesDialog.tsx — Registra un periodo de vacaciones de un empleado.
 *
 * Se elige el año de servicio que cubren (por defecto el más antiguo con días
 * pendientes) y las fechas. El sistema calcula los días laborables (lunes a sábado,
 * sin descansos obligatorios) y la prima vacacional, y no deja guardar si se exceden
 * los días pendientes o si empiezan antes del aniversario correspondiente.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { formatFecha } from "../../lib/fechas";
import {
  calcularPrima,
  contarDiasLaborables,
  type Empleado,
  type Periodo,
} from "../../lib/vacaciones";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";

interface RegistrarVacacionesDialogProps {
  /** Empleado al que se le registran, o null si el diálogo está cerrado. */
  empleado: Empleado | null;
  /** Años de servicio del empleado (de periodosDe). */
  periodos: Periodo[];
  onClose: () => void;
  onSaved: () => void;
}

/** Mensaje entendible para los errores que devuelve la base de datos. */
export function mensajeErrorVacaciones(error: { code?: string; message: string }): string {
  if (error.code === "23P01") return "Esas fechas se traslapan con otras vacaciones del empleado";
  return error.message;
}

const claseCampo =
  "w-full px-3 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export default function RegistrarVacacionesDialog({ empleado, periodos, onClose, onSaved }: RegistrarVacacionesDialogProps) {
  // Solo se pueden registrar días de años con pendientes que no hayan prescrito.
  const disponibles = periodos.filter((p) => p.pendientes > 0 && p.estado !== "prescrito");
  const [anio, setAnio] = useState<number | null>(null);
  const [inicio, setInicio] = useState("");
  const [fin, setFin] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Al abrir: año más antiguo con pendientes y campos vacíos.
  useEffect(() => {
    if (!empleado) return;
    setAnio(disponibles[0]?.anio ?? null);
    setInicio("");
    setFin("");
    setNotas("");
  }, [empleado]);

  const periodo = disponibles.find((p) => p.anio === anio);
  const dias = inicio && fin ? contarDiasLaborables(inicio, fin) : 0;
  const naturales = inicio && fin && fin >= inicio ? contarDiasNaturales(inicio, fin) : 0;
  const prima = empleado ? calcularPrima(Number(empleado.salario_diario), dias, Number(empleado.porcentaje_prima)) : 0;

  // Primer problema que impide guardar, o null si todo está bien.
  const problema = !periodo
    ? "Elige el año de servicio"
    : !inicio || !fin
    ? null
    : fin < inicio
    ? "La fecha final es anterior a la inicial"
    : inicio < periodo.aniversario
    ? `Las vacaciones del año ${periodo.anio} se pueden tomar a partir del ${formatFecha(periodo.aniversario)}`
    : dias === 0
    ? "El periodo no incluye días laborables"
    : dias > periodo.pendientes
    ? `Son ${dias} días laborables y solo quedan ${periodo.pendientes} de este año`
    : null;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empleado || !periodo || problema || dias === 0) return;
    setGuardando(true);
    const { error } = await supabase.from("vacaciones").insert({
      empleado_id: empleado.id,
      anio_servicio: periodo.anio,
      fecha_inicio: inicio,
      fecha_fin: fin,
      dias,
      prima_vacacional: prima,
      notas: notas.trim() || null,
    });
    setGuardando(false);
    if (error) {
      toast.error("No se pudieron registrar las vacaciones", { description: mensajeErrorVacaciones(error) });
      return;
    }
    toast.success("Vacaciones registradas", { description: `${empleado.nombre}: ${dias} días` });
    onSaved();
    onClose();
  };

  return (
    <Dialog open={!!empleado} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Registrar vacaciones</DialogTitle>
          <DialogDescription>{empleado?.nombre}</DialogDescription>
        </DialogHeader>

        {disponibles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No tiene días pendientes: aún no cumple un año de servicio o ya disfrutó todos los días que le corresponden.
          </p>
        ) : (
          <form onSubmit={guardar} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="vac-anio">Año de servicio *</Label>
              <select id="vac-anio" value={anio ?? ""} onChange={(e) => setAnio(Number(e.target.value))} className={claseCampo}>
                {disponibles.map((p) => (
                  <option key={p.anio} value={p.anio}>
                    Año {p.anio} — {p.pendientes} de {p.derecho} días pendientes (desde {formatFecha(p.aniversario)})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="vac-inicio">Desde *</Label>
                <Input id="vac-inicio" type="date" required min={periodo?.aniversario} value={inicio} onChange={(e) => setInicio(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vac-fin">Hasta *</Label>
                <Input id="vac-fin" type="date" required min={inicio || periodo?.aniversario} value={fin} onChange={(e) => setFin(e.target.value)} />
              </div>
            </div>

            {/* Resultado del cálculo */}
            <div className="grid grid-cols-2 gap-4 p-4 bg-secondary rounded-lg">
              <div>
                <p className="text-sm text-muted-foreground">Días de vacaciones</p>
                <p className="text-2xl font-semibold">{dias}</p>
                {naturales > dias && (
                  <p className="text-xs text-muted-foreground">
                    {naturales - dias} domingos o días de descanso obligatorio no cuentan
                  </p>
                )}
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Prima vacacional ({Number(empleado?.porcentaje_prima ?? 25)} %)</p>
                <p className="text-2xl font-semibold text-primary">${prima.toLocaleString("es-MX", { minimumFractionDigits: 2 })}</p>
              </div>
            </div>

            {problema && <p className="text-sm text-red-600 dark:text-red-400 font-medium">{problema}</p>}

            {periodo && periodo.tomados === 0 && dias > 0 && dias < Math.min(12, periodo.derecho) && (
              <p className="flex gap-2 text-xs text-muted-foreground">
                <Info className="w-4 h-4 shrink-0" />
                La LFT (Art. 78) indica que al menos 12 días se disfrutan de forma continua, salvo que el trabajador
                decida dividirlos.
              </p>
            )}

            <div className="space-y-2">
              <Label htmlFor="vac-notas">Notas</Label>
              <textarea id="vac-notas" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} className={claseCampo} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardando || !!problema || dias === 0}>
                {guardando ? "Guardando…" : "Registrar"}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** Días naturales entre dos fechas "AAAA-MM-DD", inclusive. */
function contarDiasNaturales(inicio: string, fin: string): number {
  const a = new Date(`${inicio}T00:00:00`);
  const b = new Date(`${fin}T00:00:00`);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000) + 1;
}
