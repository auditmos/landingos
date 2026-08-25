import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
	countTransferCatalogEntries,
	createTransferCatalogDraft,
	DEFAULT_TRANSFER_CATALOG_SEED,
	deleteTransferCatalogRecord,
	getTransferCatalogRecord,
	listPublishedTransferCatalog,
	listTransferCatalogRecords,
	saveAndPublishTransferCatalog,
	seedTransferCatalog,
	setTransferCatalogPublicationStatus,
	updateTransferCatalogDraft,
} from "./queries";

async function createTestDatabase() {
	const client = new PGlite();
	for (const migrationName of ["0004_workable_meggan.sql", "0005_late_darkstar.sql"]) {
		const migration = readFileSync(
			resolve(import.meta.dirname, `../drizzle/migrations/dev/${migrationName}`),
			"utf8",
		);
		await client.exec(migration);
	}
	return {
		client,
		db: drizzle(client) as unknown as Parameters<typeof seedTransferCatalog>[0],
	};
}

describe("transfer catalog persistence and seed", () => {
	const now = new Date("2026-07-27T12:00:00.000Z");

	it("applies the generated migration and seeds twice without duplicates", async () => {
		const { client, db } = await createTestDatabase();
		try {
			expect(await seedTransferCatalog(db)).toBe(1);
			expect(await seedTransferCatalog(db)).toBe(0);
			expect(await countTransferCatalogEntries(db)).toBe(1);
			const entries = await listPublishedTransferCatalog(db, { now });
			expect(entries).toHaveLength(1);
			expect(entries[0]).toMatchObject(DEFAULT_TRANSFER_CATALOG_SEED[0] as object);
			expect(entries[0]).not.toHaveProperty("placeId");
			expect(entries[0]).not.toHaveProperty("coordinates");
		} finally {
			await client.close();
		}
	});

	it("returns only published entries in deterministic ID order", async () => {
		const { client, db } = await createTestDatabase();
		try {
			await seedTransferCatalog(db, [
				{
					...(DEFAULT_TRANSFER_CATALOG_SEED[0] as NonNullable<
						(typeof DEFAULT_TRANSFER_CATALOG_SEED)[0]
					>),
					id: "z-published",
				},
				{
					...(DEFAULT_TRANSFER_CATALOG_SEED[0] as NonNullable<
						(typeof DEFAULT_TRANSFER_CATALOG_SEED)[0]
					>),
					id: "a-published",
				},
			]);
			await createTransferCatalogDraft(db, { operatorName: "Szkic" }, { id: "a-draft", now });
			expect((await listPublishedTransferCatalog(db, { now })).map((entry) => entry.id)).toEqual([
				"a-published",
				"z-published",
			]);
		} finally {
			await client.close();
		}
	});

	it("persists an incomplete draft through edit, publish, unpublish, and delete", async () => {
		const { client, db } = await createTestDatabase();
		try {
			const draft = await createTransferCatalogDraft(
				db,
				{ operatorName: "Operator szkicu" },
				{ id: "operator-entry", now },
			);
			expect(draft).toMatchObject({
				id: "operator-entry",
				publicationStatus: "draft",
				freshness: "incomplete",
				serviceName: null,
			});
			expect(
				await setTransferCatalogPublicationStatus(db, draft.id, "published", { now }),
			).toMatchObject({
				ok: false,
				reason: "validation_failed",
				fieldErrors: { serviceName: "Uzupełnij nazwę usługi." },
			});
			expect(await getTransferCatalogRecord(db, draft.id, { now })).toMatchObject({
				publicationStatus: "draft",
				freshness: "incomplete",
			});

			const complete = DEFAULT_TRANSFER_CATALOG_SEED[0] as NonNullable<
				(typeof DEFAULT_TRANSFER_CATALOG_SEED)[0]
			>;
			const {
				id: _id,
				originIata: _origin,
				publicationStatus: _status,
				provenance: _provenance,
				...editable
			} = complete;
			expect(await updateTransferCatalogDraft(db, draft.id, editable, { now })).toMatchObject({
				freshness: "fresh",
				publicationStatus: "draft",
			});
			expect(
				await setTransferCatalogPublicationStatus(db, draft.id, "published", { now }),
			).toMatchObject({ ok: true, record: { publicationStatus: "published" } });
			expect((await listPublishedTransferCatalog(db, { now })).map((entry) => entry.id)).toEqual([
				draft.id,
			]);
			expect(
				await setTransferCatalogPublicationStatus(db, draft.id, "draft", { now }),
			).toMatchObject({ ok: true, record: { publicationStatus: "draft" } });
			expect(await deleteTransferCatalogRecord(db, draft.id)).toBe(true);
			expect(await deleteTransferCatalogRecord(db, draft.id)).toBe(false);
			expect(await getTransferCatalogRecord(db, draft.id, { now })).toBeNull();
		} finally {
			await client.close();
		}
	});

	it("atomically persists current UTC check dates at exact now and 30-day boundaries", async () => {
		const { client, db } = await createTestDatabase();
		try {
			const complete = DEFAULT_TRANSFER_CATALOG_SEED[0] as NonNullable<
				(typeof DEFAULT_TRANSFER_CATALOG_SEED)[0]
			>;
			const {
				id: _id,
				originIata: _origin,
				publicationStatus: _status,
				provenance: _provenance,
				...editable
			} = complete;
			const draft = await createTransferCatalogDraft(
				db,
				{ operatorName: "Stary zapis" },
				{ id: "existing-atomic", now },
			);
			const exactNow = now.toISOString();
			const exactThirtyDays = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000).toISOString();

			expect(
				await saveAndPublishTransferCatalog(
					db,
					draft.id,
					{ ...editable, operatorName: "Aktualny formularz", checkedAt: exactNow },
					{ now, freshnessDays: 30 },
				),
			).toMatchObject({
				ok: true,
				record: {
					operatorName: "Aktualny formularz",
					checkedAt: exactNow,
					publicationStatus: "published",
				},
			});
			expect(
				await saveAndPublishTransferCatalog(
					db,
					null,
					{ ...editable, checkedAt: exactThirtyDays },
					{ now, freshnessDays: 30 },
				),
			).toMatchObject({
				ok: true,
				record: { checkedAt: exactThirtyDays, publicationStatus: "published" },
			});
		} finally {
			await client.close();
		}
	});

	it("refuses to publish an invalid draft through the raw query and persists nothing", async () => {
		const { client, db } = await createTestDatabase();
		try {
			const complete = DEFAULT_TRANSFER_CATALOG_SEED[0] as NonNullable<
				(typeof DEFAULT_TRANSFER_CATALOG_SEED)[0]
			>;
			const {
				id: _id,
				originIata: _origin,
				publicationStatus: _status,
				provenance: _provenance,
				...editable
			} = complete;
			const draft = await createTransferCatalogDraft(
				db,
				{ operatorName: "Szkic" },
				{ id: "guarded-entry", now },
			);

			expect(
				await saveAndPublishTransferCatalog(
					db,
					draft.id,
					{ ...editable, operatorName: null },
					{ now, freshnessDays: 30 },
				),
			).toMatchObject({
				ok: false,
				reason: "validation_failed",
				fieldErrors: { operatorName: "Uzupełnij nazwę operatora." },
			});
			expect(await getTransferCatalogRecord(db, draft.id, { now })).toMatchObject({
				publicationStatus: "draft",
				operatorName: "Szkic",
				serviceName: null,
			});

			expect(
				await saveAndPublishTransferCatalog(
					db,
					null,
					{ ...editable, purchaseUrl: "https://evil.example/tickets" },
					{ now, freshnessDays: 30 },
				),
			).toMatchObject({
				ok: false,
				reason: "validation_failed",
				fieldErrors: { purchaseUrl: "Host „evil.example” nie jest zatwierdzony." },
			});
			expect(await countTransferCatalogEntries(db)).toBe(1);

			expect(
				await saveAndPublishTransferCatalog(db, "brak-wpisu", editable, { now, freshnessDays: 30 }),
			).toEqual({ ok: false, reason: "not_found" });
		} finally {
			await client.close();
		}
	});

	it("flags stale published records for operators and excludes them from recommendations", async () => {
		const { client, db } = await createTestDatabase();
		try {
			await seedTransferCatalog(db);
			const staleNow = new Date("2026-08-26T00:00:00.001Z");
			expect(await listPublishedTransferCatalog(db, { now: staleNow })).toEqual([]);
			expect(await listTransferCatalogRecords(db, { now: staleNow })).toMatchObject([
				{
					id: "bgy-airport-bus-centrale",
					publicationStatus: "published",
					freshness: "stale",
				},
			]);
			await updateTransferCatalogDraft(
				db,
				"bgy-airport-bus-centrale",
				{ checkedAt: staleNow.toISOString() },
				{ now: staleNow },
			);
			expect(await listPublishedTransferCatalog(db, { now: staleNow })).toHaveLength(1);
		} finally {
			await client.close();
		}
	});
});
