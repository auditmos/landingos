import {
	type SafetyReportQueueQuery,
	type SafetyReportQueueResponse,
	SafetyReportQueueResponseSchema,
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
	if (query.reason) search.set("reason", query.reason);
	if (query.limit !== undefined) search.set("limit", String(query.limit));
	if (query.offset !== undefined) search.set("offset", String(query.offset));
	const serialized = search.toString();
	return serialized ? `?${serialized}` : "";
}

export async function listSafetyReports(
	query: SafetyReportQueueQuery = {},
	fetchImpl: typeof fetch = fetch,
): Promise<SafetyReportQueueResponse> {
	// The collection root is the mounted route `/operator/reports` itself — Hono
	// does not match a trailing slash, so the path stays bare.
	const response = await fetchImpl(`${API_URL}/operator/reports${queueSearch(query)}`, {
		method: "GET",
		credentials: "include",
	});
	const body = (await response.json().catch(() => undefined)) as
		| { error?: string; code?: string }
		| undefined;
	if (!response.ok) {
		throw new OperatorReportsApiError(
			body?.error ?? "Nie udało się pobrać kolejki zgłoszeń.",
			body?.code ?? "REPORT_QUEUE_API_ERROR",
			response.status,
		);
	}
	return SafetyReportQueueResponseSchema.parse(body);
}
