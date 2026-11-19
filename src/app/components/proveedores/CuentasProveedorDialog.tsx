/**
 * CuentasProveedorDialog.tsx — Cuentas bancarias de un proveedor.
 *
 * Lista las cuentas (CLABE, tarjeta o cuenta) a las que se le transfiere cuando surte
 * insumos, con botones para copiar el número o todos los datos (para pegarlos en la
 * banca en línea). El administrador primario agrega, corrige, marca la principal y
 * borra; el secundario solo consulta.
 *
 * El número se valida mientras se escribe (dígito verificador de la CLABE, Luhn de la
 * tarjeta) y el banco se sugiere con los 3 primeros dígitos de la CLABE.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, CreditCard, Landmark, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "../ui/dialog";
import type { Proveedor } from "../../data/mockData";
import { copiarTexto } from "../../lib/contacto";
import {
  TIPO_CUENTA,
  bancoDeClabe,
  cuentaVacia,
  eliminarCuentaProveedor,
  formatoNumero,
  guardarCuentaProveedor,
  soloDigitos,
  textoCuenta,
  validarNumeroCuenta,
  type CuentaCaptura,
  type CuentaProveedor,
  type TipoCuenta,
} from "../../lib/proveedoresCuentas";

const claseCampo =
  "w-full px-3 py-2 bg-input-background border border-border rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-sm";

interface Props {
  proveedor: Proveedor | null;
  cuentas: CuentaProveedor[];
  puedeEditar: boolean;
  onClose: () => void;
  /** Se llama después de guardar o borrar, para recargar las cuentas. */
  onCambio: () => void | Promise<void>;
}

/** Formulario de una cuenta (alta o edición). También lo usa ProveedorForm. */
export function CamposCuenta({
  valor,
  onChange,
  mostrarErrores,
}: {
  valor: CuentaCaptura;
  onChange: (c: CuentaCaptura) => void;
  /** Mostrar el error del número aunque no se haya terminado de escribir. */
  mostrarErrores?: boolean;
}) {
  const digitos = soloDigitos(valor.numero);
  const error = validarNumeroCuenta(valor.tipo, valor.numero);
  const largo = valor.tipo === "clabe" ? 18 : valor.tipo === "tarjeta" ? 16 : 20;
  // El error se muestra al completar los dígitos (o al intentar guardar).
  const verError = !!error && (mostrarErrores || digitos.length >= (valor.tipo === "cuenta" ? 8 : largo));

  const cambiarNumero = (texto: string) => {
    const d = soloDigitos(texto).slice(0, largo);
    const sugerido = valor.tipo === "clabe" ? bancoDeClabe(d) : undefined;
    // Se sugiere el banco mientras el usuario no haya escrito otro.
    const bancoAnterior = valor.tipo === "clabe" ? bancoDeClabe(valor.numero) : undefined;
    const banco = sugerido && (!valor.banco || valor.banco === bancoAnterior) ? sugerido : valor.banco;
    onChange({ ...valor, numero: d, banco });
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tipo de cuenta">
        {(Object.keys(TIPO_CUENTA) as TipoCuenta[]).map((t) => (
          <button
            key={t}
            type="button"
            role="radio"
            aria-checked={valor.tipo === t}
            onClick={() => onChange({ ...valor, tipo: t, numero: soloDigitos(valor.numero).slice(0, t === "clabe" ? 18 : t === "tarjeta" ? 16 : 20) })}
            className={`px-2 py-2 rounded-lg border text-xs font-medium transition-colors ${
              valor.tipo === t ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-secondary"
            }`}
          >
            {TIPO_CUENTA[t]}
          </button>
        ))}
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">
          {TIPO_CUENTA[valor.tipo]} *
        </label>
        <input
          inputMode="numeric"
          autoComplete="off"
          value={formatoNumero(valor.numero)}
          onChange={(e) => cambiarNumero(e.target.value)}
          className={`${claseCampo} font-mono tracking-wide`}
          placeholder={valor.tipo === "clabe" ? "18 dígitos" : valor.tipo === "tarjeta" ? "16 dígitos" : "8 a 20 dígitos"}
          aria-invalid={verError}
          aria-describedby="cuenta-numero-ayuda"
        />
        <p
          id="cuenta-numero-ayuda"
          className={`mt-1 text-xs ${verError ? "text-red-600 dark:text-red-400" : "text-muted-foreground"}`}
        >
          {verError
            ? error
            : !error
            ? "Número válido"
            : `${digitos.length} de ${valor.tipo === "cuenta" ? "8-20" : largo} dígitos`}
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Banco</label>
          <input
            value={valor.banco ?? ""}
            onChange={(e) => onChange({ ...valor, banco: e.target.value })}
            className={claseCampo}
            placeholder="Ej: BBVA México"
            maxLength={80}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Titular</label>
          <input
            value={valor.titular ?? ""}
            onChange={(e) => onChange({ ...valor, titular: e.target.value })}
            className={claseCampo}
            placeholder="A nombre de quién está"
            maxLength={150}
          />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Notas</label>
        <input
          value={valor.notas ?? ""}
          onChange={(e) => onChange({ ...valor, notas: e.target.value })}
          className={claseCampo}
          placeholder="Ej: Solo para pagos de tela; mandar comprobante a compras@…"
          maxLength={500}
        />
      </div>
    </div>
  );
}

export default function CuentasProveedorDialog({ proveedor, cuentas, puedeEditar, onClose, onCambio }: Props) {
  // null = viendo la lista; "nueva" o el id de la cuenta que se edita.
  const [editando, setEditando] = useState<string | null>(null);
  const [captura, setCaptura] = useState<CuentaCaptura>(cuentaVacia);
  const [intentado, setIntentado] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    setEditando(null);
    setIntentado(false);
  }, [proveedor?.id]);

  if (!proveedor) return null;
  const propias = cuentas.filter((c) => c.proveedorId === proveedor.id);

  const abrir = (c?: CuentaProveedor) => {
    setCaptura(
      c
        ? { tipo: c.tipo, numero: c.numero, banco: c.banco ?? "", titular: c.titular ?? "", principal: c.principal, notas: c.notas ?? "" }
        : { ...cuentaVacia(), titular: proveedor.nombre, principal: propias.length === 0 }
    );
    setIntentado(false);
    setEditando(c ? c.id : "nueva");
  };

  const guardar = async () => {
    setIntentado(true);
    const error = validarNumeroCuenta(captura.tipo, captura.numero);
    if (error) {
      toast.error(error);
      return;
    }
    setGuardando(true);
    try {
      await guardarCuentaProveedor(proveedor.id, captura, editando === "nueva" ? undefined : editando ?? undefined);
      toast.success(editando === "nueva" ? "Cuenta agregada" : "Cuenta actualizada");
      setEditando(null);
      await onCambio();
    } catch (e) {
      toast.error("No se pudo guardar la cuenta", { description: (e as Error).message });
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (c: CuentaProveedor) => {
    if (!window.confirm(`¿Borrar la ${TIPO_CUENTA[c.tipo].toLowerCase()} terminación ${c.numero.slice(-4)}?`)) return;
    try {
      await eliminarCuentaProveedor(c.id);
      toast.success("Cuenta borrada");
      await onCambio();
    } catch (e) {
      toast.error("No se pudo borrar la cuenta", { description: (e as Error).message });
    }
  };

  const hacerPrincipal = async (c: CuentaProveedor) => {
    try {
      await guardarCuentaProveedor(proveedor.id, { ...c, principal: true }, c.id);
      await onCambio();
    } catch (e) {
      toast.error("No se pudo cambiar la cuenta principal", { description: (e as Error).message });
    }
  };

  return (
    <Dialog open={!!proveedor} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="w-5 h-5" />
            Cuentas para transferir
          </DialogTitle>
          <DialogDescription>{proveedor.nombre}</DialogDescription>
        </DialogHeader>

        {editando ? (
          <div className="space-y-4">
            <CamposCuenta valor={captura} onChange={setCaptura} mostrarErrores={intentado} />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={captura.principal}
                onChange={(e) => setCaptura({ ...captura, principal: e.target.checked })}
                className="rounded border-border"
              />
              Usar como cuenta principal
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditando(null)}
                className="px-4 py-2 bg-secondary rounded-lg hover:bg-secondary/80 text-sm"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardar}
                disabled={guardando}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 text-sm disabled:opacity-50"
              >
                {guardando ? "Guardando..." : "Guardar cuenta"}
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            {propias.length === 0 && (
              <div className="text-center py-6 text-sm text-muted-foreground">
                <CreditCard className="w-8 h-8 mx-auto mb-2 opacity-50" />
                Este proveedor aún no tiene cuentas registradas.
              </div>
            )}
            {propias.map((c) => (
              <div key={c.id} className="p-3 border border-border rounded-lg space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                      {TIPO_CUENTA[c.tipo]}
                      {c.banco && <> · {c.banco}</>}
                      {c.principal && (
                        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-status-completed-bg text-status-completed-text">
                          <Star className="w-3 h-3 fill-current" /> Principal
                        </span>
                      )}
                    </p>
                    <p className="font-mono text-base tracking-wide break-all">{formatoNumero(c.numero)}</p>
                    <p className="text-xs text-muted-foreground">Titular: {c.titular || proveedor.nombre}</p>
                    {c.notas && <p className="text-xs text-muted-foreground mt-1">{c.notas}</p>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => copiarTexto(c.numero, "Número")}
                      className="p-2 rounded hover:bg-secondary"
                      title="Copiar número"
                      aria-label="Copiar número"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    {puedeEditar && (
                      <>
                        <button
                          type="button"
                          onClick={() => abrir(c)}
                          className="p-2 rounded hover:bg-secondary"
                          title="Editar"
                          aria-label="Editar cuenta"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => borrar(c)}
                          className="p-2 rounded hover:bg-secondary text-red-600 dark:text-red-400"
                          title="Borrar"
                          aria-label="Borrar cuenta"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => copiarTexto(textoCuenta(c, proveedor.nombre), "Datos de la cuenta")}
                    className="text-xs px-2 py-1 rounded bg-secondary hover:bg-secondary/80"
                  >
                    Copiar todos los datos
                  </button>
                  {puedeEditar && !c.principal && (
                    <button
                      type="button"
                      onClick={() => hacerPrincipal(c)}
                      className="text-xs px-2 py-1 rounded bg-secondary hover:bg-secondary/80"
                    >
                      Hacer principal
                    </button>
                  )}
                </div>
              </div>
            ))}
            {puedeEditar && (
              <button
                type="button"
                onClick={() => abrir()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-dashed border-border rounded-lg hover:bg-secondary text-sm"
              >
                <Plus className="w-4 h-4" />
                Agregar cuenta
              </button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
