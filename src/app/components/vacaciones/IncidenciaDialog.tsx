/**
 * IncidenciaDialog.tsx — Registra una incidencia de asistencia o disciplinaria:
 * retardo, falta (justificada o no), incapacidad, permiso o suspensión.
 *
 * Valida lo mismo que la base de datos: un retardo es de un solo día con minutos, y
 * una suspensión no pasa de 8 días (Art. 423 fr. X).
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Info } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { hoyISO } from "../../lib/fechas";
import { tipoIncidenciaInfo, type TipoIncidencia } from "../../lib/laboral";
import type { Empleado } from "../../lib/vacaciones";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";

interface IncidenciaDialogProps {
  empleado: Empleado | null;
  onClose: () => void;
  onSaved: () => void;
}

const claseCampo =
  "w-full px-3 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export default function IncidenciaDialog({ empleado, onClose, onSaved }: IncidenciaDialogProps) {
  const [tipo, setTipo] = useState<TipoIncidencia>("falta_injustificada");
  const [inicio, setInicio] = useState(hoyISO());
  const [fin, setFin] = useState(hoyISO());
  const [minutos, setMinutos] = useState("");
  const [motivo, setMotivo] = useState("");
  const [acta, setActa] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!empleado) return;
    setTipo("falta_injustificada");
    setInicio(hoyISO());
    setFin(hoyISO());
    setMinutos("");
    setMotivo("");
    setActa(false);
  }, [empleado]);

  const esRetardo = tipo === "retardo";
  const finEfectivo = esRetardo ? inicio : fin;
  const diasNaturales =
    inicio && finEfectivo && finEfectivo >= inicio
      ? Math.round((new Date(`${finEfectivo}T00:00:00`).getTime() - new Date(`${inicio}T00:00:00`).getTime()) / 86_400_000) + 1
      : 0;

  const problema = !inicio
    ? "Indica la fecha"
    : empleado && inicio < empleado.fecha_ingreso
    ? "La fecha es anterior al ingreso del empleado"
    : finEfectivo < inicio
    ? "La fecha final es anterior a la inicial"
    : esRetardo && !(Number(minutos) > 0)
    ? "Indica los minutos de retardo"
    : tipo === "suspension" && diasNaturales > 8
    ? "La suspensión disciplinaria no puede exceder 8 días (Art. 423 fr. X)"
    : null;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empleado || problema) return;
    setGuardando(true);
    const { error } = await supabase.from("incidencias").insert({
      empleado_id: empleado.id,
      tipo,
      fecha_inicio: inicio,
      fecha_fin: finEfectivo,
      minutos_retardo: esRetardo ? Number(minutos) : null,
      motivo: motivo.trim() || null,
      acta_administrativa: acta,
    });
    setGuardando(false);
    if (error) {
      toast.error("No se pudo registrar la incidencia", { description: error.message });
      return;
    }
    toast.success("Incidencia registrada");
    onSaved();
    onClose();
  };

  return (
    <Dialog open={!!empleado} onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Registrar incidencia</DialogTitle>
          <DialogDescription>{empleado?.nombre}</DialogDescription>
        </DialogHeader>
        <form onSubmit={guardar} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="inc-tipo">Tipo *</Label>
            <select id="inc-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoIncidencia)} className={claseCampo}>
              {Object.entries(tipoIncidenciaInfo).map(([clave, info]) => (
                <option key={clave} value={clave}>
                  {info.texto}
                </option>
              ))}
            </select>
            <p className="flex gap-2 text-xs text-muted-foreground">
              <Info className="w-4 h-4 shrink-0" />
              {tipoIncidenciaInfo[tipo].ayuda}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="inc-inicio">{esRetardo ? "Fecha *" : "Desde *"}</Label>
              <Input id="inc-inicio" type="date" required min={empleado?.fecha_ingreso} value={inicio} onChange={(e) => setInicio(e.target.value)} />
            </div>
            {esRetardo ? (
              <div className="space-y-2">
                <Label htmlFor="inc-minutos">Minutos de retardo *</Label>
                <Input id="inc-minutos" type="number" min="1" required value={minutos} onChange={(e) => setMinutos(e.target.value)} />
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="inc-fin">Hasta *</Label>
                <Input id="inc-fin" type="date" required min={inicio} value={fin} onChange={(e) => setFin(e.target.value)} />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="inc-motivo">Motivo / observaciones</Label>
            <textarea id="inc-motivo" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={claseCampo} />
          </div>

          {(tipo === "falta_injustificada" || tipo === "retardo" || tipo === "suspension") && (
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={acta} onChange={(e) => setActa(e.target.checked)} className="w-4 h-4 mt-0.5" />
              <span>
                Se levantó acta administrativa
                <span className="block text-xs text-muted-foreground">
                  Con la firma del trabajador y dos testigos; es la prueba de la incidencia ante una demanda (Art. 784 fr. III).
                  Adjúntala en la pestaña Expediente.
                </span>
              </span>
            </label>
          )}

          {problema && <p className="text-sm text-red-600 dark:text-red-400 font-medium">{problema}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={guardando || !!problema}>
              {guardando ? "Guardando…" : "Registrar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
