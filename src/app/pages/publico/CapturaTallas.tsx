/**
 * CapturaTallas.tsx — Página pública para que cada empleado del cliente elija su talla
 * (ruta /captura-tallas/:token, sin iniciar sesión; pensada para celular).
 *
 * Escribe su nombre (y área, opcional) y toca su talla de cada prenda (o "No la uso").
 * Si vuelve a mandar el mismo nombre, se actualiza su respuesta. Al terminar puede
 * capturar a otra persona desde el mismo teléfono. Los datos van por
 * public.registrar_tallas_publica (sql/listas_tallas.sql), que valida todo.
 */
import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router";
import { CheckCircle2, Loader2, Users, XCircle } from "lucide-react";
import PaginaPublica, { TarjetaPublica } from "../../components/PaginaPublica";
import { cargarListaPublica, registrarTallasPublica, type ListaPublica } from "../../lib/listasTallas";
import { formatFecha } from "../../lib/fechas";

const claseCampo =
  "w-full px-3 py-3 bg-input-background border border-border rounded-lg focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 text-base";

export default function CapturaTallas() {
  const { token = "" } = useParams();
  const [lista, setLista] = useState<ListaPublica | null>(null);
  const [estado, setEstado] = useState<"cargando" | "listo" | "no_existe" | "error">("cargando");
  const [nombre, setNombre] = useState("");
  const [area, setArea] = useState("");
  const [notas, setNotas] = useState("");
  const [tallas, setTallas] = useState<Record<string, string>>({});
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hecho, setHecho] = useState<{ nombre: string; actualizado: boolean; tallas: Record<string, string> } | null>(null);
  const [verCapturados, setVerCapturados] = useState(false);

  const cargar = useCallback(async () => {
    if (!/^[0-9a-f-]{36}$/i.test(token)) {
      setEstado("no_existe");
      return;
    }
    try {
      const l = await cargarListaPublica(token);
      setLista(l);
      setEstado(l ? "listo" : "no_existe");
    } catch {
      setEstado("error");
    }
  }, [token]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  useEffect(() => {
    document.title = lista ? `Tallas — ${lista.titulo}` : "Captura de tallas";
  }, [lista]);

  if (estado !== "listo" || !lista) {
    return (
      <PaginaPublica>
        <TarjetaPublica className="text-center py-10 space-y-2">
          {estado === "cargando" ? (
            <p className="flex items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" /> Cargando…
            </p>
          ) : (
            <>
              <XCircle className="w-10 h-10 mx-auto text-muted-foreground" />
              <h1 className="text-xl font-semibold">{estado === "error" ? "No pudimos abrir la lista" : "Enlace no válido"}</h1>
              <p className="text-sm text-muted-foreground">
                {estado === "error"
                  ? "Revisa tu conexión e inténtalo de nuevo."
                  : "Pide el enlace correcto a la persona que te lo envió."}
              </p>
            </>
          )}
        </TarjetaPublica>
      </PaginaPublica>
    );
  }

  const yaCapturado = !!nombre.trim() && lista.capturados.some((c) => c.trim().toLowerCase() === nombre.trim().replace(/\s+/g, " ").toLowerCase());
  const elegidas = Object.values(tallas).filter(Boolean).length;

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (nombre.trim().length < 2) {
      setError("Escribe tu nombre completo.");
      return;
    }
    if (elegidas === 0) {
      setError("Elige la talla de al menos una prenda.");
      return;
    }
    setEnviando(true);
    try {
      const r = await registrarTallasPublica(token, { nombre, area, tallas, notas });
      setHecho({ ...r, tallas });
      await cargar();
    } catch (err) {
      setError((err as Error).message || "No se pudo guardar. Inténtalo de nuevo.");
    } finally {
      setEnviando(false);
    }
  };

  const otraPersona = () => {
    setHecho(null);
    setNombre("");
    setArea("");
    setNotas("");
    setTallas({});
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <PaginaPublica empresa={lista.empresa}>
      <TarjetaPublica className="space-y-2">
        <p className="text-xs text-muted-foreground">{lista.cliente}</p>
        <h1 className="text-xl sm:text-2xl font-semibold leading-tight">{lista.titulo}</h1>
        {lista.instrucciones && <p className="text-sm whitespace-pre-line">{lista.instrucciones}</p>}
        {lista.cierra && lista.abierta && (
          <p className="text-sm text-muted-foreground">Fecha límite: {formatFecha(lista.cierra, { weekday: "long", day: "numeric", month: "long" })}</p>
        )}
        {lista.capturados.length > 0 && (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setVerCapturados((v) => !v)}
              className="flex items-center gap-1.5 text-sm text-primary"
              aria-expanded={verCapturados}
            >
              <Users className="w-4 h-4" />
              {lista.capturados.length} persona{lista.capturados.length === 1 ? "" : "s"} ya capturaron
            </button>
            {verCapturados && <p className="mt-2 text-xs text-muted-foreground">{lista.capturados.join(", ")}</p>}
          </div>
        )}
      </TarjetaPublica>

      {!lista.abierta ? (
        <TarjetaPublica className="text-center py-8 space-y-2">
          <XCircle className="w-9 h-9 mx-auto text-muted-foreground" />
          <h2 className="font-semibold">La lista ya se cerró</h2>
          <p className="text-sm text-muted-foreground">Si te faltó capturar o quieres cambiar tu talla, avisa a tu contacto.</p>
        </TarjetaPublica>
      ) : hecho ? (
        <TarjetaPublica className="text-center py-8 space-y-3" aria-live="polite">
          <CheckCircle2 className="w-12 h-12 mx-auto text-status-completed" />
          <h2 className="text-lg font-semibold">
            {hecho.actualizado ? "Actualizamos tus tallas" : "¡Listo!"}, {hecho.nombre}
          </h2>
          <ul className="text-sm space-y-1">
            {lista.productos
              .filter((p) => hecho.tallas[p.clave])
              .map((p) => (
                <li key={p.clave}>
                  {p.nombre}
                  {p.color ? ` (${p.color})` : ""}: <strong>{hecho.tallas[p.clave]}</strong>
                </li>
              ))}
          </ul>
          <button
            type="button"
            onClick={otraPersona}
            className="mt-2 w-full sm:w-auto px-5 py-3 bg-primary text-primary-foreground rounded-lg font-medium"
          >
            Capturar a otra persona
          </button>
        </TarjetaPublica>
      ) : (
        <form onSubmit={enviar} className="space-y-4" noValidate>
          <TarjetaPublica className="space-y-3">
            <div>
              <label htmlFor="nombre" className="block text-sm font-medium mb-1">
                Nombre completo *
              </label>
              <input
                id="nombre"
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                className={claseCampo}
                autoComplete="name"
                maxLength={120}
                required
              />
              {yaCapturado && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Ya hay tallas a este nombre; si envías, se reemplazan por las nuevas.
                </p>
              )}
            </div>
            <div>
              <label htmlFor="area" className="block text-sm font-medium mb-1">
                Área o puesto <span className="text-muted-foreground font-normal">(opcional)</span>
              </label>
              <input id="area" value={area} onChange={(e) => setArea(e.target.value)} className={claseCampo} maxLength={120} />
            </div>
          </TarjetaPublica>

          {lista.productos.map((p) => (
            <TarjetaPublica key={p.clave}>
              <fieldset>
                <legend className="font-semibold">
                  {p.nombre}
                  {p.color && <span className="font-normal text-muted-foreground"> · {p.color}</span>}
                </legend>
                <div className="mt-3 grid grid-cols-4 sm:grid-cols-6 gap-2">
                  {p.tallas.map((t) => {
                    const activa = tallas[p.clave] === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={activa}
                        onClick={() => setTallas({ ...tallas, [p.clave]: activa ? "" : t })}
                        className={`min-h-12 rounded-lg border text-base font-medium transition-colors ${
                          activa ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-secondary"
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
                {!tallas[p.clave] && lista.productos.length > 1 && (
                  <p className="mt-2 text-xs text-muted-foreground">Si no usas esta prenda, déjala sin elegir.</p>
                )}
              </fieldset>
            </TarjetaPublica>
          ))}

          <TarjetaPublica>
            <label htmlFor="notas" className="block text-sm font-medium mb-1">
              Comentarios <span className="text-muted-foreground font-normal">(opcional)</span>
            </label>
            <input
              id="notas"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              className={claseCampo}
              maxLength={300}
              placeholder="Ej: manga larga, más largo de lo normal…"
            />
          </TarjetaPublica>

          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400 text-center">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={enviando}
            className="w-full px-5 py-4 bg-primary text-primary-foreground rounded-xl text-base font-semibold disabled:opacity-60"
          >
            {enviando ? "Enviando…" : `Enviar mis tallas${elegidas ? ` (${elegidas})` : ""}`}
          </button>
        </form>
      )}
    </PaginaPublica>
  );
}
