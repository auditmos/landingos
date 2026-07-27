import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { getE2ERouter } from "./router";
import "./styles.css";

const element = document.getElementById("root");
if (!element) throw new Error("Brak korzenia aplikacji testowej.");

createRoot(element).render(
	<StrictMode>
		<RouterProvider router={getE2ERouter()} />
	</StrictMode>,
);
