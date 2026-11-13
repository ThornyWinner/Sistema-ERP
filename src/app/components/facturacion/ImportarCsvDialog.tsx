/**
 * ImportarCsvDialog.tsx — Importa el historial exportado de CONTPAQi Vende.
 *
 * Acepta Facturas.csv y Complementos de Pago.csv (se reconocen por sus columnas). Muestra
 * un resumen antes de importar; la BD inserta o actualiza cada CFDI por su UUID, así que
 * importar el mismo archivo dos veces no duplica nada. Los CFDI importados quedan como
 * historial de solo consulta (origen CONTPAQi).
 */
import { useState } from "react";
import { toast } from "sonner";
import { FileUp, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  importarCfdis,
  interpretarCsvContpaqi,
  type ArchivoContpaqi,
  type TipoComprobante,
} from "../../lib/facturacion";

const NOMBRE_TIPO: Record<TipoComprobante, string> = {
  I: "facturas",
  E: "notas de crédito",
  T: "traslados",
  P: "complementos de pago",
};

export default function ImportarCsvDialog({
  open,
  tipoEsperado,
  onClose,
  onImportado,
}: {
  open: boolean;
  tipoEsperado: TipoComprobante;
  onClose: () => void;
  onImportado: () => void;
}) {
  const [archivo, setArchivo] = useState<ArchivoContpaqi | null>(null);
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [avance, setAvance] = useState<number | null>(null);

  const cerrar = () => {
    if (avance !== null) return;
    setArchivo(null);
    setNombre("");
    setError(null);
    onClose();
  };

  const leer = async (f: File | undefined) => {
    setArchivo(null);
    setError(null);
    if (!f) return;
    setNombre(f.name);
    try {
      const a = interpretarCsvContpaqi(await f.text());
      if (a.tipo !== tipoEsperado) {
        setError(`El archivo contiene ${NOMBRE_TIPO[a.tipo]}; aquí se importan ${NOMBRE_TIPO[tipoEsperado]}.`);
        return;
      }
      setArchivo(a);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const importar = async () => {
    if (!archivo) return;
    setAvance(0);
    try {
      const r = await importarCfdis(archivo, setAvance);
      toast.success(
        `Importación lista: ${r.insertados} nuevos, ${r.actualizados} actualizados` +
          (r.omitidos ? `, ${r.omitidos} omitidos (sin UUID o ya timbrados en el ERP)` : "")
      );
      onImportado();
      setAvance(null);
      cerrar();
    } catch (e: any) {
      toast.error(`No se pudo importar: ${e.message}`);
      setAvance(null);
    }
  };

  const fechas = archivo?.filas.map((f) => f.fecha).filter(Boolean).sort() ?? [];
  const sinUuid = archivo?.filas.filter((f) => !f.uuid).length ?? 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && cerrar()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Importar {NOMBRE_TIPO[tipoEsperado]} de CONTPAQi</DialogTitle>
          <DialogDescription>
            Usa el CSV que descarga CONTPAQi Vende con el botón «Descarga». Se guardan como
            historial de consulta; los que ya existan se actualizan (estado y saldo).
          </DialogDescription>
        </DialogHeader>

        <label className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-border rounded-lg cursor-pointer hover:bg-secondary/50 transition-colors">
          <FileUp className="w-8 h-8 text-muted-foreground" />
          <span className="text-sm">{nombre || "Elegir archivo .csv"}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            disabled={avance !== null}
            onChange={(e) => leer(e.target.files?.[0])}
          />
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        {archivo && (
          <div className="text-sm space-y-1 bg-secondary rounded-lg p-3">
            <p>
              <strong>{archivo.filas.length}</strong> {NOMBRE_TIPO[archivo.tipo]}
              {fechas.length > 0 && (
                <> del {fechas[0].slice(0, 10)} al {fechas[fechas.length - 1].slice(0, 10)}</>
              )}
            </p>
            {sinUuid > 0 && (
              <p className="text-muted-foreground">{sinUuid} sin folio fiscal (no timbrados): se omitirán.</p>
            )}
            {avance !== null && (
              <p className="text-muted-foreground">
                Importando… {avance} de {archivo.filas.length}
              </p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={cerrar} disabled={avance !== null}>
            Cancelar
          </Button>
          <Button onClick={importar} disabled={!archivo || avance !== null}>
            {avance !== null && <Loader2 className="w-4 h-4 animate-spin" />}
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
