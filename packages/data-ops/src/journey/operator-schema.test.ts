import {
	TransferCatalogDraftInputSchema,
	type TransferCatalogEditableField,
	TransferCatalogRecordSchema,
	validateTransferCatalogPublish,
} from "./operator-schema";

const completeDraft = {
	operatorName: "Airport Bus Express",
	serviceName: "BGY → Milano Centrale",
	destinationStopCode: "milano-centrale",
	destinationStopName: "Milano Centrale",
	durationMinutes: 50,
	transferCount: 0,
	walkingMinutes: 0,
	walkingMeters: 0,
	sourceUrl: "https://www.milanbergamoairport.it/en/bus/",
	checkedAt: "2026-07-27T00:00:00.000Z",
	costMinorMin: 1_000,
	costMinorMax: 1_200,
	purchaseUrl: "https://www.airportbusexpress.it/tickets",
};

describe("operator transfer catalog contract", () => {
	it("accepts an empty or incomplete draft", () => {
		expect(TransferCatalogDraftInputSchema.parse({})).toEqual({});
		expect(
			TransferCatalogDraftInputSchema.parse({
				operatorName: "Airport Bus Express",
				costMinorMin: null,
			}),
		).toEqual({
			operatorName: "Airport Bus Express",
			costMinorMin: null,
		});
	});

	it("returns a field-specific Polish error for every missing publish field", () => {
		for (const field of Object.keys(completeDraft) as TransferCatalogEditableField[]) {
			const validation = validateTransferCatalogPublish(
				{ ...completeDraft, [field]: null },
				{ now: new Date("2026-07-27T12:00:00.000Z"), freshnessDays: 30 },
			);
			expect(validation.ok, field).toBe(false);
			if (!validation.ok) {
				expect(validation.fieldErrors[field], field).toMatch(/[ąćęłńóśźż]/i);
			}
		}
	});

	it.each([
		[
			"durationMinutes",
			{ ...completeDraft, durationMinutes: 0 },
			"Czas trwania musi być dodatnią liczbą minut.",
		],
		["transferCount", { ...completeDraft, transferCount: -1 }, "Wartość nie może być ujemna."],
		["walkingMinutes", { ...completeDraft, walkingMinutes: -1 }, "Wartość nie może być ujemna."],
		["walkingMeters", { ...completeDraft, walkingMeters: -1 }, "Wartość nie może być ujemna."],
		["costMinorMin", { ...completeDraft, costMinorMin: -1 }, "Cena minimalna nie może być ujemna."],
		[
			"costMinorMax",
			{ ...completeDraft, costMinorMax: -1 },
			"Cena maksymalna nie może być ujemna.",
		],
		[
			"costMinorMax",
			{ ...completeDraft, costMinorMin: 1_300, costMinorMax: 1_200 },
			"Cena maksymalna nie może być niższa od minimalnej.",
		],
		[
			"sourceUrl",
			{ ...completeDraft, sourceUrl: "http://www.milanbergamoairport.it/en/bus/" },
			"Adres musi używać protokołu HTTPS.",
		],
		[
			"purchaseUrl",
			{ ...completeDraft, purchaseUrl: "https://evil.example/tickets" },
			"Host „evil.example” nie jest zatwierdzony.",
		],
		[
			"checkedAt",
			{ ...completeDraft, checkedAt: "27.07.2026" },
			"Podaj prawidłową datę kontroli w UTC.",
		],
		[
			"checkedAt",
			{ ...completeDraft, checkedAt: "2026-07-27T12:00:00.001Z" },
			"Data kontroli nie może być z przyszłości.",
		],
		[
			"checkedAt",
			{ ...completeDraft, checkedAt: "2026-06-27T11:59:59.999Z" },
			"Dane są starsze niż 30 dni.",
		],
	] as const)("rejects the %s boundary with the exact error", (field, draft, message) => {
		const validation = validateTransferCatalogPublish(draft, {
			now: new Date("2026-07-27T12:00:00.000Z"),
			freshnessDays: 30,
		});
		expect(validation).toMatchObject({
			ok: false,
			fieldErrors: { [field]: message },
		});
	});

	it("treats whitespace-only required text as missing", () => {
		expect(
			validateTransferCatalogPublish(
				{ ...completeDraft, operatorName: "   " },
				{ now: new Date("2026-07-27T12:00:00.000Z"), freshnessDays: 30 },
			),
		).toMatchObject({
			ok: false,
			fieldErrors: { operatorName: "Uzupełnij nazwę operatora." },
		});
	});

	it("accepts exact price/date edges and rejects redirect escapes", () => {
		expect(
			validateTransferCatalogPublish(
				{
					...completeDraft,
					costMinorMin: 0,
					costMinorMax: 0,
					checkedAt: "2026-06-27T12:00:00.000Z",
				},
				{ now: new Date("2026-07-27T12:00:00.000Z"), freshnessDays: 30 },
			),
		).toEqual({ ok: true });
		expect(
			validateTransferCatalogPublish(
				{
					...completeDraft,
					sourceUrl: "https://www.google.com/url?url=https%3A%2F%2Fevil.example%2Fsteal",
				},
				{ now: new Date("2026-07-27T12:00:00.000Z"), freshnessDays: 30 },
			),
		).toMatchObject({ ok: false, fieldErrors: { sourceUrl: expect.any(String) } });
	});

	it.each([
		["http://www.flixbus.com/route", "Adres musi używać protokołu HTTPS."],
		[
			"https://operator:secret@www.terravision.eu/route",
			"Adres nie może zawierać nazwy użytkownika ani hasła.",
		],
		[
			"https://www.flixbus.com.evil.example/route",
			"Host „www.flixbus.com.evil.example” nie jest zatwierdzony.",
		],
		[
			"https://www.google.com/url?url=https%3A%2F%2Fevil.example%2Fsteal",
			"Adres zawiera niebezpieczne przekierowanie poza zatwierdzoną listę.",
		],
	] as const)("returns the shared field-ready URL reason for %s", (sourceUrl, message) => {
		expect(
			validateTransferCatalogPublish(
				{ ...completeDraft, sourceUrl },
				{ now: new Date("2026-07-27T12:00:00.000Z"), freshnessDays: 30 },
			),
		).toMatchObject({ ok: false, fieldErrors: { sourceUrl: message } });
	});

	it("locks operator responses to catalog-only keys", () => {
		const record = {
			id: "catalog-id",
			originIata: "BGY",
			...completeDraft,
			publicationStatus: "published",
			provenance: "operator_verified",
			freshness: "fresh",
			createdAt: "2026-07-27T00:00:00.000Z",
			updatedAt: "2026-07-27T00:00:00.000Z",
		};
		expect(TransferCatalogRecordSchema.parse(record)).toEqual(record);
		for (const forbidden of [
			"destination",
			"trip",
			"room",
			"message",
			"report",
			"email",
			"consent",
		]) {
			expect(() =>
				TransferCatalogRecordSchema.parse({ ...record, [forbidden]: "private" }),
			).toThrow();
		}
	});
});
