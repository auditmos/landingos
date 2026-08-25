import type { getDb } from "@repo/data-ops/database/setup";
import {
	type CatalogClockOptions,
	createTransferCatalogDraft,
	DEFAULT_TRANSFER_CATALOG_FRESHNESS_DAYS,
	deleteTransferCatalogRecord,
	getTransferCatalogRecord,
	listTransferCatalogRecords,
	saveAndPublishTransferCatalog,
	setTransferCatalogPublicationStatus,
	type TransferCatalogDraftInput,
	type TransferCatalogRecord,
	updateTransferCatalogDraft,
	validateTransferCatalogPublish,
} from "@repo/data-ops/journey";
import type { RuntimeVars } from "../runtime-vars";

export interface CatalogRepository {
	list(options: CatalogClockOptions): Promise<TransferCatalogRecord[]>;
	get(id: string, options: CatalogClockOptions): Promise<TransferCatalogRecord | null>;
	create(
		input: TransferCatalogDraftInput,
		options: CatalogClockOptions,
	): Promise<TransferCatalogRecord>;
	update(
		id: string,
		input: TransferCatalogDraftInput,
		options: CatalogClockOptions,
	): Promise<TransferCatalogRecord | null>;
	saveAndPublish(
		id: string | null,
		input: TransferCatalogDraftInput,
		options: CatalogClockOptions,
	): Promise<TransferCatalogRecord | null>;
	setPublicationStatus(
		id: string,
		status: "draft" | "published",
		options: CatalogClockOptions,
	): Promise<TransferCatalogRecord | null>;
	delete(id: string): Promise<boolean>;
}

export function resolveCatalogFreshnessDays(env: RuntimeVars): number {
	const raw = env.TRANSFER_CATALOG_FRESHNESS_DAYS;
	const parsed = Number(raw ?? DEFAULT_TRANSFER_CATALOG_FRESHNESS_DAYS);
	return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_TRANSFER_CATALOG_FRESHNESS_DAYS;
}

export function createDatabaseCatalogRepository(db: ReturnType<typeof getDb>): CatalogRepository {
	return {
		list: (options) => listTransferCatalogRecords(db, options),
		get: (id, options) => getTransferCatalogRecord(db, id, options),
		create: (input, options) => createTransferCatalogDraft(db, input, options),
		update: (id, input, options) => updateTransferCatalogDraft(db, id, input, options),
		saveAndPublish: (id, input, options) => saveAndPublishTransferCatalog(db, id, input, options),
		setPublicationStatus: (id, status, options) =>
			setTransferCatalogPublicationStatus(db, id, status, options),
		delete: (id) => deleteTransferCatalogRecord(db, id),
	};
}

interface CatalogServiceOptions {
	now(): Date;
	freshnessDays: number;
}

export type CatalogResult<T> =
	| { ok: true; data: T }
	| { ok: false; reason: "not_found" }
	| {
			ok: false;
			reason: "validation_error";
			fieldErrors: Record<string, string>;
	  };

export function createCatalogService(
	repository: CatalogRepository,
	options: CatalogServiceOptions,
) {
	const clock = (): Required<CatalogClockOptions> => ({
		now: options.now(),
		freshnessDays: options.freshnessDays,
	});
	return {
		list: () => repository.list(clock()),
		get: (id: string) => repository.get(id, clock()),
		create: (input: TransferCatalogDraftInput) => repository.create(input, clock()),
		async update(
			id: string,
			input: TransferCatalogDraftInput,
		): Promise<CatalogResult<TransferCatalogRecord>> {
			const current = await repository.get(id, clock());
			if (!current) return { ok: false, reason: "not_found" };
			if (current.publicationStatus === "published") {
				const validation = validateTransferCatalogPublish({ ...current, ...input }, clock());
				if (!validation.ok) {
					return {
						ok: false,
						reason: "validation_error",
						fieldErrors: validation.fieldErrors as Record<string, string>,
					};
				}
			}
			const updated = await repository.update(id, input, clock());
			return updated ? { ok: true, data: updated } : { ok: false, reason: "not_found" };
		},
		async saveAndPublish(
			id: string | null,
			input: TransferCatalogDraftInput,
		): Promise<CatalogResult<TransferCatalogRecord>> {
			if (id && !(await repository.get(id, clock()))) {
				return { ok: false, reason: "not_found" };
			}
			const validation = validateTransferCatalogPublish(input, clock());
			if (!validation.ok) {
				return {
					ok: false,
					reason: "validation_error",
					fieldErrors: validation.fieldErrors as Record<string, string>,
				};
			}
			const published = await repository.saveAndPublish(id, input, clock());
			return published ? { ok: true, data: published } : { ok: false, reason: "not_found" };
		},
		async publish(id: string): Promise<CatalogResult<TransferCatalogRecord>> {
			const entry = await repository.get(id, clock());
			if (!entry) return { ok: false, reason: "not_found" };
			const validation = validateTransferCatalogPublish(entry, clock());
			if (!validation.ok) {
				return {
					ok: false,
					reason: "validation_error",
					fieldErrors: validation.fieldErrors as Record<string, string>,
				};
			}
			const published = await repository.setPublicationStatus(id, "published", clock());
			return published ? { ok: true, data: published } : { ok: false, reason: "not_found" };
		},
		async unpublish(id: string): Promise<CatalogResult<TransferCatalogRecord>> {
			const entry = await repository.setPublicationStatus(id, "draft", clock());
			return entry ? { ok: true, data: entry } : { ok: false, reason: "not_found" };
		},
		delete: (id: string) => repository.delete(id),
	};
}

export type CatalogService = ReturnType<typeof createCatalogService>;
