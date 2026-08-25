import {
	type CatalogClockOptions,
	type TransferCatalogDraftInput,
	type TransferCatalogPublishOutcome,
	type TransferCatalogRecord,
	validateTransferCatalogPublish,
} from "@repo/data-ops/journey";
import { Hono } from "hono";
import {
	type CatalogRepository,
	type CatalogService,
	createCatalogService,
} from "../../operator/catalog-service";
import { createOperatorCatalogHandlers } from "./operator-catalog-handlers";

const now = new Date("2026-07-27T12:00:00.000Z");

function createStatefulService(): CatalogService {
	const entries = new Map<string, TransferCatalogRecord>();
	let sequence = 0;
	const repository: CatalogRepository = {
		list: async () => [...entries.values()],
		get: async (id) => entries.get(id) ?? null,
		create: async (input) => {
			const id = `entry-${++sequence}`;
			const entry: TransferCatalogRecord = {
				id,
				originIata: "BGY",
				operatorName: null,
				serviceName: null,
				destinationStopCode: null,
				destinationStopName: null,
				durationMinutes: null,
				transferCount: null,
				walkingMinutes: null,
				walkingMeters: null,
				sourceUrl: null,
				checkedAt: null,
				costMinorMin: null,
				costMinorMax: null,
				purchaseUrl: null,
				publicationStatus: "draft",
				provenance: "operator_verified",
				freshness: "incomplete",
				createdAt: now.toISOString(),
				updatedAt: now.toISOString(),
				...input,
			};
			entries.set(id, entry);
			return entry;
		},
		update: async (id, input) => {
			const entry = entries.get(id);
			if (!entry) return null;
			const updated = { ...entry, ...input, freshness: freshnessFor(input, entry) };
			entries.set(id, updated);
			return updated;
		},
		saveAndPublish: async (id, input, options) => {
			const refusal = publishRefusal(input, options);
			if (refusal) return refusal;
			const current = id ? entries.get(id) : undefined;
			if (id && !current) return { ok: false, reason: "not_found" };
			const entryId = id ?? `entry-${++sequence}`;
			const published: TransferCatalogRecord = {
				...(current ?? {
					id: entryId,
					originIata: "BGY",
					provenance: "operator_verified",
					createdAt: now.toISOString(),
				}),
				...input,
				id: entryId,
				originIata: "BGY",
				publicationStatus: "published",
				provenance: "operator_verified",
				freshness: "fresh",
				updatedAt: now.toISOString(),
			} as TransferCatalogRecord;
			entries.set(entryId, published);
			return { ok: true, record: published };
		},
		setPublicationStatus: async (id, publicationStatus, options) => {
			const entry = entries.get(id);
			if (!entry) return { ok: false, reason: "not_found" };
			const refusal = publicationStatus === "published" ? publishRefusal(entry, options) : null;
			if (refusal) return refusal;
			const updated = { ...entry, publicationStatus };
			entries.set(id, updated);
			return { ok: true, record: updated };
		},
		delete: async (id) => entries.delete(id),
	};
	return createCatalogService(repository, { now: () => now, freshnessDays: 30 });
}

/** The publish guard lives in data-ops now, so the double answers in the same currency. */
function publishRefusal(
	draft: TransferCatalogDraftInput,
	options: CatalogClockOptions,
): Extract<TransferCatalogPublishOutcome, { reason: "validation_failed" }> | null {
	const validation = validateTransferCatalogPublish(draft, {
		now: options.now ?? now,
		freshnessDays: options.freshnessDays ?? 30,
	});
	return validation.ok
		? null
		: { ok: false, reason: "validation_failed", fieldErrors: validation.fieldErrors };
}

function freshnessFor(
	input: TransferCatalogDraftInput,
	existing: TransferCatalogRecord,
): TransferCatalogRecord["freshness"] {
	return { ...existing, ...input }.checkedAt ? "fresh" : "incomplete";
}

function buildApp() {
	const service = createStatefulService();
	const handlers = createOperatorCatalogHandlers({
		createService: () => service,
		getSession: async (request) => {
			const cookie = request.headers.get("cookie");
			const bearer = request.headers.get("authorization");
			if (cookie === "better-auth.session_token=operator") return { user: { id: "operator" } };
			if (cookie === "better-auth.session_token=user") return { user: { id: "user" } };
			if (bearer === "Bearer operator-session") return { user: { id: "operator" } };
			if (bearer === "Bearer user-session") return { user: { id: "user" } };
			return null;
		},
		getUserRole: async (id) => (id === "operator" ? "operator" : "user"),
	});
	const app = new Hono();
	app.route("/operator/catalog", handlers);
	return app;
}

const operatorHeaders = {
	"content-type": "application/json",
	cookie: "better-auth.session_token=operator",
};

const currentPublishInput: TransferCatalogDraftInput = {
	operatorName: "Terravision",
	serviceName: "BGY → Milano Centrale",
	destinationStopCode: "milano-centrale",
	destinationStopName: "Milano Centrale",
	durationMinutes: 50,
	transferCount: 0,
	walkingMinutes: 0,
	walkingMeters: 0,
	sourceUrl: "https://www.terravision.eu/airport_transfer/bus-bergamo-airport-milan/",
	checkedAt: now.toISOString(),
	costMinorMin: 500,
	costMinorMax: 1_000,
	purchaseUrl: "https://www.flixbus.com/bus-routes/bus-bergamo-orio-al-serio-airport-milan",
};

describe("operator catalog Hono API", () => {
	const endpointMatrix = [
		["GET", "/operator/catalog"],
		["GET", "/operator/catalog/missing"],
		["POST", "/operator/catalog"],
		["POST", "/operator/catalog/publish"],
		["PATCH", "/operator/catalog/missing"],
		["POST", "/operator/catalog/missing/publish"],
		["POST", "/operator/catalog/missing/unpublish"],
		["DELETE", "/operator/catalog/missing"],
	] as const;

	it.each(
		endpointMatrix,
	)("rejects unauthenticated %s %s with 401 before catalog access", async (method, path) => {
		const response = await buildApp().request(path, {
			method,
			headers: { "content-type": "application/json" },
			body: method === "GET" ? undefined : "{}",
		});
		expect(response.status).toBe(401);
	});

	it.each(
		endpointMatrix,
	)("rejects authenticated users for %s %s with 403", async (method, path) => {
		const response = await buildApp().request(path, {
			method,
			headers: {
				"content-type": "application/json",
				cookie: "better-auth.session_token=user",
			},
			body: method === "GET" ? undefined : "{}",
		});
		expect(response.status).toBe(403);
	});

	it("supports the complete operator lifecycle through the raw cookie API", async () => {
		const app = buildApp();
		const createdResponse = await app.request("/operator/catalog", {
			method: "POST",
			headers: operatorHeaders,
			body: JSON.stringify({ operatorName: "Airport Bus Express" }),
		});
		expect(createdResponse.status).toBe(201);
		const created = (await createdResponse.json()) as TransferCatalogRecord;
		expect(created).toMatchObject({ publicationStatus: "draft", freshness: "incomplete" });

		const publishIncomplete = await app.request(`/operator/catalog/${created.id}/publish`, {
			method: "POST",
			headers: operatorHeaders,
		});
		expect(publishIncomplete.status).toBe(422);
		expect(await publishIncomplete.json()).toMatchObject({
			code: "CATALOG_VALIDATION",
			fieldErrors: { serviceName: expect.any(String), checkedAt: expect.any(String) },
		});

		const editable = {
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
		expect(
			(
				await app.request(`/operator/catalog/${created.id}`, {
					method: "PATCH",
					headers: operatorHeaders,
					body: JSON.stringify(editable),
				})
			).status,
		).toBe(200);
		const publishedResponse = await app.request(`/operator/catalog/${created.id}/publish`, {
			method: "POST",
			headers: operatorHeaders,
		});
		expect(publishedResponse.status).toBe(200);
		expect(await publishedResponse.json()).toMatchObject({ publicationStatus: "published" });

		const listResponse = await app.request("/operator/catalog", {
			headers: { authorization: "Bearer operator-session" },
		});
		expect(listResponse.status).toBe(200);
		const listText = await listResponse.text();
		expect(JSON.parse(listText)).toMatchObject({
			entries: [{ id: created.id, freshness: "fresh", publicationStatus: "published" }],
		});
		for (const forbidden of [
			"destination",
			"trip",
			"room",
			"message",
			"report",
			"email",
			"consent",
		]) {
			expect(listText.toLowerCase()).not.toContain(`"${forbidden}"`);
		}

		expect(
			(
				await app.request(`/operator/catalog/${created.id}/unpublish`, {
					method: "POST",
					headers: operatorHeaders,
				})
			).status,
		).toBe(200);
		expect(
			(
				await app.request(`/operator/catalog/${created.id}`, {
					method: "DELETE",
					headers: operatorHeaders,
				})
			).status,
		).toBe(204);
		expect(
			(
				await app.request(`/operator/catalog/${created.id}`, {
					headers: operatorHeaders,
				})
			).status,
		).toBe(404);
	});

	it("atomically publishes current values from saved and new drafts", async () => {
		const app = buildApp();
		const savedResponse = await app.request("/operator/catalog", {
			method: "POST",
			headers: operatorHeaders,
			body: JSON.stringify({ operatorName: "Stary zapis" }),
		});
		const saved = (await savedResponse.json()) as TransferCatalogRecord;

		const updatedResponse = await app.request(`/operator/catalog/${saved.id}/publish`, {
			method: "POST",
			headers: operatorHeaders,
			body: JSON.stringify(currentPublishInput),
		});
		expect(updatedResponse.status).toBe(200);
		expect(await updatedResponse.json()).toMatchObject({
			...currentPublishInput,
			publicationStatus: "published",
		});

		const createdResponse = await app.request("/operator/catalog/publish", {
			method: "POST",
			headers: operatorHeaders,
			body: JSON.stringify({ ...currentPublishInput, serviceName: "Nowy transfer" }),
		});
		expect(createdResponse.status).toBe(201);
		expect(await createdResponse.json()).toMatchObject({
			serviceName: "Nowy transfer",
			checkedAt: now.toISOString(),
			publicationStatus: "published",
		});
	});

	it("keeps URL, price, and date publish boundaries server-authoritative", async () => {
		const app = buildApp();
		const invalidInput = {
			operatorName: "Operator",
			serviceName: "Usługa",
			destinationStopCode: "stop",
			destinationStopName: "Przystanek",
			durationMinutes: 1,
			transferCount: 0,
			walkingMinutes: 0,
			walkingMeters: 0,
			sourceUrl: "https://evil.example/source",
			checkedAt: "2026-07-27T12:00:00.001Z",
			costMinorMin: 100,
			costMinorMax: 99,
			purchaseUrl: "https://operator:secret@www.terravision.eu/buy",
		};
		const response = await app.request("/operator/catalog", {
			method: "POST",
			headers: operatorHeaders,
			body: JSON.stringify({ operatorName: "Szkic" }),
		});
		const entry = (await response.json()) as TransferCatalogRecord;
		const publish = await app.request(`/operator/catalog/${entry.id}/publish`, {
			method: "POST",
			headers: operatorHeaders,
			body: JSON.stringify(invalidInput),
		});
		expect(publish.status).toBe(422);
		expect(await publish.json()).toMatchObject({
			fieldErrors: {
				sourceUrl: "Host „evil.example” nie jest zatwierdzony.",
				purchaseUrl: "Adres nie może zawierać nazwy użytkownika ani hasła.",
				checkedAt: "Data kontroli nie może być z przyszłości.",
				costMinorMax: "Cena maksymalna nie może być niższa od minimalnej.",
			},
		});
	});

	it("does not expose the server-side role command through HTTP", async () => {
		const response = await buildApp().request("/operator/roles/grant", {
			method: "POST",
			headers: operatorHeaders,
			body: JSON.stringify({ email: "operator@example.com" }),
		});
		expect(response.status).toBe(404);
	});
});
