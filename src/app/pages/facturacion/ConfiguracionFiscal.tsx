/**
 * ConfiguracionFiscal.tsx — Datos del emisor y series/folios (ruta /facturacion/configuracion).
 * Equivale a Configuración de Empresa ▸ Datos generales y Series y folios de CONTPAQi Vende.
 *
 * El "último folio" es el último usado: al timbrar se toma el siguiente. Antes de la
 * primera factura del ERP hay que confirmar que coincide con el último de CONTPAQi para
 * no repetir ni saltar folios. Solo el administrador principal edita.
 */
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Building2, Loader2, Plus, Save, ShieldCheck } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/Card";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { CP_REGEX, REGIMENES_FISCALES, RFC_REGEX, etiquetaSat } from "../../lib/sat";

interface Emisor {
  rfc: string;
  razon_social: string;
  nombre_comercial: string | null;
  regimen_fiscal: string;
  codigo_postal: string;
}
interface Serie {
  id: string;
  tipo: "factura" | "nota_credito" | "complemento_pago" | "traslado";
  serie: string;
  ultimo_folio: number;
  predeterminada: boolean;
  activa: boolean;
}

const TIPOS: Record<Serie["tipo"], string> = {
  factura: "Factura",
  nota_credito: "Nota de crédito",
  complemento_pago: "Complemento de pago",
  traslado: "Traslado",
};
const CLASE_SELECT =
  "h-9 w-full rounded-md border border-input bg-input-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]";

export default function ConfiguracionFiscal() {
  const { user } = useAuth();
  const editable = user?.rol === "admin_primario";
  const [cargando, setCargando] = useState(true);
  const [emisor, setEmisor] = useState<Emisor | null>(null);
  const [series, setSeries] = useState<Serie[]>([]);
  const [folios, setFolios] = useState<Record<string, string>>({});
  const [guardando, setGuardando] = useState(false);
  const [nueva, setNueva] = useState<{ tipo: Serie["tipo"]; serie: string; folio: string }>({ tipo: "factura", serie: "", folio: "0" });

  const cargar = useCallback(async () => {
    setCargando(true);
    const [e, s] = await Promise.all([
      supabase.from("empresa_fiscal").select("rfc,razon_social,nombre_comercial,regimen_fiscal,codigo_postal").maybeSingle(),
      supabase.from("series_folios").select("id,tipo,serie,ultimo_folio,predeterminada,activa").order("tipo").order("serie"),
    ]);
    setCargando(false);
    if (e.error || s.error) {
      toast.error(`No se pudo cargar la configuración: ${(e.error || s.error)!.message}. ¿Ya se aplicó sql/facturacion.sql?`);
      return;
    }
    setEmisor(e.data as Emisor | null);
    const lista = (s.data ?? []) as Serie[];
    setSeries(lista);
    setFolios(Object.fromEntries(lista.map((x) => [x.id, String(x.ultimo_folio)])));
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const guardarEmisor = async () => {
    if (!emisor) return;
    if (!RFC_REGEX.test(emisor.rfc)) return toast.error("RFC del emisor no válido");
    if (!CP_REGEX.test(emisor.codigo_postal)) return toast.error("El código postal lleva 5 dígitos");
    if (!emisor.razon_social.trim()) return toast.error("La razón social es obligatoria");
    setGuardando(true);
    const { error } = await supabase
      .from("empresa_fiscal")
      .update({ ...emisor, razon_social: emisor.razon_social.trim().toUpperCase(), updated_at: new Date().toISOString() })
      .eq("id", true);
    setGuardando(false);
    if (error) toast.error(error.message);
    else toast.success("Datos del emisor guardados");
  };

  const guardarSerie = async (s: Serie, cambios: Partial<Serie>) => {
    // Solo una serie predeterminada por tipo: primero se quita la anterior.
    if (cambios.predeterminada) {
      const anterior = series.find((x) => x.tipo === s.tipo && x.predeterminada && x.id !== s.id);
      if (anterior) {
        const { error } = await supabase.from("series_folios").update({ predeterminada: false }).eq("id", anterior.id);
        if (error) return toast.error(error.message);
      }
    }
    const { error } = await supabase.from("series_folios").update(cambios).eq("id", s.id);
    if (error) toast.error(error.message);
    else toast.success(`Serie ${s.serie} actualizada`);
    cargar();
  };

  const agregarSerie = async () => {
    const serie = nueva.serie.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,25}$/.test(serie)) return toast.error("La serie lleva solo letras y números (máximo 25)");
    const { error } = await supabase
      .from("series_folios")
      .insert({ tipo: nueva.tipo, serie, ultimo_folio: Math.max(Number(nueva.folio) || 0, 0) });
    if (error) return toast.error(error.code === "23505" ? "Esa serie ya existe para ese tipo" : error.message);
    toast.success(`Serie ${serie} agregada`);
    setNueva({ ...nueva, serie: "", folio: "0" });
    cargar();
  };

  if (cargando) {
    return (
      <div className="p-6 flex items-center gap-3 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin" /> Cargando configuración…
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1>Configuración de facturación</h1>
        <p className="text-muted-foreground mt-1">Datos del emisor y series y folios de los CFDI</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="w-5 h-5" /> Datos del emisor
          </CardTitle>
        </CardHeader>
        <CardContent>
          {emisor ? (
            <fieldset disabled={!editable || guardando} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>RFC</Label>
                <Input value={emisor.rfc} onChange={(e) => setEmisor({ ...emisor, rfc: e.target.value.toUpperCase().trim() })} maxLength={13} />
              </div>
              <div className="space-y-1.5">
                <Label>Nombre comercial</Label>
                <Input value={emisor.nombre_comercial ?? ""} onChange={(e) => setEmisor({ ...emisor, nombre_comercial: e.target.value })} />
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <Label>Nombre o razón social (como en la constancia de situación fiscal)</Label>
                <Input value={emisor.razon_social} onChange={(e) => setEmisor({ ...emisor, razon_social: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Régimen fiscal</Label>
                <select value={emisor.regimen_fiscal} onChange={(e) => setEmisor({ ...emisor, regimen_fiscal: e.target.value })} className={CLASE_SELECT}>
                  {REGIMENES_FISCALES.map((r) => (
                    <option key={r.clave} value={r.clave}>
                      {etiquetaSat(r)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Lugar de expedición (código postal)</Label>
                <Input
                  value={emisor.codigo_postal}
                  onChange={(e) => setEmisor({ ...emisor, codigo_postal: e.target.value.replace(/\D/g, "") })}
                  maxLength={5}
                  inputMode="numeric"
                />
              </div>
              {editable && (
                <div className="md:col-span-2 flex justify-end">
                  <Button onClick={guardarEmisor}>
                    <Save /> Guardar emisor
                  </Button>
                </div>
              )}
            </fieldset>
          ) : (
            <p className="text-muted-foreground">No hay datos del emisor.</p>
          )}
          <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
            <ShieldCheck className="w-4 h-4 shrink-0" />
            Los certificados de sello digital (CSD: .cer, .key y contraseña) no se guardan en el ERP: se cargan
            directamente en el portal del PAC.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Series y folios</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            «Último folio» es el último usado; al timbrar se asigna el siguiente. Antes de la primera factura del
            ERP confirma que coincide con el último folio de CONTPAQi.
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo de documento</TableHead>
                  <TableHead>Serie</TableHead>
                  <TableHead>Último folio</TableHead>
                  <TableHead>Predeterminada</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {series.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>{TIPOS[s.tipo]}</TableCell>
                    <TableCell className="font-medium">{s.serie}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          min="0"
                          className="w-28"
                          value={folios[s.id] ?? ""}
                          disabled={!editable}
                          onChange={(e) => setFolios({ ...folios, [s.id]: e.target.value })}
                        />
                        {editable && folios[s.id] !== String(s.ultimo_folio) && (
                          <Button
                            size="sm"
                            onClick={() => {
                              const n = Number(folios[s.id]);
                              if (!Number.isInteger(n) || n < 0) return toast.error("Folio no válido");
                              guardarSerie(s, { ultimo_folio: n });
                            }}
                          >
                            Guardar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <input
                        type="checkbox"
                        className="w-4 h-4 accent-primary"
                        checked={s.predeterminada}
                        disabled={!editable || s.predeterminada}
                        onChange={() => guardarSerie(s, { predeterminada: true })}
                        aria-label={`Serie ${s.serie} predeterminada`}
                      />
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        disabled={!editable}
                        onClick={() => guardarSerie(s, { activa: !s.activa })}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          s.activa ? "bg-status-completed-bg text-status-completed-text" : "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {s.activa ? "Activa" : "Inactiva"}
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {editable && (
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-end">
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <select value={nueva.tipo} onChange={(e) => setNueva({ ...nueva, tipo: e.target.value as Serie["tipo"] })} className={CLASE_SELECT}>
                  {Object.entries(TIPOS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>Serie</Label>
                <Input value={nueva.serie} onChange={(e) => setNueva({ ...nueva, serie: e.target.value.toUpperCase() })} maxLength={25} />
              </div>
              <div className="space-y-1.5">
                <Label>Último folio usado</Label>
                <Input type="number" min="0" value={nueva.folio} onChange={(e) => setNueva({ ...nueva, folio: e.target.value })} />
              </div>
              <Button onClick={agregarSerie} disabled={!nueva.serie}>
                <Plus /> Agregar serie
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
