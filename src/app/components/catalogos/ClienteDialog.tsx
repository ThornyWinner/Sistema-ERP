/**
 * ClienteDialog.tsx — Alta y edición de un cliente con sus datos fiscales (CFDI 4.0).
 * Secciones como en CONTPAQi Vende: Información general y Datos de cliente
 * (método/forma de pago, uso de CFDI y crédito predeterminados para facturar).
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import {
  CP_REGEX,
  FORMAS_PAGO,
  METODOS_PAGO,
  REGIMENES_FISCALES,
  RFC_REGEX,
  USOS_CFDI,
  etiquetaSat,
  type OpcionSat,
} from "../../lib/sat";

export interface ClienteCatalogo {
  id: string;
  razon_social: string;
  nombre_comercial: string | null;
  rfc: string | null;
  regimen_fiscal: string | null;
  codigo_postal: string | null;
  uso_cfdi: string | null;
  email: string | null;
  email_cc: string | null;
  telefono: string | null;
  contacto: string | null;
  direccion: string | null;
  metodo_pago_cfdi: string | null;
  forma_pago_cfdi: string | null;
  dias_credito: number | null;
  limite_credito: number | null;
  notas: string | null;
}

const CLASE_SELECT =
  "h-9 w-full rounded-md border border-input bg-input-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

type Form = Record<keyof Omit<ClienteCatalogo, "id">, string>;
const VACIO: Form = {
  razon_social: "",
  nombre_comercial: "",
  rfc: "",
  regimen_fiscal: "",
  codigo_postal: "",
  uso_cfdi: "G03",
  email: "",
  email_cc: "",
  telefono: "",
  contacto: "",
  direccion: "",
  metodo_pago_cfdi: "",
  forma_pago_cfdi: "",
  dias_credito: "",
  limite_credito: "",
  notas: "",
};

function SelectSat({ value, onChange, opciones }: { value: string; onChange: (v: string) => void; opciones: OpcionSat[] }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={CLASE_SELECT}>
      <option value="">Selecciona…</option>
      {opciones.map((o) => (
        <option key={o.clave} value={o.clave}>
          {etiquetaSat(o)}
        </option>
      ))}
    </select>
  );
}

export default function ClienteDialog({
  open,
  cliente,
  soloLectura,
  onClose,
  onGuardado,
}: {
  open: boolean;
  /** null = alta. */
  cliente: ClienteCatalogo | null;
  soloLectura?: boolean;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [f, setF] = useState<Form>(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setF(
      cliente
        ? (Object.fromEntries(
            Object.keys(VACIO).map((k) => [k, (cliente as any)[k] == null ? "" : String((cliente as any)[k])])
          ) as Form)
        : VACIO
    );
  }, [open, cliente]);

  const set = (k: keyof Form) => (v: string) => setF((x) => ({ ...x, [k]: v }));
  const input = (k: keyof Form) => ({ value: f[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(k)(e.target.value) });

  const guardar = async () => {
    const rfc = f.rfc.trim().toUpperCase();
    if (!f.razon_social.trim()) return setError("La razón social es obligatoria");
    if (rfc && !RFC_REGEX.test(rfc)) return setError("RFC no válido: 12 caracteres (moral) o 13 (física), sin guiones ni espacios");
    if (rfc && !f.regimen_fiscal) return setError("Con RFC indica el régimen fiscal (de su constancia de situación fiscal)");
    if (f.codigo_postal && !CP_REGEX.test(f.codigo_postal)) return setError("El código postal lleva 5 dígitos");
    if (rfc && !f.codigo_postal) return setError("Con RFC indica el código postal fiscal");
    if (f.metodo_pago_cfdi === "PPD" && f.forma_pago_cfdi && f.forma_pago_cfdi !== "99")
      return setError("Con PPD la forma de pago debe ser 99 - Por definir");

    const num = (s: string) => (s.trim() === "" ? null : Number(s));
    const txt = (s: string) => (s.trim() === "" ? null : s.trim());
    const fila = {
      razon_social: f.razon_social.trim().toUpperCase(),
      nombre_comercial: txt(f.nombre_comercial),
      rfc: rfc || null,
      regimen_fiscal: txt(f.regimen_fiscal),
      codigo_postal: txt(f.codigo_postal),
      uso_cfdi: txt(f.uso_cfdi),
      email: txt(f.email),
      email_cc: txt(f.email_cc),
      telefono: txt(f.telefono),
      contacto: txt(f.contacto),
      direccion: txt(f.direccion),
      metodo_pago_cfdi: txt(f.metodo_pago_cfdi),
      forma_pago_cfdi: f.metodo_pago_cfdi === "PPD" ? "99" : txt(f.forma_pago_cfdi),
      dias_credito: num(f.dias_credito),
      limite_credito: num(f.limite_credito),
      notas: txt(f.notas),
    };
    setGuardando(true);
    const { error: e } = cliente
      ? await supabase.from("clientes").update(fila).eq("id", cliente.id)
      : await supabase.from("clientes").insert(fila);
    setGuardando(false);
    if (e) {
      setError(e.code === "23505" ? "Ya existe un cliente con ese RFC" : e.message);
      return;
    }
    toast.success(cliente ? "Cliente actualizado" : "Cliente creado");
    onGuardado();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !guardando && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{cliente ? (soloLectura ? "Cliente" : "Editar cliente") : "Nuevo cliente"}</DialogTitle>
          <DialogDescription>
            Los datos fiscales deben coincidir con la constancia de situación fiscal del cliente.
          </DialogDescription>
        </DialogHeader>

        <fieldset disabled={soloLectura || guardando} className="space-y-6">
          <section className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Información general</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 space-y-1.5">
                <Label>
                  Razón social<span className="text-destructive">*</span>
                </Label>
                <Input {...input("razon_social")} placeholder="Sin régimen societario (sin S.A. de C.V.)" />
              </div>
              <div className="space-y-1.5">
                <Label>RFC</Label>
                <Input value={f.rfc} onChange={(e) => set("rfc")(e.target.value.toUpperCase().trim())} maxLength={13} />
              </div>
              <div className="space-y-1.5">
                <Label>Nombre comercial</Label>
                <Input {...input("nombre_comercial")} />
              </div>
              <div className="space-y-1.5">
                <Label>Régimen fiscal</Label>
                <SelectSat value={f.regimen_fiscal} onChange={set("regimen_fiscal")} opciones={REGIMENES_FISCALES} />
              </div>
              <div className="space-y-1.5">
                <Label>Código postal fiscal</Label>
                <Input value={f.codigo_postal} onChange={(e) => set("codigo_postal")(e.target.value.replace(/\D/g, ""))} maxLength={5} inputMode="numeric" />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Domicilio</Label>
                <Input {...input("direccion")} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" {...input("email")} />
              </div>
              <div className="space-y-1.5">
                <Label>Email CC</Label>
                <Input {...input("email_cc")} placeholder="Separa varios con coma" />
              </div>
              <div className="space-y-1.5">
                <Label>Teléfono</Label>
                <Input type="tel" {...input("telefono")} />
              </div>
              <div className="space-y-1.5">
                <Label>Persona de contacto</Label>
                <Input {...input("contacto")} />
              </div>
            </div>
          </section>

          <section className="space-y-4 border-t border-border pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Datos de cliente (para facturar)</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Método de pago</Label>
                <SelectSat value={f.metodo_pago_cfdi} onChange={set("metodo_pago_cfdi")} opciones={METODOS_PAGO} />
              </div>
              <div className="space-y-1.5">
                <Label>Forma de pago</Label>
                {f.metodo_pago_cfdi === "PPD" ? (
                  <Input readOnly value="99 - Por definir" />
                ) : (
                  <SelectSat value={f.forma_pago_cfdi} onChange={set("forma_pago_cfdi")} opciones={FORMAS_PAGO} />
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Uso de CFDI</Label>
                <SelectSat value={f.uso_cfdi} onChange={set("uso_cfdi")} opciones={USOS_CFDI} />
              </div>
              <div className="space-y-1.5">
                <Label>Días de crédito</Label>
                <Input type="number" min="0" step="1" {...input("dias_credito")} />
              </div>
              <div className="space-y-1.5">
                <Label>Límite de crédito (MXN)</Label>
                <Input type="number" min="0" step="0.01" {...input("limite_credito")} />
              </div>
              <div className="sm:col-span-2 space-y-1.5">
                <Label>Notas</Label>
                <Input {...input("notas")} />
              </div>
            </div>
          </section>
        </fieldset>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cerrar
          </Button>
          {!soloLectura && (
            <Button onClick={guardar} disabled={guardando}>
              {guardando && <Loader2 className="animate-spin" />}
              {cliente ? "Guardar cambios" : "Crear cliente"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
