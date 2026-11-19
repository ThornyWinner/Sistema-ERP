/**
 * RegistrarContactoDialog.tsx — Anotar un seguimiento al cliente (CRM ligero): por qué
 * medio, qué respondió, notas y cuándo volver a buscarlo.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "../../context/AuthContext";
import {
  CANAL_CONTACTO,
  RESULTADO_CONTACTO,
  enDias,
  registrarContacto,
  type CanalContacto,
  type ResultadoContacto,
} from "../../lib/clientesCrm";
import { hoyISO } from "../../lib/fechas";
import { Button } from "../ui/button";
import { Label } from "../ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../ui/dialog";

const CLASE_CAMPO =
  "w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

const ATAJOS = [
  { texto: "1 semana", dias: 7 },
  { texto: "1 mes", dias: 30 },
  { texto: "3 meses", dias: 90 },
  { texto: "6 meses", dias: 180 },
];

export default function RegistrarContactoDialog({
  cliente,
  canalInicial,
  onClose,
  onGuardado,
}: {
  /** Cliente a quien se contactó; null = cerrado. */
  cliente: { id: string; nombre: string } | null;
  canalInicial?: CanalContacto;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const { user } = useAuth();
  const [canal, setCanal] = useState<CanalContacto>("whatsapp");
  const [resultado, setResultado] = useState<ResultadoContacto>("interesado");
  const [notas, setNotas] = useState("");
  const [proximo, setProximo] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!cliente) return;
    setCanal(canalInicial ?? "whatsapp");
    setResultado("sin_respuesta");
    setNotas("");
    setProximo(enDias(7));
  }, [cliente, canalInicial]);

  const guardar = async () => {
    if (!cliente || !user) return;
    setGuardando(true);
    try {
      await registrarContacto(cliente.id, user.id, { canal, resultado, notas, proximoContacto: proximo || undefined });
      toast.success("Seguimiento registrado");
      onGuardado();
    } catch (err: any) {
      toast.error("No se pudo registrar el seguimiento", { description: err?.message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={!!cliente} onOpenChange={(v) => !v && !guardando && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar seguimiento</DialogTitle>
          <DialogDescription>{cliente?.nombre}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="contacto-canal">Medio</Label>
              <select id="contacto-canal" className={CLASE_CAMPO} value={canal} onChange={(e) => setCanal(e.target.value as CanalContacto)}>
                {Object.entries(CANAL_CONTACTO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contacto-resultado">Resultado</Label>
              <select
                id="contacto-resultado"
                className={CLASE_CAMPO}
                value={resultado}
                onChange={(e) => setResultado(e.target.value as ResultadoContacto)}
              >
                {Object.entries(RESULTADO_CONTACTO).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.texto}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contacto-notas">Notas</Label>
            <textarea
              id="contacto-notas"
              rows={3}
              maxLength={2000}
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Qué le interesa, para cuándo, quién decide…"
              className={CLASE_CAMPO}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="contacto-proximo">Volver a contactar el</Label>
            <input
              id="contacto-proximo"
              type="date"
              min={hoyISO()}
              value={proximo}
              onChange={(e) => setProximo(e.target.value)}
              className={CLASE_CAMPO}
            />
            <div className="flex flex-wrap gap-2">
              {ATAJOS.map((a) => (
                <button
                  key={a.dias}
                  type="button"
                  onClick={() => setProximo(enDias(a.dias))}
                  className="rounded-full bg-secondary px-3 py-1 text-xs hover:bg-secondary/70"
                >
                  {a.texto}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setProximo("")}
                className="rounded-full bg-secondary px-3 py-1 text-xs hover:bg-secondary/70"
              >
                Sin fecha
              </button>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
