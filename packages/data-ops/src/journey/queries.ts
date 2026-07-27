import { asc, count, eq } from "drizzle-orm";
import type { getDb } from "@/database/setup";
import {
	type TransferCatalogEntry,
	TransferCatalogEntrySchema,
	type TransferCatalogEntryWrite,
} from "./schema";
import { transferCatalogEntries } from "./table";

type TransferCatalogDatabase = Pick<ReturnType<typeof getDb>, "insert" | "select">;

export const DEFAULT_TRANSFER_CATALOG_SEED: TransferCatalogEntryWrite[] = [
	{
		id: "bgy-airport-bus-centrale",
		operatorName: "Airport Bus Express",
		serviceName: "BGY → Milano Centrale",
		originIata: "BGY",
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
		purchaseUrl:
			"https://www.airportbusexpress.it/en-GB/bus-stop-timetable/bergamo-orio-al-serio-milan-central-station",
		publicationStatus: "published",
		provenance: "seeded_fixture",
	},
];

const publicSelection = {
	id: transferCatalogEntries.id,
	operatorName: transferCatalogEntries.operatorName,
	serviceName: transferCatalogEntries.serviceName,
	originIata: transferCatalogEntries.originIata,
	destinationStopCode: transferCatalogEntries.destinationStopCode,
	destinationStopName: transferCatalogEntries.destinationStopName,
	durationMinutes: transferCatalogEntries.durationMinutes,
	transferCount: transferCatalogEntries.transferCount,
	walkingMinutes: transferCatalogEntries.walkingMinutes,
	walkingMeters: transferCatalogEntries.walkingMeters,
	sourceUrl: transferCatalogEntries.sourceUrl,
	checkedAt: transferCatalogEntries.checkedAt,
	costMinorMin: transferCatalogEntries.costMinorMin,
	costMinorMax: transferCatalogEntries.costMinorMax,
	purchaseUrl: transferCatalogEntries.purchaseUrl,
	publicationStatus: transferCatalogEntries.publicationStatus,
	provenance: transferCatalogEntries.provenance,
	createdAt: transferCatalogEntries.createdAt,
	updatedAt: transferCatalogEntries.updatedAt,
};

function toTransferCatalogEntry(row: {
	id: string;
	operatorName: string;
	serviceName: string;
	originIata: string;
	destinationStopCode: string;
	destinationStopName: string;
	durationMinutes: number;
	transferCount: number;
	walkingMinutes: number;
	walkingMeters: number;
	sourceUrl: string;
	checkedAt: Date;
	costMinorMin: number;
	costMinorMax: number;
	purchaseUrl: string;
	publicationStatus: string;
	provenance: string;
	createdAt: Date;
	updatedAt: Date;
}): TransferCatalogEntry {
	return TransferCatalogEntrySchema.parse({
		...row,
		checkedAt: row.checkedAt.toISOString(),
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	});
}

export async function seedTransferCatalog(
	db: TransferCatalogDatabase,
	entries: TransferCatalogEntryWrite[] = DEFAULT_TRANSFER_CATALOG_SEED,
): Promise<number> {
	const inserted = await db
		.insert(transferCatalogEntries)
		.values(
			entries.map(({ checkedAt, ...entry }) => ({
				...entry,
				checkedAt: new Date(checkedAt),
			})),
		)
		.onConflictDoNothing({ target: transferCatalogEntries.id })
		.returning({ id: transferCatalogEntries.id });
	return inserted.length;
}

export async function listPublishedTransferCatalog(
	db: TransferCatalogDatabase,
): Promise<TransferCatalogEntry[]> {
	const rows = await db
		.select(publicSelection)
		.from(transferCatalogEntries)
		.where(eq(transferCatalogEntries.publicationStatus, "published"))
		.orderBy(asc(transferCatalogEntries.id));
	return rows.map(toTransferCatalogEntry);
}

export async function countTransferCatalogEntries(db: TransferCatalogDatabase): Promise<number> {
	const [result] = await db.select({ total: count() }).from(transferCatalogEntries);
	return result?.total ?? 0;
}
