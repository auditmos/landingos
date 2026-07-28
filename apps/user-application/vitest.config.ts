import { resolve } from "node:path";
import { defineProject } from "vitest/config";

export default defineProject({
	resolve: { alias: { "@": resolve(import.meta.dirname, "src") } },
	test: {
		globals: true,
		include: ["src/**/*.test.ts"],
		exclude: ["src/routes/**"],
		// Keep tests independent of a developer's local .env: the Turnstile widget
		// can't run in jsdom, so disable the challenge by default. Tests that assert
		// captcha-gated behaviour can re-stub this var themselves.
		env: {
			VITE_TURNSTILE_SITE_KEY: "",
		},
	},
});
