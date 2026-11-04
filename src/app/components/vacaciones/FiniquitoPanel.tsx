/**
 * FiniquitoPanel.tsx — Pestaña "Terminación" del empleado.
 *
 * Calcula en vivo el finiquito o la liquidación según la causa de terminación
 * (lib/laboral.ts → calcularFiniquito), muestra el desglose con su fundamento legal,
 * permite imprimirlo para firma y guardarlo. Al guardar puede registrar la baja del
 * empleado. También lista los cálculos guardados y permite revertir una baja.
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Printer, Save, Trash2, Undo2 } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { formatFecha, hoyISO } from "../../lib/fechas";
import { calcularFiniquito, causaInfo, type CausaTerminacion, type Concepto, type Finiquito } from "../../lib/laboral";
import type { Empleado, Vacacion } from "../../lib/vacaciones";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../ui/table";

interface FiniquitoPanelProps {
  empleado: Empleado;
  vacaciones: Vacacion[];
  finiquitos: Finiquito[];
  onSaved: () => void;
}

const claseCampo =
  "w-full px-3 py-2 bg-secondary rounded-lg border border-transparent focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";
const dinero = (n: number) => `$${n.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function FiniquitoPanel({ empleado, vacaciones, finiquitos, onSaved }: FiniquitoPanelProps) {
  const [fecha, setFecha] = useState(hoyISO());
  const [causa, setCausa] = useState<CausaTerminacion>("renuncia");
  const [diasPendientes, setDiasPendientes] = useState("0");
  const [aguinaldoPagado, setAguinaldoPagado] = useState(false);
  const [veinteDias, setVeinteDias] = useState(false);
  const [registrarBaja, setRegistrarBaja] = useState(true);
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Al cambiar de empleado se reinicia el formulario.
  useEffect(() => {
    setFecha(empleado.fecha_baja ?? hoyISO());
    setCausa((empleado.causa_baja as CausaTerminacion) ?? "renuncia");
    setDiasPendientes("0");
    setAguinaldoPagado(false);
    setVeinteDias(false);
    setRegistrarBaja(!empleado.fecha_baja);
    setNotas("");
  }, [empleado.id]);

  const fechaValida = !!fecha && fecha >= empleado.fecha_ingreso;
  const calculo = fechaValida
    ? calcularFiniquito(empleado, vacaciones, {
        fechaTerminacion: fecha,
        causa,
        diasSalarioPendiente: Math.max(Number(diasPendientes) || 0, 0),
        aguinaldoPagado,
        incluir20DiasPorAnio: veinteDias,
      })
    : null;
  const historial = finiquitos.filter((f) => f.empleado_id === empleado.id);

  const guardar = async () => {
    if (!calculo) return;
    setGuardando(true);
    const { error } = await supabase.from("finiquitos").insert({
      empleado_id: empleado.id,
      fecha_terminacion: fecha,
      causa,
      salario_diario: calculo.salarioDiario,
      salario_diario_integrado: calculo.salarioDiarioIntegrado,
      conceptos: calculo.conceptos,
      total: calculo.total,
      notas: notas.trim() || null,
    });
    if (!error && registrarBaja) {
      const baja = await supabase.from("empleados").update({ fecha_baja: fecha, causa_baja: causa, activo: false }).eq("id", empleado.id);
      if (baja.error) toast.error("Se guardó el cálculo, pero no se registró la baja", { description: baja.error.message });
    }
    setGuardando(false);
    if (error) {
      toast.error("No se pudo guardar el cálculo", { description: error.message });
      return;
    }
    toast.success(registrarBaja ? "Cálculo guardado y baja registrada" : "Cálculo guardado");
    onSaved();
  };

  const eliminar = async (f: Finiquito) => {
    if (!confirm(`¿Eliminar el cálculo del ${formatFecha(f.fecha_terminacion)}?`)) return;
    const { error } = await supabase.from("finiquitos").delete().eq("id", f.id);
    if (error) return toast.error("No se pudo eliminar", { description: error.message });
    toast.success("Cálculo eliminado");
    onSaved();
  };

  const revertirBaja = async () => {
    if (!confirm(`¿Revertir la baja de ${empleado.nombre}? Volverá a figurar como activo.`)) return;
    const { error } = await supabase.from("empleados").update({ fecha_baja: null, causa_baja: null, activo: true }).eq("id", empleado.id);
    if (error) return toast.error("No se pudo revertir la baja", { description: error.message });
    toast.success("Baja revertida");
    onSaved();
  };

  return (
    <div className="space-y-6">
      {empleado.fecha_baja && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-secondary rounded-lg">
          <p className="text-sm">
            <strong>Baja registrada:</strong> {formatFecha(empleado.fecha_baja)} ·{" "}
            {causaInfo[empleado.causa_baja as CausaTerminacion]?.texto ?? empleado.causa_baja}
          </p>
          <Button size="sm" variant="outline" onClick={revertirBaja}>
            <Undo2 className="w-4 h-4" />
            Revertir baja
          </Button>
        </div>
      )}

      {/* Parámetros del cálculo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="fin-fecha">Fecha de terminación *</Label>
          <Input id="fin-fecha" type="date" min={empleado.fecha_ingreso} value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="fin-causa">Causa *</Label>
          <select id="fin-causa" value={causa} onChange={(e) => setCausa(e.target.value as CausaTerminacion)} className={claseCampo}>
            {Object.entries(causaInfo).map(([clave, info]) => (
              <option key={clave} value={clave}>
                {info.texto}
              </option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{causaInfo[causa].descripcion}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="fin-dias">Días de salario pendientes de pago</Label>
          <Input id="fin-dias" type="number" min="0" step="0.5" value={diasPendientes} onChange={(e) => setDiasPendientes(e.target.value)} />
          <p className="text-xs text-muted-foreground">Días trabajados aún no pagados, sin las faltas injustificadas.</p>
        </div>
        <div className="md:col-span-2 space-y-2 pt-1">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={aguinaldoPagado} onChange={(e) => setAguinaldoPagado(e.target.checked)} className="w-4 h-4" />
            El aguinaldo de {fecha ? fecha.slice(0, 4) : "este año"} ya se pagó
          </label>
          {causa === "despido_injustificado" && (
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={veinteDias} onChange={(e) => setVeinteDias(e.target.checked)} className="w-4 h-4" />
              Incluir 20 días por año (si la empresa no reinstala al trabajador, Arts. 49 y 50 fr. II)
            </label>
          )}
        </div>
      </div>

      {!fechaValida && <p className="text-sm text-red-600 font-medium">La fecha de terminación no puede ser anterior al ingreso.</p>}

      {calculo && (
        <>
          <div className="flex flex-wrap gap-6 text-sm text-muted-foreground">
            <span>
              Antigüedad: <strong className="text-foreground">{calculo.antiguedad} años</strong>
            </span>
            <span>
              Salario diario: <strong className="text-foreground">{dinero(calculo.salarioDiario)}</strong>
            </span>
            <span>
              Salario diario integrado: <strong className="text-foreground">{dinero(calculo.salarioDiarioIntegrado)}</strong>
            </span>
          </div>

          <TablaConceptos conceptos={calculo.conceptos} total={calculo.total} />

          <ul className="space-y-1">
            {calculo.avisos.map((a) => (
              <li key={a} className="flex gap-2 text-xs text-muted-foreground">
                <AlertTriangle className="w-4 h-4 shrink-0 text-status-in-progress" />
                {a}
              </li>
            ))}
          </ul>

          <div className="space-y-2">
            <Label htmlFor="fin-notas">Notas</Label>
            <textarea id="fin-notas" rows={2} value={notas} onChange={(e) => setNotas(e.target.value)} className={claseCampo} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            {!empleado.fecha_baja ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={registrarBaja} onChange={(e) => setRegistrarBaja(e.target.checked)} className="w-4 h-4" />
                Registrar la baja del empleado al guardar
              </label>
            ) : (
              <span />
            )}
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() =>
                  imprimirDesglose(empleado, {
                    fecha_terminacion: fecha,
                    causa,
                    salario_diario: calculo.salarioDiario,
                    salario_diario_integrado: calculo.salarioDiarioIntegrado,
                    conceptos: calculo.conceptos,
                    total: calculo.total,
                    notas,
                  }, calculo.avisos)
                }
              >
                <Printer className="w-4 h-4" />
                Imprimir
              </Button>
              <Button onClick={guardar} disabled={guardando}>
                <Save className="w-4 h-4" />
                {guardando ? "Guardando…" : "Guardar cálculo"}
              </Button>
            </div>
          </div>
        </>
      )}

      {historial.length > 0 && (
        <div>
          <h3 className="font-semibold mb-2">Cálculos guardados</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Terminación</TableHead>
                <TableHead>Causa</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Registrado</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {historial.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>{formatFecha(f.fecha_terminacion)}</TableCell>
                  <TableCell>{causaInfo[f.causa]?.texto ?? f.causa}</TableCell>
                  <TableCell className="font-semibold">{dinero(Number(f.total))}</TableCell>
                  <TableCell>{formatFecha(f.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => imprimirDesglose(empleado, f, [])} title="Imprimir">
                      <Printer className="w-4 h-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => eliminar(f)} title="Eliminar">
                      <Trash2 className="w-4 h-4 text-status-pending" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function TablaConceptos({ conceptos, total }: { conceptos: Concepto[]; total: number }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Concepto</TableHead>
          <TableHead>Fundamento</TableHead>
          <TableHead className="text-right">Días</TableHead>
          <TableHead className="text-right">Salario base</TableHead>
          <TableHead className="text-right">Importe</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {conceptos.map((c) => (
          <TableRow key={c.clave}>
            <TableCell>{c.concepto}</TableCell>
            <TableCell className="text-muted-foreground text-xs">{c.fundamento}</TableCell>
            <TableCell className="text-right">{c.dias}</TableCell>
            <TableCell className="text-right">{dinero(c.base)}</TableCell>
            <TableCell className="text-right font-medium">{dinero(c.importe)}</TableCell>
          </TableRow>
        ))}
        <TableRow>
          <TableCell colSpan={4} className="text-right font-semibold">
            Total bruto
          </TableCell>
          <TableCell className="text-right text-lg font-bold text-primary">{dinero(total)}</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

const escapar = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Abre el diálogo de impresión con el desglose listo para firma. */
function imprimirDesglose(
  empleado: Empleado,
  f: Pick<Finiquito, "fecha_terminacion" | "causa" | "salario_diario" | "salario_diario_integrado" | "conceptos" | "total" | "notas">,
  avisos: string[]
) {
  const filas = f.conceptos
    .map((c) => `<tr><td>${escapar(c.concepto)}</td><td class="f">${escapar(c.fundamento)}</td><td class="n">${c.dias}</td><td class="n">${dinero(c.base)}</td><td class="n">${dinero(c.importe)}</td></tr>`)
    .join("");
  const datos = [
    ["Trabajador", empleado.nombre],
    ["Puesto", empleado.puesto ?? ""],
    ["RFC", empleado.rfc ?? ""],
    ["CURP", empleado.curp ?? ""],
    ["NSS", empleado.nss ?? ""],
    ["Fecha de ingreso", formatFecha(empleado.fecha_ingreso)],
    ["Fecha de terminación", formatFecha(f.fecha_terminacion)],
    ["Causa", causaInfo[f.causa]?.texto ?? f.causa],
    ["Salario diario", dinero(Number(f.salario_diario))],
    ["Salario diario integrado", dinero(Number(f.salario_diario_integrado))],
  ]
    .map(([k, v]) => `<tr><th>${k}</th><td>${escapar(String(v))}</td></tr>`)
    .join("");
  const titulo = f.causa === "despido_injustificado" || f.causa === "rescision_patron" ? "Liquidación" : "Finiquito";
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${titulo} - ${escapar(empleado.nombre)}</title>
<style>
  body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:32px}
  h1{font-size:18px;margin:0 0 4px} p{margin:4px 0}
  table{width:100%;border-collapse:collapse;margin:12px 0}
  td,th{border:1px solid #999;padding:5px;text-align:left;vertical-align:top}
  th{background:#f1f1f1;width:30%} .n{text-align:right;white-space:nowrap} .f{font-size:10px;color:#444}
  .total td{font-weight:bold;font-size:14px}
  .firmas{display:grid;grid-template-columns:1fr 1fr;gap:48px 32px;margin-top:56px}
  .firmas div{border-top:1px solid #111;padding-top:4px;text-align:center}
  .leyenda{font-size:10px;color:#333}
</style></head><body>
<h1>${titulo} de la relación laboral</h1>
<p>Empresa: ______________________________________ &nbsp; Lugar y fecha: ______________________</p>
<table>${datos}</table>
<table><thead><tr><th>Concepto</th><th>Fundamento</th><th class="n">Días</th><th class="n">Salario base</th><th class="n">Importe</th></tr></thead>
<tbody>${filas}<tr class="total"><td colspan="4" class="n">Total bruto</td><td class="n">${dinero(Number(f.total))}</td></tr></tbody></table>
${f.notas ? `<p><strong>Notas:</strong> ${escapar(f.notas)}</p>` : ""}
<p class="leyenda">Importes brutos antes de la retención de ISR que corresponda. Este documento desglosa los conceptos pagados conforme al Art. 33 de la Ley Federal del Trabajo; el convenio de terminación debe ratificarse ante el Centro de Conciliación competente y no implica renuncia a los derechos del trabajador (Art. 123, apartado A, fr. XXVII de la Constitución).</p>
${avisos.length ? `<ul class="leyenda">${avisos.map((a) => `<li>${escapar(a)}</li>`).join("")}</ul>` : ""}
<div class="firmas"><div>Recibí de conformidad<br>${escapar(empleado.nombre)}</div><div>Por la empresa<br>Nombre y firma</div><div>Testigo<br>Nombre y firma</div><div>Testigo<br>Nombre y firma</div></div>
</body></html>`;

  // Se imprime desde un iframe oculto para no depender de ventanas emergentes.
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  setTimeout(() => {
    iframe.contentWindow!.focus();
    iframe.contentWindow!.print();
    setTimeout(() => iframe.remove(), 1000);
  }, 100);
}
