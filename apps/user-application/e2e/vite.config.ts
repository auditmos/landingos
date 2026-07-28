import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const e2eRoot = import.meta.dirname;
const appRoot = resolve(e2eRoot, "..");
const sourceRoot = resolve(appRoot, "src");
const useRealAuthClient = process.env.LANDINGOS_E2E_REAL_AUTH === "true";

export default defineConfig({
	root: e2eRoot,
	publicDir: resolve(appRoot, "public"),
	plugins: [tailwindcss(), viteReact()],
	resolve: {
		alias: [
			{
				find: "cloudflare:workers",
				replacement: resolve(e2eRoot, "cloudflare-workers.js"),
			},
			...(useRealAuthClient
				? []
				: [
						{
							find: "@/lib/auth-client",
							replacement: resolve(e2eRoot, "mock-auth-client.ts"),
						},
					]),
			{
				find: "@/lib/use-viewer",
				replacement: resolve(e2eRoot, "mock-viewer.ts"),
			},
			{ find: "@", replacement: sourceRoot },
		],
	},
	server: {
		host: "127.0.0.1",
		port: 4173,
		strictPort: true,
		proxy: {
			"/api/account": "http://127.0.0.1:8789",
			"/api/auth": "http://127.0.0.1:8789",
			"/api/profile": "http://127.0.0.1:8789",
		},
	},
});
