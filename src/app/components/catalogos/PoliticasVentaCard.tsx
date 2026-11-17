/**
 * PoliticasVentaCard.tsx — El administrador primario fija el tope de descuento para
 * vendedores y admin secundario (tabla politicas_venta, sql/politicas_venta.sql).
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Percent } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { guardarDescuentoMaximo, obtenerDescuentoMaximo } from "../../lib/politicasVenta";
import { Card, CardContent } from "../Card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";

export default function PoliticasVentaCard() {
  const { user } = useAuth();
  const [actual, setActual] = useState<number | null>(null);
  const [valor, setValor] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    obtenerDescuentoMaximo().then((pct) => {
      setActual(pct);
      setValor(String(pct));
    });
  }, []);

  const numero = Number(valor);
  const valido = valor.trim() !== "" && numero >= 0 && numero <= 100;
  const cambio = valido && numero !== actual;

  const guardar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cambio) return;
    setGuardando(true);
    try {
      await guardarDescuentoMaximo(numero, user?.id);
      setActual(numero);
      toast.success(`Descuento máximo para vendedores: ${numero} %`);
    } catch (err: any) {
      toast.error("No se pudo guardar", { description: err?.message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card>
      <CardContent className="p-4">
        <form onSubmit={guardar} className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[240px]">
            <p className="font-medium flex items-center gap-2">
              <Percent className="w-4 h-4 text-primary" /> Políticas de venta
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Vendedores y admin secundario no pueden pasar este descuento ni el límite de crédito de cada cliente
              (se asigna al editar el cliente). Tú puedes autorizar excepciones guardando la orden.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pv-descuento">Descuento máximo (% del subtotal)</Label>
            <Input
              id="pv-descuento"
              type="number"
              min="0"
              max="100"
              step="0.5"
              className="w-40"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              aria-invalid={!valido}
              disabled={actual === null}
            />
          </div>
          <Button type="submit" disabled={!cambio || guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
