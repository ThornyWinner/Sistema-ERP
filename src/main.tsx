/**
 * main.tsx — Punto de entrada de la aplicación.
 *
 * Vite carga este archivo desde index.html. Aquí se:
 *  1. Importan los estilos globales (fuentes, Tailwind y el tema de colores).
 *  2. Monta el componente raíz <App /> dentro del elemento HTML con id="root".
 */

  import { createRoot } from "react-dom/client";
  import App from "./app/App.tsx";
  // Hoja de estilos principal: a su vez importa fonts.css, tailwind.css y theme.css.
  import "./styles/index.css";

  // createRoot (API de React 18) crea la raíz y renderiza la aplicación.
  // El "!" indica a TypeScript que el elemento #root siempre existe en index.html.
  createRoot(document.getElementById("root")!).render(<App />);
