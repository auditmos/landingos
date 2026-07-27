import {
	type BlockedMembersResponse,
	BlockedMembersResponseSchema,
	type CommunityRulesAcceptanceResponse,
	CommunityRulesAcceptanceResponseSchema,
	type CommunityRulesStatusResponse,
	CommunityRulesStatusResponseSchema,
	type RoomBlockResponse,
	RoomBlockResponseSchema,
	type SafetyReportCreateRequest,
	SafetyReportCreateRequestSchema,
	type SafetyReportCreateResponse,
	SafetyReportCreateResponseSchema,
} from "@repo/data-ops/safety";

const DEFAULT_API_URL = import.meta.env.VITE_DATA_SERVICE_URL || "http://localhost:8788";
const JSON_HEADERS: HeadersInit = { "content-type": "application/json" };

async function safetyRequest(
	path: string,
	init: RequestInit,
	fetchImpl: typeof fetch,
): Promise<unknown> {
	const response = await fetchImpl(`${DEFAULT_API_URL}${path}`, {
		...init,
		headers: init.headers ?? JSON_HEADERS,
		credentials: "include",
	});
	const body = await response.json().catch(() => undefined);
	if (!response.ok) {
		const message =
			typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
				? body.error
				: "Nie udało się wykonać operacji bezpieczeństwa.";
		const error = new Error(message);
		error.name =
			typeof body === "object" && body !== null && "code" in body && typeof body.code === "string"
				? body.code
				: "SAFETY_API_ERROR";
		throw error;
	}
	return body;
}

export async function fetchCommunityRules(
	fetchImpl: typeof fetch = fetch,
): Promise<CommunityRulesStatusResponse> {
	return CommunityRulesStatusResponseSchema.parse(
		await safetyRequest("/safety/rules", { method: "GET" }, fetchImpl),
	);
}

export async function acceptCommunityRules(
	version: string,
	fetchImpl: typeof fetch = fetch,
): Promise<CommunityRulesAcceptanceResponse> {
	return CommunityRulesAcceptanceResponseSchema.parse(
		await safetyRequest(
			"/safety/rules/accept",
			{ method: "POST", body: JSON.stringify({ version }) },
			fetchImpl,
		),
	);
}

export async function fetchBlockedMembers(
	roomId: string,
	fetchImpl: typeof fetch = fetch,
): Promise<BlockedMembersResponse> {
	return BlockedMembersResponseSchema.parse(
		await safetyRequest(`/safety/rooms/${roomId}/blocks`, { method: "GET" }, fetchImpl),
	);
}

export async function blockRoomMember(
	roomId: string,
	targetPseudonym: string,
	fetchImpl: typeof fetch = fetch,
): Promise<RoomBlockResponse> {
	return RoomBlockResponseSchema.parse(
		await safetyRequest(
			`/safety/rooms/${roomId}/blocks`,
			{ method: "PUT", body: JSON.stringify({ targetPseudonym }) },
			fetchImpl,
		),
	);
}

export async function unblockRoomMember(
	roomId: string,
	targetPseudonym: string,
	fetchImpl: typeof fetch = fetch,
): Promise<RoomBlockResponse> {
	return RoomBlockResponseSchema.parse(
		await safetyRequest(
			`/safety/rooms/${roomId}/blocks/${encodeURIComponent(targetPseudonym)}`,
			{ method: "DELETE" },
			fetchImpl,
		),
	);
}

export async function reportRoomSafety(
	roomId: string,
	input: SafetyReportCreateRequest,
	fetchImpl: typeof fetch = fetch,
): Promise<SafetyReportCreateResponse> {
	return SafetyReportCreateResponseSchema.parse(
		await safetyRequest(
			`/safety/rooms/${roomId}/reports`,
			{
				method: "POST",
				body: JSON.stringify(SafetyReportCreateRequestSchema.parse(input)),
			},
			fetchImpl,
		),
	);
}
