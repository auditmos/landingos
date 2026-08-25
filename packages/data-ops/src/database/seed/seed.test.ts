import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/*
 * Regression assumptions:
 * - input: the seed module wired to db:seed:dev, :staging and :production;
 * - output: it seeds the transfer catalog and nothing else;
 * - boundary: no fake person rows in any environment — 20 name/surname/email
 *   triples forced every leak scan and privacy audit to special-case them;
 * - out of scope: the catalog contents, covered by journey/queries tests.
 */
describe("database seed", () => {
	const source = readFileSync(join(import.meta.dirname, "seed.ts"), "utf8");

	it("seeds no fake person records", () => {
		expect(source).not.toMatch(/sampleClients|surname/);
		expect(source).not.toMatch(/@example\.(com|test)/);
		expect(source).not.toMatch(/\bclients\b/);
	});

	it("still seeds the transfer catalog", () => {
		expect(source).toContain("seedTransferCatalog");
	});
});
