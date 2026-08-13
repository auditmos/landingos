import { describe, expect, it } from "vitest";
import { APPROVED_JOURNEY_EXTERNAL_HOSTS } from "./external-links";
import {
	OPERATOR_CATALOG_FIELD_BY_NAME,
	OPERATOR_CATALOG_FIELDS,
	OPERATOR_PUBLICATION_SENTENCE,
} from "./operator-fields";
import { validateTransferCatalogPublish } from "./operator-schema";

/*
 * Issue #21 assumptions approved before RED:
 * - input: the 13 publication-required editable fields, nothing else;
 * - output: one typed definition drives label, help, format/unit, requirement, and
 *   documented downstream use — no second label or help list may exist;
 * - boundary: help copy is Polish, field-specific, and disambiguates the confusable pairs;
 * - excluded here: the downstream engine effects, covered by the catalog usage contract.
 */

const EXPECTED_FIELDS = [
	"operatorName",
	"serviceName",
	"destinationStopCode",
	"destinationStopName",
	"durationMinutes",
	"transferCount",
	"walkingMinutes",
	"walkingMeters",
	"sourceUrl",
	"checkedAt",
	"costMinorMin",
	"costMinorMax",
	"purchaseUrl",
] as const;

describe("operator catalog field definitions", () => {
	it("covers every publication-required editable field exactly once", () => {
		expect(OPERATOR_CATALOG_FIELDS).toHaveLength(13);
		expect(OPERATOR_CATALOG_FIELDS.map((field) => field.name)).toEqual([...EXPECTED_FIELDS]);
		for (const field of OPERATOR_CATALOG_FIELDS) {
			expect(field.requiredForPublication).toBe(true);
			expect(OPERATOR_CATALOG_FIELD_BY_NAME[field.name]).toBe(field);
		}
	});

	it("is the only source of the publication error messages", () => {
		const validation = validateTransferCatalogPublish(
			{},
			{ now: new Date("2026-08-13T00:00:00.000Z"), freshnessDays: 30 },
		);
		expect(validation.ok).toBe(false);
		if (validation.ok) return;
		for (const field of OPERATOR_CATALOG_FIELDS) {
			expect(validation.fieldErrors[field.name]).toBe(field.requiredMessage);
		}
		expect(Object.keys(validation.fieldErrors).sort()).toEqual([...EXPECTED_FIELDS].sort());
	});

	it.each(
		OPERATOR_CATALOG_FIELDS,
	)("$name explains meaning, example, requirement, and downstream use in Polish", (field) => {
		expect(field.help).toContain(field.example);
		expect(field.help).toContain(field.downstreamUse);
		expect(field.help).toContain(OPERATOR_PUBLICATION_SENTENCE);
		expect(field.help).toMatch(/[ąćęłńóśźżĄĆĘŁŃÓŚŹŻ]/);
		expect(field.help).not.toMatch(/\b(the|and|for|value|field)\b/i);
		expect(field.label).toMatch(/^[A-ZĄĆĘŁŃÓŚŹŻ]/);
	});

	it("keeps every label, help text, and error message distinct", () => {
		for (const key of ["label", "help", "requiredMessage"] as const) {
			const values = OPERATOR_CATALOG_FIELDS.map((field) => field[key]);
			expect(new Set(values).size).toBe(values.length);
		}
	});

	it.each([
		["operatorName", /usług/i],
		["serviceName", /operator/i],
		["destinationStopCode", /nazw/i],
		["destinationStopName", /kod/i],
		["sourceUrl", /zakup/i],
		["purchaseUrl", /źródł/i],
		["walkingMinutes", /metr/i],
		["walkingMeters", /minut/i],
		["costMinorMin", /cent/i],
		["costMinorMax", /cent/i],
	] as const)("%s help distinguishes itself from its confusable pair", (name, pattern) => {
		expect(OPERATOR_CATALOG_FIELD_BY_NAME[name].help).toMatch(pattern);
	});

	it.each([
		"durationMinutes",
		"transferCount",
		"walkingMinutes",
		"walkingMeters",
	] as const)("%s states its unit and zero-value semantics", (name) => {
		const field = OPERATOR_CATALOG_FIELD_BY_NAME[name];
		expect(field.unit).toBeTruthy();
		expect(field.help).toContain(field.unit as string);
		expect(field.help).toMatch(/zero|Zero/);
	});

	it("moves the approved-host rule into the URL field help instead of permanent body text", () => {
		for (const name of ["sourceUrl", "purchaseUrl"] as const) {
			const help = OPERATOR_CATALOG_FIELD_BY_NAME[name].help;
			expect(help).toContain("HTTPS");
			for (const host of APPROVED_JOURNEY_EXTERNAL_HOSTS) {
				expect(help).toContain(host);
			}
		}
	});

	it("declares an input kind and format for every field", () => {
		for (const field of OPERATOR_CATALOG_FIELDS) {
			expect(["text", "url", "integer", "datetime"]).toContain(field.kind);
			expect(field.example.length).toBeGreaterThan(0);
			expect(field.downstreamUse.length).toBeGreaterThan(10);
		}
	});
});
