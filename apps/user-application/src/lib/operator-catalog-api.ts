import {
	type TransferCatalogDraftInput,
	type TransferCatalogEditableField,
	type TransferCatalogRecord,
	TransferCatalogRecordSchema,
	validateTransferCatalogPublish,
} from "@repo/data-ops/journey";
import { z } from "zod";

const API_URL = import.meta.env.VITE_DATA_SERVICE_URL || "http://localhost:8788";
const CatalogListSchema = z.strictObject({ entries: z.array(TransferCatalogRecordSchema) });

export class CatalogApiError extends Error {
	constructor(
		message: string,
		public code: string,
		public status: number,
		public fieldErrors: Partial<Record<TransferCatalogEditableField, string>> = {},
	) {
		super(message);
		this.name = "CatalogApiError";
	}
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
	const response = await fetch(`${API_URL}/operator/catalog${path}`, {
		...init,
		headers: init.body ? { "content-type": "application/json", ...init.headers } : init.headers,
		credentials: "include",
	});
	if (response.ok) return response;
	const body = (await response.json().catch(() => ({}))) as {
		error?: string;
		code?: string;
		fieldErrors?: Partial<Record<TransferCatalogEditableField, string>>;
	};
	throw new CatalogApiError(
		body.error ?? "Nie udało się wykonać operacji.",
		body.code ?? "CATALOG_API_ERROR",
		response.status,
		body.fieldErrors,
	);
}

export async function listCatalogEntries(): Promise<TransferCatalogRecord[]> {
	const response = await request("/");
	return CatalogListSchema.parse(await response.json()).entries;
}

export async function createCatalogDraft(
	input: TransferCatalogDraftInput,
): Promise<TransferCatalogRecord> {
	const response = await request("/", { method: "POST", body: JSON.stringify(input) });
	return TransferCatalogRecordSchema.parse(await response.json());
}

export async function updateCatalogDraft(
	id: string,
	input: TransferCatalogDraftInput,
): Promise<TransferCatalogRecord> {
	const response = await request(`/${encodeURIComponent(id)}`, {
		method: "PATCH",
		body: JSON.stringify(input),
	});
	return TransferCatalogRecordSchema.parse(await response.json());
}

async function changePublication(
	id: string,
	action: "publish" | "unpublish",
): Promise<TransferCatalogRecord> {
	const response = await request(`/${encodeURIComponent(id)}/${action}`, { method: "POST" });
	return TransferCatalogRecordSchema.parse(await response.json());
}

export const publishCatalogEntry = (id: string) => changePublication(id, "publish");
export const unpublishCatalogEntry = (id: string) => changePublication(id, "unpublish");

export async function deleteCatalogEntry(id: string): Promise<void> {
	await request(`/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function getCatalogPublishFieldErrors(
	input: TransferCatalogDraftInput,
	now: Date,
	freshnessDays: number,
): Partial<Record<TransferCatalogEditableField, string>> {
	const result = validateTransferCatalogPublish(input, { now, freshnessDays });
	return result.ok ? {} : result.fieldErrors;
}
