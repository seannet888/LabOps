import { createRoot } from "react-dom/client";
import { renderApp } from "../app/render-app.js";
import "../styles/app.css";

const root = document.getElementById("root");

if (!root) {
  throw new Error("Missing root element");
}

createRoot(root).render(renderApp());
