import type { TransferCatalogRecord } from "@repo/data-ops/journey";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createCatalogDraft,
	deleteCatalogEntry,
	getCatalogPublishFieldErrors,
	listCatalogEntries,
	publishCatalogEntry,
	unpublishCatalogEntry,
	updateCatalogDraft,
} from "./operator-catalog-api";

const baseRecord: TransferCatalogRecord = {
	id: "entry-1",
	originIata: "BGY",
	operatorName: "Operator",
	serviceName: "Usługa",
	destinationStopCode: "stop",
	destinationStopName: "Przystanek",
	durationMinutes: 50,
	transferCount: 0,
	walkingMinutes: 0,
	walkingMeters: 0,
	sourceUrl: "https://www.milanbergamoairport.it/en/bus/",
	checkedAt: "2026-07-27T00:00:00.000Z",
	costMinorMin: 0,
	costMinorMax: 0,
	purchaseUrl: "https://www.airportbusexpress.it/tickets",
	publicationStatus: "draft",
	provenance: "operator_verified",
	freshness: "fresh",
	createdAt: "2026-07-27T00:00:00.000Z",
	updatedAt: "2026-07-27T00:00:00.000Z",
};

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("operator catalog browser client", () => {
	it("completes CRUD over cookies without exposing a browser bearer", async () => {
		let current: TransferCatalogRecord | null = null;
		// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: explicit in-memory HTTP fixture covers each CRUD route
		const fetchSpy = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const path = new URL(String(input)).pathname;
			if (init?.method === "POST" && path.replace(/\/$/, "") === "/operator/catalog") {
				current = { ...baseRecord, ...JSON.parse(String(init.body)) };
				return Response.json(current, { status: 201 });
			}
			if (init?.method === "PATCH") {
				current = { ...(current as TransferCatalogRecord), ...JSON.parse(String(init.body)) };
				return Response.json(current);
			}
			if (path.endsWith("/publish")) {
				current = { ...(current as TransferCatalogRecord), publicationStatus: "published" };
				return Response.json(current);
			}
			if (path.endsWith("/unpublish")) {
				current = { ...(current as TransferCatalogRecord), publicationStatus: "draft" };
				return Response.json(current);
			}
			if (init?.method === "DELETE") {
				current = null;
				return new Response(null, { status: 204 });
			}
			return Response.json({ entries: current ? [current] : [] });
		});
		vi.stubGlobal("fetch", fetchSpy);

		await createCatalogDraft({ operatorName: "Operator" });
		await updateCatalogDraft("entry-1", { serviceName: "Usługa" });
		expect(await publishCatalogEntry("entry-1")).toMatchObject({
			publicationStatus: "published",
		});
		expect(await listCatalogEntries()).toHaveLength(1);
		expect(await unpublishCatalogEntry("entry-1")).toMatchObject({ publicationStatus: "draft" });
		await deleteCatalogEntry("entry-1");
		expect(await listCatalogEntries()).toEqual([]);

		for (const call of fetchSpy.mock.calls) {
			const init = call[1];
			expect(init?.credentials).toBe("include");
			expect(new Headers(init?.headers).has("Authorization")).toBe(false);
		}
	});

	it("uses the shared API contract for identical URL, price, and date errors", () => {
		const errors = getCatalogPublishFieldErrors(
			{
				...baseRecord,
				sourceUrl: "https://evil.example/source",
				purchaseUrl: "http://www.airportbusexpress.it/tickets",
				costMinorMin: 2,
				costMinorMax: 1,
				checkedAt: "2026-07-27T12:00:00.001Z",
			},
			new Date("2026-07-27T12:00:00.000Z"),
			30,
		);
		expect(errors).toMatchObject({
			sourceUrl: "Dozwolony jest wyłącznie zatwierdzony adres HTTPS.",
			purchaseUrl: "Dozwolony jest wyłącznie zatwierdzony adres HTTPS.",
			costMinorMax: "Cena maksymalna nie może być niższa od minimalnej.",
			checkedAt: "Data kontroli nie może być z przyszłości.",
		});
	});
});
