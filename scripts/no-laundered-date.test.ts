import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Issue #51 shipped `new Date(checkedAt ?? "").toLocaleDateString("pl-PL")`, which
 * renders the English literal "Invalid Date" into Polish UI whenever the nullable
 * field is null. A `??` inside a `new Date(...)` argument is that whole bug: it
 * launders a nullable timestamp past the type checker into a formatter, instead of
 * guarding the null and suppressing the copy that depends on it.
 *
 * Every other date render site in this repo guards its input (`Number.isNaN`) or
 * takes a non-nullable field. This keeps it that way.
 */

const SKIP_DIRS = new Set([
	"node_modules",
	".wrangler",
	".git",
	"dist",
	".turbo",
	"coverage",
	".tanstack",
	".output",
	".vinxi",
	".nitro",
]);

const SCAN_ROOTS = ["apps/data-service/src", "apps/user-application/src", "packages/data-ops/src"];

const SOURCE_EXTS = new Set([".ts", ".tsx"]);

const LAUNDERED_DATE = /new Date\([^)]*\?\?/;

const repoRoot = resolve(dirname(new URL(import.meta.url).pathname), "..");

function isProductionSourceFile(name: string): boolean {
	if (name.endsWith(".test.ts") || name.endsWith(".test.tsx")) return false;
	if (name.endsWith(".spec.ts") || name.endsWith(".spec.tsx")) return false;
	const dot = name.lastIndexOf(".");
	if (dot === -1) return false;
	return SOURCE_EXTS.has(name.slice(dot));
}

function findSourceFiles(dir: string, results: string[] = []): string[] {
	let entries: ReturnType<typeof readdirSync>;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return results;
	}
	for (const entry of entries) {
		if (SKIP_DIRS.has(entry.name)) continue;
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			findSourceFiles(full, results);
		} else if (entry.isFile() && isProductionSourceFile(entry.name)) {
			results.push(full);
		}
	}
	return results;
}

const allFiles = SCAN_ROOTS.flatMap((root) => findSourceFiles(resolve(repoRoot, root)));

describe("no nullable timestamp laundered into a Date", () => {
	it("finds production source files to scan", () => {
		expect(allFiles.length).toBeGreaterThan(0);
	});

	it("recognises the shape that shipped as issue #51", () => {
		expect(LAUNDERED_DATE.test('new Date(alternative.source.checkedAt ?? "")')).toBe(true);
		expect(LAUNDERED_DATE.test("new Date(record.closedAt ?? Date.now())")).toBe(true);
		// A guarded read is the correct shape and must stay allowed.
		expect(LAUNDERED_DATE.test("checkedAt ? new Date(checkedAt) : null")).toBe(false);
	});

	it("contains no `new Date(x ?? …)` in production source", () => {
		const offenders: string[] = [];
		for (const file of allFiles) {
			const lines = readFileSync(file, "utf8").split("\n");
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (line === undefined) continue;
				if (LAUNDERED_DATE.test(line)) {
					offenders.push(`${file.slice(repoRoot.length + 1)}:${i + 1}: ${line.trim()}`);
				}
			}
		}
		expect(
			offenders,
			`A nullable timestamp is being laundered into a Date — guard the null and suppress the copy that depends on it instead:\n${offenders.join("\n")}`,
		).toEqual([]);
	});
});
