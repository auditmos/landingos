import { asc, count, eq } from "drizzle-orm";
import type { getDb } from "@/database/setup";
import {
	getTransferCatalogFreshness,
	type TransferCatalogDraftInput,
	type TransferCatalogRecord,
	TransferCatalogRecordSchema,
	validateTransferCatalogPublish,
} from "./operator-schema";
import {
	type TransferCatalogEntry,
	TransferCatalogEntrySchema,
	type TransferCatalogEntryWrite,
} from "./schema";
import { transferCatalogEntries } from "./table";

type TransferCatalogDatabase = Pick<
	ReturnType<typeof getDb>,
	"delete" | "insert" | "select" | "update"
>;

export interface CatalogClockOptions {
	now?: Date;
	freshnessDays?: number;
}

export const DEFAULT_TRANSFER_CATALOG_FRESHNESS_DAYS = 30;

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

const catalogSelection = {
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

type CatalogRow = {
	id: string;
	operatorName: string | null;
	serviceName: string | null;
	originIata: string;
	destinationStopCode: string | null;
	destinationStopName: string | null;
	durationMinutes: number | null;
	transferCount: number | null;
	walkingMinutes: number | null;
	walkingMeters: number | null;
	sourceUrl: string | null;
	checkedAt: Date | null;
	costMinorMin: number | null;
	costMinorMax: number | null;
	purchaseUrl: string | null;
	publicationStatus: string;
	provenance: string;
	createdAt: Date;
	updatedAt: Date;
};

function clockOptions(options: CatalogClockOptions) {
	return {
		now: options.now ?? new Date(),
		freshnessDays: options.freshnessDays ?? DEFAULT_TRANSFER_CATALOG_FRESHNESS_DAYS,
	};
}

function toCatalogRecord(row: CatalogRow, options: CatalogClockOptions): TransferCatalogRecord {
	const draft = {
		operatorName: row.operatorName,
		serviceName: row.serviceName,
		destinationStopCode: row.destinationStopCode,
		destinationStopName: row.destinationStopName,
		durationMinutes: row.durationMinutes,
		transferCount: row.transferCount,
		walkingMinutes: row.walkingMinutes,
		walkingMeters: row.walkingMeters,
		sourceUrl: row.sourceUrl,
		checkedAt: row.checkedAt?.toISOString() ?? null,
		costMinorMin: row.costMinorMin,
		costMinorMax: row.costMinorMax,
		purchaseUrl: row.purchaseUrl,
	};
	return TransferCatalogRecordSchema.parse({
		id: row.id,
		originIata: row.originIata,
		...draft,
		publicationStatus: row.publicationStatus,
		provenance: row.provenance,
		freshness: getTransferCatalogFreshness(draft, clockOptions(options)),
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	});
}

function toPublishedEntry(record: TransferCatalogRecord): TransferCatalogEntry {
	const { freshness: _freshness, ...entry } = record;
	return TransferCatalogEntrySchema.parse(entry);
}

function draftValues(input: TransferCatalogDraftInput) {
	return {
		...input,
		checkedAt:
			input.checkedAt === undefined
				? undefined
				: input.checkedAt === null
					? null
					: new Date(input.checkedAt),
	};
}

export async function seedTransferCatalog(
	db: TransferCatalogDatabase,
	entries: TransferCatalogEntryWrite[] = DEFAULT_TRANSFER_CATALOG_SEED,
): Promise<number> {
	const inserted = await db
		.insert(transferCatalogEntries)
		.values(
			entries.map(({ checkedAt, ...entry }) => ({ ...entry, checkedAt: new Date(checkedAt) })),
		)
		.onConflictDoNothing({ target: transferCatalogEntries.id })
		.returning({ id: transferCatalogEntries.id });
	return inserted.length;
}

export async function listPublishedTransferCatalog(
	db: TransferCatalogDatabase,
	options: CatalogClockOptions = {},
): Promise<TransferCatalogEntry[]> {
	const rows = await db
		.select(catalogSelection)
		.from(transferCatalogEntries)
		.where(eq(transferCatalogEntries.publicationStatus, "published"))
		.orderBy(asc(transferCatalogEntries.id));
	return (rows as CatalogRow[])
		.map((row) => toCatalogRecord(row, options))
		.filter((record) => record.freshness === "fresh")
		.map(toPublishedEntry);
}

export async function listTransferCatalogRecords(
	db: TransferCatalogDatabase,
	options: CatalogClockOptions = {},
): Promise<TransferCatalogRecord[]> {
	const rows = await db
		.select(catalogSelection)
		.from(transferCatalogEntries)
		.orderBy(asc(transferCatalogEntries.id));
	return (rows as CatalogRow[]).map((row) => toCatalogRecord(row, options));
}

export async function getTransferCatalogRecord(
	db: TransferCatalogDatabase,
	id: string,
	options: CatalogClockOptions = {},
): Promise<TransferCatalogRecord | null> {
	const [row] = await db
		.select(catalogSelection)
		.from(transferCatalogEntries)
		.where(eq(transferCatalogEntries.id, id))
		.limit(1);
	return row ? toCatalogRecord(row as CatalogRow, options) : null;
}

export async function createTransferCatalogDraft(
	db: TransferCatalogDatabase,
	input: TransferCatalogDraftInput,
	options: CatalogClockOptions & { id?: string } = {},
): Promise<TransferCatalogRecord> {
	const now = options.now ?? new Date();
	const [row] = await db
		.insert(transferCatalogEntries)
		.values({
			id: options.id ?? crypto.randomUUID(),
			...draftValues(input),
			createdAt: now,
			updatedAt: now,
		})
		.returning(catalogSelection);
	if (!row) throw new Error("Nie udało się utworzyć wpisu katalogu.");
	return toCatalogRecord(row as CatalogRow, options);
}

export async function updateTransferCatalogDraft(
	db: TransferCatalogDatabase,
	id: string,
	input: TransferCatalogDraftInput,
	options: CatalogClockOptions = {},
): Promise<TransferCatalogRecord | null> {
	const [row] = await db
		.update(transferCatalogEntries)
		.set({ ...draftValues(input), updatedAt: options.now ?? new Date() })
		.where(eq(transferCatalogEntries.id, id))
		.returning(catalogSelection);
	return row ? toCatalogRecord(row as CatalogRow, options) : null;
}

export async function saveAndPublishTransferCatalog(
	db: TransferCatalogDatabase,
	id: string | null,
	input: TransferCatalogDraftInput,
	options: CatalogClockOptions = {},
): Promise<TransferCatalogRecord | null> {
	const now = options.now ?? new Date();
	const values = {
		...draftValues(input),
		publicationStatus: "published" as const,
		updatedAt: now,
	};
	const [row] = id
		? await db
				.update(transferCatalogEntries)
				.set(values)
				.where(eq(transferCatalogEntries.id, id))
				.returning(catalogSelection)
		: await db
				.insert(transferCatalogEntries)
				.values({ id: crypto.randomUUID(), ...values, createdAt: now })
				.returning(catalogSelection);
	return row ? toCatalogRecord(row as CatalogRow, options) : null;
}

export async function setTransferCatalogPublicationStatus(
	db: TransferCatalogDatabase,
	id: string,
	status: "draft" | "published",
	options: CatalogClockOptions = {},
): Promise<TransferCatalogRecord | null> {
	const existing = await getTransferCatalogRecord(db, id, options);
	if (!existing) return null;
	if (status === "published") {
		const validation = validateTransferCatalogPublish(existing, clockOptions(options));
		if (!validation.ok) return existing;
	}
	const [row] = await db
		.update(transferCatalogEntries)
		.set({ publicationStatus: status, updatedAt: options.now ?? new Date() })
		.where(eq(transferCatalogEntries.id, id))
		.returning(catalogSelection);
	return row ? toCatalogRecord(row as CatalogRow, options) : null;
}

export async function deleteTransferCatalogRecord(
	db: TransferCatalogDatabase,
	id: string,
): Promise<boolean> {
	const deleted = await db
		.delete(transferCatalogEntries)
		.where(eq(transferCatalogEntries.id, id))
		.returning({ id: transferCatalogEntries.id });
	return deleted.length === 1;
}

export async function countTransferCatalogEntries(db: TransferCatalogDatabase): Promise<number> {
	const [result] = await db.select({ total: count() }).from(transferCatalogEntries);
	return result?.total ?? 0;
}
