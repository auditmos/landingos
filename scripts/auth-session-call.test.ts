import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function sourceFiles(directory: string): string[] {
	const entries = readdirSync(directory);
	return entries.flatMap((entry) => {
		if (entry === "node_modules" || entry === "dist") return [];
		const path = join(directory, entry);
		if (statSync(path).isDirectory()) return sourceFiles(path);
		return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
	});
}

/**
 * Better Auth throws "Headers is required" when `getSession` is handed a bare
 * Request instead of `{ headers }`. Server functions serialise that throw into
 * a 200 response body, so the call silently resolves to "no session" — which is
 * how the operator console stayed invisible while the Worker logged only 200s.
 */
describe("Better Auth session call sites", () => {
	const callSites = ["apps/user-application/src", "apps/data-service/src", "packages/data-ops/src"]
		.flatMap(sourceFiles)
		.flatMap((path) => {
			const source = readFileSync(path, "utf8");
			// Only Better Auth's own API — our handler dependencies expose a
			// `getSession(request)` of their own, which correctly takes a Request.
			return [...source.matchAll(/api\.getSession\(\s*([^)]{0,40})/g)].map((match) => ({
				path,
				argument: (match[1] ?? "").trim(),
			}));
		});

	it("finds the session helpers it is meant to guard", () => {
		expect(callSites.length).toBeGreaterThan(0);
	});

	it("always passes an object carrying headers, never the request itself", () => {
		const offenders = callSites.filter((site) => !site.argument.startsWith("{"));
		expect(offenders).toEqual([]);
	});

	it("reads headers off the request rather than spreading it", () => {
		for (const site of callSites) {
			expect(site.argument).toMatch(/headers/);
		}
	});
});
