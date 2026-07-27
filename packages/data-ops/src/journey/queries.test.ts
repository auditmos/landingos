import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import {
	countTransferCatalogEntries,
	DEFAULT_TRANSFER_CATALOG_SEED,
	listPublishedTransferCatalog,
	seedTransferCatalog,
} from "./queries";

async function createTestDatabase() {
	const client = new PGlite();
	const migration = readFileSync(
		resolve(import.meta.dirname, "../drizzle/migrations/dev/0004_workable_meggan.sql"),
		"utf8",
	);
	await client.exec(migration);
	return {
		client,
		db: drizzle(client) as unknown as Parameters<typeof seedTransferCatalog>[0],
	};
}

describe("transfer catalog persistence and seed", () => {
	it("applies the generated migration and seeds twice without duplicates", async () => {
		const { client, db } = await createTestDatabase();
		try {
			expect(await seedTransferCatalog(db)).toBe(1);
			expect(await seedTransferCatalog(db)).toBe(0);
			expect(await countTransferCatalogEntries(db)).toBe(1);
			const entries = await listPublishedTransferCatalog(db);
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
					id: "a-draft",
					publicationStatus: "draft",
				},
				{
					...(DEFAULT_TRANSFER_CATALOG_SEED[0] as NonNullable<
						(typeof DEFAULT_TRANSFER_CATALOG_SEED)[0]
					>),
					id: "a-published",
				},
			]);
			expect((await listPublishedTransferCatalog(db)).map((entry) => entry.id)).toEqual([
				"a-published",
				"z-published",
			]);
		} finally {
			await client.close();
		}
	});
});
