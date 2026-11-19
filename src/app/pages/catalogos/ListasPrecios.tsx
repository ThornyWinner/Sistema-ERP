/**
 * ListasPrecios.tsx — Mayoreo y precios especiales por cliente (ruta /catalogos/precios).
 *
 *  - Mayoreo general: % de descuento a partir de N piezas, para todo producto sin escala propia.
 *  - Mayoreo por producto: escalas propias que reemplazan a la general.
 *  - Precios por cliente: % en todos sus productos, o % / precio fijo de un producto, con
 *    vigencia opcional.
 *  - Simulador: precio que tomarían los formularios para un cliente, producto y cantidad.
 *
 * Edita solo el admin primario; admin secundario y vendedores consultan (sql/listas_precios.sql).
 * Los formularios de orden, cotización y venta rápida aplican estas reglas (listasPrecios.ts).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Calculator, Layers, Pencil, Plus, Search, Tag, Trash2, Users, X } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useErpData } from "../../context/ErpDataContext";
import type { Producto } from "../../data/mockData";
import { supabase } from "../../lib/supabase";
import { formatMonto } from "../../lib/pagos";
import { formatFecha, hoyISO } from "../../lib/fechas";
import {
  LISTAS_VACIAS,
  cargarListasPrecios,
  eliminarPrecioCliente,
  escalasDe,
  guardarEscalas,
  guardarPrecioCliente,
  precioSugerido,
  textoCondicion,
  textoEscalas,
  type ListasPrecios as Listas,
  type PrecioCliente,
} from "../../lib/listasPrecios";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/Card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { useBusquedaUrl } from "../../hooks/useBusquedaUrl";
import { Label } from "../../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../components/ui/dialog";

interface ClienteMin {
  id: string;
  razonSocial: string;
}

export default function ListasPrecios() {
  const { user } = useAuth();
  const { productos } = useErpData();
  const puedeEditar = user?.rol === "admin_primario";

  const [listas, setListas] = useState<Listas>(LISTAS_VACIAS);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [clientes, setClientes] = useState<ClienteMin[]>([]);
  // Editor de escalas: undefined = cerrado; null = generales; id = de ese producto.
  const [editandoEscalas, setEditandoEscalas] = useState<string | null | undefined>(undefined);
  const [eligiendoProducto, setEligiendoProducto] = useState(false);
  const [editandoPrecio, setEditandoPrecio] = useState<PrecioCliente | "nuevo" | null>(null);
  const [borrando, setBorrando] = useState<PrecioCliente | null>(null);
  // Filtro de precios especiales (también llega desde el buscador global con ?q=).
  const [busqueda, setBusqueda] = useBusquedaUrl();

  const cargar = useCallback(async () => {
    try {
      setErrorCarga(null);
      setListas(await cargarListasPrecios());
    } catch (err: any) {
      setErrorCarga(err?.message ?? "Error desconocido");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
    supabase
      .from("clientes")
      .select("id,razon_social")
      .order("razon_social")
      .then(({ data }) => setClientes((data ?? []).map((c: any) => ({ id: c.id, razonSocial: c.razon_social }))));
  }, [cargar]);

  const nombreProducto = useMemo(() => new Map(productos.map((p) => [p.id, p.nombre])), [productos]);
  const generales = escalasDe(listas.escalas, null);
  const productosConEscala = useMemo(() => {
    const ids = [...new Set(listas.escalas.filter((e) => e.productoId).map((e) => e.productoId!))];
    return ids
      .map((id) => ({ id, nombre: nombreProducto.get(id) ?? "Producto", escalas: escalasDe(listas.escalas, id) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
  }, [listas.escalas, nombreProducto]);

  const confirmarBorrado = async () => {
    if (!borrando) return;
    try {
      await eliminarPrecioCliente(borrando.id);
      toast.success("Condición eliminada");
      setBorrando(null);
      cargar();
    } catch (err: any) {
      toast.error("No se pudo eliminar", { description: err?.message });
    }
  };

  const hoy = hoyISO();
  const qPrecios = busqueda.trim().toLowerCase();
  const preciosVisibles = [...listas.preciosCliente]
    .filter(
      (p) =>
        !qPrecios ||
        [p.cliente, p.producto ?? "todos los productos", p.notas].some((v) => v?.toLowerCase().includes(qPrecios))
    )
    .sort((a, b) => a.cliente.localeCompare(b.cliente, "es") || (a.producto ?? "").localeCompare(b.producto ?? "", "es"));

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1>Listas de precios</h1>
        <p className="text-muted-foreground mt-1">
          Mayoreo y precios especiales por cliente. Las órdenes, cotizaciones y ventas rápidas los aplican al capturar.
          {!puedeEditar && " Solo el administrador primario los modifica."}
        </p>
      </div>

      {errorCarga && (
        <Card>
          <CardContent className="p-4 text-sm">
            <p className="font-medium text-status-pending">No se pudieron cargar las listas de precios.</p>
            <p className="text-muted-foreground mt-1">
              Verifica que sql/listas_precios.sql esté aplicado en la base de datos. Detalle: {errorCarga}
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-4 text-sm text-muted-foreground space-y-1">
          <p className="font-medium text-foreground">¿Cómo se calcula el precio?</p>
          <p>
            1. Si el cliente tiene <b>precio fijo</b> para el producto, se usa ese. 2. Si no, se aplica el <b>mayor</b>{" "}
            descuento entre el del cliente y el de mayoreo (no se acumulan). El mayoreo cuenta todas las piezas del mismo
            producto en la orden, aunque sean de tallas distintas. Los descuentos se aplican sobre el precio de cada talla.
          </p>
        </CardContent>
      </Card>

      <Simulador listas={listas} productos={productos} clientes={clientes} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Mayoreo general */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" /> Mayoreo general
            </CardTitle>
            {puedeEditar && (
              <Button size="sm" variant="outline" onClick={() => setEditandoEscalas(null)} className="gap-2">
                <Pencil className="w-4 h-4" /> Editar
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {cargando ? (
              <p className="text-sm text-muted-foreground">Cargando…</p>
            ) : generales.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin escala general: no hay descuento por volumen.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {generales.map((e) => (
                  <span key={e.id} className="rounded-full bg-primary/10 text-primary px-3 py-1 text-sm font-medium">
                    {e.cantidadMin}+ pzs · −{e.descuentoPct} %
                  </span>
                ))}
              </div>
            )}
            <p className="mt-3 text-xs text-muted-foreground">Aplica a todo producto que no tenga escala propia.</p>
          </CardContent>
        </Card>

        {/* Mayoreo por producto */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <Tag className="w-5 h-5 text-primary" /> Mayoreo por producto
            </CardTitle>
            {puedeEditar && (
              <Button size="sm" variant="outline" onClick={() => setEligiendoProducto(true)} className="gap-2">
                <Plus className="w-4 h-4" /> Producto
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {productosConEscala.length === 0 ? (
              <p className="text-sm text-muted-foreground">Ningún producto tiene escala propia.</p>
            ) : (
              <div className="space-y-2">
                {productosConEscala.map((p) => (
                  <div key={p.id} className="flex items-center justify-between gap-3 rounded-lg bg-secondary p-3">
                    <div className="min-w-0">
                      <p className="font-medium truncate">{p.nombre}</p>
                      <p className="text-xs text-muted-foreground">{textoEscalas(p.escalas)}</p>
                    </div>
                    {puedeEditar && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Editar mayoreo de ${p.nombre}`}
                        onClick={() => setEditandoEscalas(p.id)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Precios especiales por cliente */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5 text-primary" /> Precios especiales por cliente
          </CardTitle>
          {puedeEditar && (
            <Button size="sm" onClick={() => setEditandoPrecio("nuevo")} className="gap-2">
              <Plus className="w-4 h-4" /> Nueva condición
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar cliente, producto o nota..."
              className="pl-9"
              aria-label="Buscar precios especiales"
            />
          </div>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Aplica a</TableHead>
                  <TableHead>Condición</TableHead>
                  <TableHead>Vigencia</TableHead>
                  <TableHead>Notas</TableHead>
                  {puedeEditar && <TableHead className="w-24" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {preciosVisibles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-10 text-center text-muted-foreground">
                      {cargando
                        ? "Cargando…"
                        : qPrecios
                        ? `Ninguna condición coincide con "${busqueda.trim()}"`
                        : "Ningún cliente tiene precios especiales"}
                    </TableCell>
                  </TableRow>
                ) : (
                  preciosVisibles.map((p) => {
                      const vencida = !!p.vigenteHasta && p.vigenteHasta < hoy;
                      return (
                        <TableRow key={p.id} className={vencida ? "opacity-60" : undefined}>
                          <TableCell className="font-medium">{p.cliente}</TableCell>
                          <TableCell>{p.productoId ? p.producto ?? "Producto" : "Todos los productos"}</TableCell>
                          <TableCell className="whitespace-nowrap font-medium">{textoCondicion(p)}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {p.vigenteHasta ? (
                              <span className={vencida ? "text-status-pending" : undefined}>
                                {vencida ? "Venció " : "Hasta "}
                                {formatFecha(p.vigenteHasta)}
                              </span>
                            ) : (
                              <span className="text-muted-foreground">Sin vencimiento</span>
                            )}
                          </TableCell>
                          <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">{p.notas ?? "—"}</TableCell>
                          {puedeEditar && (
                            <TableCell>
                              <div className="flex justify-end gap-1">
                                <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setEditandoPrecio(p)}>
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon" aria-label="Eliminar" onClick={() => setBorrando(p)}>
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <EscalasDialog
        productoId={editandoEscalas}
        nombre={editandoEscalas ? nombreProducto.get(editandoEscalas) ?? "Producto" : "Mayoreo general"}
        actuales={editandoEscalas === undefined ? [] : listas.escalas.filter((e) => e.productoId === editandoEscalas)}
        onClose={() => setEditandoEscalas(undefined)}
        onGuardado={() => {
          setEditandoEscalas(undefined);
          cargar();
        }}
      />

      <Dialog open={eligiendoProducto} onOpenChange={setEligiendoProducto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Mayoreo de un producto</DialogTitle>
            <DialogDescription>Elige el producto; sus escalas reemplazarán a la general.</DialogDescription>
          </DialogHeader>
          <SelectorProducto
            productos={productos}
            valor={null}
            onElegir={(id) => {
              setEligiendoProducto(false);
              setEditandoEscalas(id);
            }}
          />
        </DialogContent>
      </Dialog>

      <PrecioClienteDialog
        fila={editandoPrecio}
        clientes={clientes}
        productos={productos}
        onClose={() => setEditandoPrecio(null)}
        onGuardado={() => {
          setEditandoPrecio(null);
          cargar();
        }}
      />

      <Dialog open={!!borrando} onOpenChange={(o) => !o && setBorrando(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Eliminar la condición?</DialogTitle>
            <DialogDescription>
              {borrando &&
                `${borrando.cliente}: ${textoCondicion(borrando)} en ${borrando.producto ?? "todos los productos"}. Las órdenes ya capturadas no cambian.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBorrando(null)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmarBorrado}>
              Eliminar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Buscador de producto del catálogo. */
function SelectorProducto({
  productos,
  valor,
  onElegir,
}: {
  productos: Producto[];
  valor: string | null;
  onElegir: (id: string) => void;
}) {
  const [texto, setTexto] = useState("");
  const q = texto.trim().toLowerCase();
  const elegido = valor ? productos.find((p) => p.id === valor) : undefined;
  const opciones = q
    ? productos.filter((p) => p.nombre.toLowerCase().includes(q)).slice(0, 8)
    : productos.slice(0, 8);
  return (
    <div className="space-y-2">
      {elegido && <p className="text-sm">Elegido: <b>{elegido.nombre}</b></p>}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar producto…"
          className="pl-9"
          aria-label="Buscar producto"
        />
      </div>
      <div className="max-h-56 overflow-y-auto rounded-md border border-border divide-y divide-border">
        {opciones.length === 0 ? (
          <p className="p-3 text-sm text-muted-foreground">Ningún producto coincide</p>
        ) : (
          opciones.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onElegir(p.id)}
              className={`w-full flex items-center justify-between gap-3 p-2.5 text-left text-sm hover:bg-secondary ${
                p.id === valor ? "bg-primary/5" : ""
              }`}
            >
              <span className="truncate">{p.nombre}</span>
              <span className="text-muted-foreground shrink-0">{formatMonto(p.precio)}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

/** Editor de escalas (generales o de un producto). */
function EscalasDialog({
  productoId,
  nombre,
  actuales,
  onClose,
  onGuardado,
}: {
  productoId: string | null | undefined;
  nombre: string;
  actuales: { cantidadMin: number; descuentoPct: number }[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  const abierto = productoId !== undefined;
  const [filas, setFilas] = useState<{ cantidad: string; pct: string }[]>([]);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!abierto) return;
    const base = [...actuales].sort((a, b) => a.cantidadMin - b.cantidadMin);
    setFilas(
      base.length
        ? base.map((e) => ({ cantidad: String(e.cantidadMin), pct: String(e.descuentoPct) }))
        : [{ cantidad: "50", pct: "5" }]
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, productoId]);

  const datos = filas
    .filter((f) => f.cantidad.trim() !== "" || f.pct.trim() !== "")
    .map((f) => ({ cantidadMin: Number(f.cantidad), descuentoPct: Number(f.pct) }));
  const ordenadas = [...datos].sort((a, b) => a.cantidadMin - b.cantidadMin);
  const error = datos.some((d) => !Number.isInteger(d.cantidadMin) || d.cantidadMin < 2)
    ? "La cantidad mínima debe ser un entero de 2 o más."
    : datos.some((d) => !(d.descuentoPct > 0 && d.descuentoPct < 100))
    ? "El descuento debe ser mayor a 0 y menor a 100 %."
    : new Set(datos.map((d) => d.cantidadMin)).size !== datos.length
    ? "Hay cantidades repetidas."
    : ordenadas.some((d, i) => i > 0 && d.descuentoPct < ordenadas[i - 1].descuentoPct)
    ? "A más piezas, el descuento no puede ser menor."
    : null;

  const guardar = async () => {
    if (error || productoId === undefined) return;
    setGuardando(true);
    try {
      await guardarEscalas(productoId, ordenadas);
      toast.success(datos.length ? `Mayoreo guardado: ${nombre}` : `Mayoreo eliminado: ${nombre}`);
      onGuardado();
    } catch (err: any) {
      toast.error("No se pudo guardar", { description: err?.message });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Dialog open={abierto} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{nombre}</DialogTitle>
          <DialogDescription>
            Descuento sobre el precio de lista a partir de cierta cantidad de piezas.
            {productoId ? " Reemplaza a la escala general para este producto." : ""} Deja la lista vacía para quitarlo.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground">
            <span>Desde (piezas)</span>
            <span>Descuento %</span>
            <span className="w-9" />
          </div>
          {filas.map((f, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Input
                type="number"
                min="2"
                step="1"
                value={f.cantidad}
                aria-label={`Piezas mínimas, escala ${i + 1}`}
                onChange={(e) => setFilas(filas.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))}
              />
              <Input
                type="number"
                min="0.5"
                max="99"
                step="0.5"
                value={f.pct}
                aria-label={`Descuento, escala ${i + 1}`}
                onChange={(e) => setFilas(filas.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))}
              />
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Quitar escala ${i + 1}`}
                onClick={() => setFilas(filas.filter((_, j) => j !== i))}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => {
              const ultima = ordenadas[ordenadas.length - 1];
              setFilas([
                ...filas,
                { cantidad: String(ultima ? ultima.cantidadMin * 2 : 50), pct: String(ultima ? ultima.descuentoPct + 3 : 5) },
              ]);
            }}
          >
            <Plus className="w-4 h-4" /> Agregar escala
          </Button>
          {error && <p className="text-sm text-status-pending">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={!!error || guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Alta / edición de una condición especial de un cliente. */
function PrecioClienteDialog({
  fila,
  clientes,
  productos,
  onClose,
  onGuardado,
}: {
  fila: PrecioCliente | "nuevo" | null;
  clientes: ClienteMin[];
  productos: Producto[];
  onClose: () => void;
  onGuardado: () => void;
}) {
  const existente = fila && fila !== "nuevo" ? fila : null;
  const [clienteId, setClienteId] = useState("");
  const [alcance, setAlcance] = useState<"todos" | "producto">("todos");
  const [productoId, setProductoId] = useState<string | null>(null);
  const [tipo, setTipo] = useState<"descuento" | "fijo">("descuento");
  const [valor, setValor] = useState("");
  const [vigencia, setVigencia] = useState("");
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!fila) return;
    setClienteId(existente?.clienteId ?? "");
    setAlcance(existente?.productoId ? "producto" : "todos");
    setProductoId(existente?.productoId ?? null);
    setTipo(existente?.precio != null ? "fijo" : "descuento");
    setValor(existente ? String(existente.precio ?? existente.descuentoPct ?? "") : "");
    setVigencia(existente?.vigenteHasta ?? "");
    setNotas(existente?.notas ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fila]);

  const numero = Number(valor);
  const error = !clienteId
    ? "Elige el cliente."
    : alcance === "producto" && !productoId
    ? "Elige el producto."
    : valor.trim() === "" || !Number.isFinite(numero)
    ? "Captura el valor."
    : tipo === "descuento" && !(numero > 0 && numero < 100)
    ? "El descuento debe ser mayor a 0 y menor a 100 %."
    : tipo === "fijo" && numero < 0
    ? "El precio no puede ser negativo."
    : null;

  const guardar = async () => {
    if (error) return;
    setGuardando(true);
    try {
      await guardarPrecioCliente(existente?.id ?? null, {
        clienteId,
        productoId: alcance === "producto" ? productoId : null,
        descuentoPct: tipo === "descuento" ? numero : null,
        precio: tipo === "fijo" ? numero : null,
        vigenteHasta: vigencia || null,
        notas,
      });
      toast.success("Condición guardada");
      onGuardado();
    } catch (err: any) {
      toast.error("No se pudo guardar", { description: err?.message });
    } finally {
      setGuardando(false);
    }
  };

  const claseSelect = "h-9 w-full rounded-md border border-border bg-card px-3 text-sm";

  return (
    <Dialog open={!!fila} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existente ? "Editar condición" : "Nueva condición de precio"}</DialogTitle>
          <DialogDescription>Se aplica al capturar órdenes, cotizaciones y ventas rápidas de este cliente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="pc-cliente">Cliente</Label>
            <select id="pc-cliente" className={claseSelect} value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
              <option value="">Elige un cliente…</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.razonSocial}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label>Aplica a</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                size="sm"
                variant={alcance === "todos" ? "default" : "outline"}
                onClick={() => {
                  setAlcance("todos");
                  setTipo("descuento");
                }}
              >
                Todos sus productos
              </Button>
              <Button type="button" size="sm" variant={alcance === "producto" ? "default" : "outline"} onClick={() => setAlcance("producto")}>
                Un producto
              </Button>
            </div>
            {alcance === "producto" && (
              <SelectorProducto productos={productos} valor={productoId} onElegir={setProductoId} />
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Condición</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={tipo === "descuento" ? "default" : "outline"} onClick={() => setTipo("descuento")}>
                % de descuento
              </Button>
              <Button
                type="button"
                size="sm"
                variant={tipo === "fijo" ? "default" : "outline"}
                disabled={alcance === "todos"}
                title={alcance === "todos" ? "El precio fijo es por producto" : undefined}
                onClick={() => setTipo("fijo")}
              >
                Precio fijo por pieza
              </Button>
            </div>
            <Input
              type="number"
              min="0"
              step={tipo === "fijo" ? "0.01" : "0.5"}
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder={tipo === "fijo" ? "Precio sin IVA, p. ej. 245" : "p. ej. 8"}
              aria-label={tipo === "fijo" ? "Precio por pieza" : "Porcentaje de descuento"}
            />
            {tipo === "fijo" && (
              <p className="text-xs text-muted-foreground">El precio fijo aplica a todas las tallas y no se combina con el mayoreo.</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pc-vigencia">Vigente hasta (opcional)</Label>
              <Input id="pc-vigencia" type="date" value={vigencia} onChange={(e) => setVigencia(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pc-notas">Notas (opcional)</Label>
              <Input id="pc-notas" value={notas} maxLength={500} onChange={(e) => setNotas(e.target.value)} placeholder="Contrato 2026…" />
            </div>
          </div>
          {error && <p className="text-sm text-muted-foreground">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={!!error || guardando}>
            {guardando ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Precio que tomarían los formularios para un cliente, producto y cantidad. */
function Simulador({ listas, productos, clientes }: { listas: Listas; productos: Producto[]; clientes: ClienteMin[] }) {
  const [cliente, setCliente] = useState("");
  const [productoId, setProductoId] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState("50");
  const [abierto, setAbierto] = useState(false);
  const producto = productoId ? productos.find((p) => p.id === productoId) : undefined;
  const piezas = Math.max(Number(cantidad) || 0, 0);
  const calc = producto
    ? precioSugerido(listas, { cliente, productoId: producto.id, precioBase: producto.precio, cantidad: piezas })
    : null;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2">
          <Calculator className="w-5 h-5 text-primary" /> Simulador de precio
        </CardTitle>
        <Button size="sm" variant="ghost" onClick={() => setAbierto(!abierto)}>
          {abierto ? "Ocultar" : "Probar"}
        </Button>
      </CardHeader>
      {abierto && (
        <CardContent className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4 lg:col-span-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="sim-cliente">Cliente</Label>
                <Input
                  id="sim-cliente"
                  list="sim-clientes"
                  value={cliente}
                  onChange={(e) => setCliente(e.target.value)}
                  placeholder="Público en general"
                />
                <datalist id="sim-clientes">
                  {clientes.map((c) => (
                    <option key={c.id} value={c.razonSocial} />
                  ))}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sim-cantidad">Piezas</Label>
                <Input id="sim-cantidad" type="number" min="1" value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
              </div>
            </div>
            <SelectorProducto productos={productos} valor={productoId} onElegir={setProductoId} />
          </div>
          <div className="rounded-lg bg-secondary p-4 space-y-2 self-start">
            {!producto || !calc ? (
              <p className="text-sm text-muted-foreground">Elige un producto para ver su precio.</p>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Precio de lista: {formatMonto(producto.precio)}</p>
                <p className="text-3xl font-semibold">{formatMonto(calc.precio)}</p>
                <p className="text-sm">{calc.regla ?? "Sin descuento aplicable"}</p>
                <p className="text-sm text-muted-foreground">
                  {piezas} pzs = {formatMonto(calc.precio * piezas)} + IVA
                </p>
                {calc.siguiente && (
                  <p className="text-xs text-muted-foreground">
                    Con {calc.siguiente.cantidadMin} pzs o más: −{calc.siguiente.descuentoPct} %
                  </p>
                )}
              </>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
