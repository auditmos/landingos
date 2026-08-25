import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { isRuntimeSource, matching, scanFiles, scannedSource } from "./leak-scan";

const ROOT = resolve(import.meta.dirname, "..");
const FIXTURE = "scripts/__leak-scan-fixture__";

beforeAll(() => {
	const base = resolve(ROOT, FIXTURE);
	rmSync(base, { recursive: true, force: true });
	for (const directory of ["nested/deep", "node_modules", "dist", ".wrangler"]) {
		mkdirSync(resolve(base, directory), { recursive: true });
	}
	writeFileSync(resolve(base, "top.ts"), "const top = 'plain';\n");
	writeFileSync(resolve(base, "nested/mid.ts"), "const mid = 'destinationPlaceId';\n");
	writeFileSync(resolve(base, "nested/deep/leaf.tsx"), "const leaf = 'plain';\n");
	writeFileSync(resolve(base, "nested/skipme.test.ts"), "const t = 'destinationPlaceId';\n");
	writeFileSync(resolve(base, "node_modules/vendor.ts"), "const v = 'destinationPlaceId';\n");
	writeFileSync(resolve(base, "dist/built.ts"), "const b = 'destinationPlaceId';\n");
	writeFileSync(resolve(base, ".wrangler/tmp.ts"), "const w = 'destinationPlaceId';\n");
});

afterAll(() => {
	rmSync(resolve(ROOT, FIXTURE), { recursive: true, force: true });
});

describe("shared leak-scan walker", () => {
	it("walks nested directories and returns repo-relative path/source pairs", () => {
		const files = scanFiles([FIXTURE]);

		expect(files.map((file) => file.path).sort()).toEqual([
			`${FIXTURE}/nested/deep/leaf.tsx`,
			`${FIXTURE}/nested/mid.ts`,
			`${FIXTURE}/nested/skipme.test.ts`,
			`${FIXTURE}/top.ts`,
		]);
		expect(files.find((file) => file.path.endsWith("mid.ts"))?.source).toContain(
			"destinationPlaceId",
		);
	});

	it("never descends into node_modules, dist, or .wrangler", () => {
		expect(scannedSource(scanFiles([FIXTURE]))).not.toMatch(/vendor|built|tmp/);
	});

	it("accepts a single file as a target and de-duplicates overlapping targets", () => {
		expect(scanFiles([`${FIXTURE}/top.ts`]).map((file) => file.path)).toEqual([
			`${FIXTURE}/top.ts`,
		]);
		expect(
			scanFiles([FIXTURE, `${FIXTURE}/top.ts`]).filter((f) => f.path.endsWith("top.ts")),
		).toHaveLength(1);
	});

	it("drops allowlisted paths and reports every remaining match", () => {
		const forbidden = /destinationPlaceId/;

		expect(matching(scanFiles([FIXTURE], { include: isRuntimeSource }), forbidden)).toEqual([
			`${FIXTURE}/nested/mid.ts`,
		]);
		expect(
			matching(
				scanFiles([FIXTURE], {
					include: isRuntimeSource,
					allowlist: [`${FIXTURE}/nested/mid.ts`],
				}),
				forbidden,
			),
		).toEqual([]);
	});

	it("excludes test files from a runtime-source scan", () => {
		const paths = scanFiles([FIXTURE], { include: isRuntimeSource }).map((file) => file.path);

		expect(paths).not.toContain(`${FIXTURE}/nested/skipme.test.ts`);
		expect(paths).toContain(`${FIXTURE}/nested/deep/leaf.tsx`);
	});
});
