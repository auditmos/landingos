import { execSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

const PROJECT_ROOT = resolve(import.meta.dirname, "..", "..");
const BUILD_DIR = join(PROJECT_ROOT, "dist");
const SERVER_BUILD_DIR = join(BUILD_DIR, "server");
const SECRET_MARKERS = {
	VITE_API_TOKEN: "vite-api-token-marker-do-not-bundle-xyz12345",
	BETTER_AUTH_SECRET: "better-auth-secret-marker-do-not-bundle-xyz12345",
	AVIATIONSTACK_ACCESS_KEY: "aviationstack-marker-do-not-bundle-xyz12345",
	GOOGLE_MAPS_API_KEY: "google-maps-marker-do-not-bundle-xyz12345",
	AUTH_EMAIL_FROM: "email-sender-marker-do-not-bundle-xyz12345@example.test",
	DATABASE_HOST: "database-host-marker-do-not-bundle-xyz12345",
	DATABASE_USERNAME: "database-user-marker-do-not-bundle-xyz12345",
	DATABASE_PASSWORD: "database-password-marker-do-not-bundle-xyz12345",
	DATA_SERVICE_API_TOKEN: "shared-service-marker-do-not-bundle-xyz12345",
	ANALYTICS_PSEUDONYM_SECRET: "analytics-hmac-marker-do-not-bundle-xyz12345",
} as const;

const RUN = process.env.RUN_BUNDLE_TEST === "1";

describe.skipIf(!RUN)("api token bundle isolation", () => {
	beforeAll(() => {
		execSync("pnpm run build:production", {
			cwd: PROJECT_ROOT,
			env: {
				...process.env,
				...SECRET_MARKERS,
				WRANGLER_WRITE_LOGS: "false",
			} as unknown as NodeJS.ProcessEnv,
			stdio: "inherit",
		});
	}, 300_000);

	it("never embeds client or provider secrets into any production artifact", () => {
		for (const marker of Object.values(SECRET_MARKERS)) {
			expect(grepRecursive(BUILD_DIR, marker)).toEqual([]);
		}
	});

	it("removes generated dotenv files before the production artifact can be deployed", () => {
		for (const fileName of [".dev.vars", ".env", ".env.production", ".env.staging"]) {
			expect(existsSync(join(SERVER_BUILD_DIR, fileName)), fileName).toBe(false);
		}
	});
});

function grepRecursive(dir: string, needle: string): string[] {
	const matches: string[] = [];
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			matches.push(...grepRecursive(full, needle));
		} else if (entry.isFile()) {
			const content = readFileSync(full, "utf-8");
			if (content.includes(needle)) matches.push(full);
		}
	}
	return matches;
}
