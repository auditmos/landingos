import {
	type SafetyReportQueueItem,
	SafetyReportQueueItemSchema,
	type SafetyReportQueueQuery,
	type SafetyReportQueueResponse,
	SafetyReportQueueResponseSchema,
	type SafetyReportStatus,
} from "@repo/data-ops/safety";

const API_URL = import.meta.env.VITE_DATA_SERVICE_URL || "http://localhost:8788";

export class OperatorReportsApiError extends Error {
	constructor(
		message: string,
		public code: string,
		public status: number,
	) {
		super(message);
		this.name = "OperatorReportsApiError";
	}
}

function queueSearch(query: SafetyReportQueueQuery): string {
	const search = new URLSearchParams();
	if (query.status) search.set("status", query.status);
	if (query.reason) search.set("reason", query.reason);
	if (query.limit !== undefined) search.set("limit", String(query.limit));
	if (query.offset !== undefined) search.set("offset", String(query.offset));
	const serialized = search.toString();
	return serialized ? `?${serialized}` : "";
}

async function reportsRequest(path: string, init: RequestInit, fallback: string): Promise<unknown> {
	const response = await fetch(`${API_URL}/operator/reports${path}`, {
		...init,
		headers: init.body ? { "content-type": "application/json", ...init.headers } : init.headers,
		credentials: "include",
	});
	const body = (await response.json().catch(() => undefined)) as
		| { error?: string; code?: string }
		| undefined;
	if (!response.ok) {
		throw new OperatorReportsApiError(
			body?.error ?? fallback,
			body?.code ?? "REPORT_QUEUE_API_ERROR",
			response.status,
		);
	}
	return body;
}

export async function listSafetyReports(
	query: SafetyReportQueueQuery = {},
): Promise<SafetyReportQueueResponse> {
	// The collection root is the mounted route `/operator/reports` itself — Hono
	// does not match a trailing slash, so the path stays bare.
	return SafetyReportQueueResponseSchema.parse(
		await reportsRequest(
			queueSearch(query),
			{ method: "GET" },
			"Nie udało się pobrać kolejki zgłoszeń.",
		),
	);
}

export async function setSafetyReportStatus(
	reportId: string,
	status: SafetyReportStatus,
): Promise<SafetyReportQueueItem> {
	return SafetyReportQueueItemSchema.parse(
		await reportsRequest(
			`/${encodeURIComponent(reportId)}`,
			{ method: "PATCH", body: JSON.stringify({ status }) },
			"Nie udało się zmienić statusu zgłoszenia.",
		),
	);
}
