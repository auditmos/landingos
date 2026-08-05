import {
	type ConnectionTicketResponse,
	ConnectionTicketResponseSchema,
	type PublicRoom,
	type PublicRoomMember,
	PublicRoomMemberSchema,
	PublicRoomSchema,
	type RoomMessageCreateRequest,
	RoomMessageCreateRequestSchema,
	type RoomMessageCreateResponse,
	RoomMessageCreateResponseSchema,
	type RoomSelection,
	type RoomSnapshot,
	RoomSnapshotSchema,
} from "@repo/data-ops/room";
import { z } from "zod";
import { analyticsFunnelHeaders, captureAnalyticsFunnel } from "./analytics-funnel";

const RoomListSchema = z.array(PublicRoomSchema);

/**
 * Lists the caller's open rooms from server-side membership, so the room can
 * be re-entered after the browser session state is gone (new tab, device,
 * restart). Sorted by the server: soonest-closing room first.
 */
export async function listMyRooms(fetchImpl: typeof fetch = fetch): Promise<PublicRoom[]> {
	return RoomListSchema.parse(await roomRequest("/rooms", { method: "GET" }, fetchImpl));
}

const DEFAULT_API_URL = import.meta.env.VITE_DATA_SERVICE_URL || "http://localhost:8788";
const JSON_HEADERS: HeadersInit = { "content-type": "application/json" };

async function roomRequest(
	path: string,
	init: RequestInit,
	fetchImpl: typeof fetch,
): Promise<unknown> {
	const headers = new Headers(init.headers ?? JSON_HEADERS);
	for (const [name, value] of Object.entries(analyticsFunnelHeaders())) {
		headers.set(name, value);
	}
	const response = await fetchImpl(`${DEFAULT_API_URL}${path}`, {
		...init,
		headers,
		credentials: "include",
	});
	captureAnalyticsFunnel(response);
	const body = await response.json().catch(() => undefined);
	if (!response.ok) {
		const message =
			typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
				? body.error
				: "Nie udało się połączyć z pokojem lotu.";
		const error = new Error(message);
		error.name =
			typeof body === "object" && body !== null && "code" in body && typeof body.code === "string"
				? body.code
				: "ROOM_API_ERROR";
		throw error;
	}
	return body;
}

export async function joinRoom(
	flightInstanceId: string,
	fetchImpl: typeof fetch = fetch,
): Promise<RoomSnapshot> {
	return RoomSnapshotSchema.parse(
		await roomRequest(
			"/rooms/join",
			{
				method: "POST",
				body: JSON.stringify({ flightInstanceId }),
			},
			fetchImpl,
		),
	);
}

export async function fetchRoomSnapshot(
	roomId: string,
	fetchImpl: typeof fetch = fetch,
): Promise<RoomSnapshot> {
	return RoomSnapshotSchema.parse(
		await roomRequest(`/rooms/${roomId}`, { method: "GET" }, fetchImpl),
	);
}

export async function updateRoomSelection(
	roomId: string,
	selection: RoomSelection,
	fetchImpl: typeof fetch = fetch,
): Promise<PublicRoomMember> {
	return PublicRoomMemberSchema.parse(
		await roomRequest(
			`/rooms/${roomId}/selection`,
			{
				method: "PUT",
				body: JSON.stringify({ selection }),
			},
			fetchImpl,
		),
	);
}

export async function sendRoomMessage(
	roomId: string,
	input: RoomMessageCreateRequest,
	fetchImpl: typeof fetch = fetch,
): Promise<RoomMessageCreateResponse> {
	return RoomMessageCreateResponseSchema.parse(
		await roomRequest(
			`/rooms/${roomId}/messages`,
			{
				method: "POST",
				body: JSON.stringify(RoomMessageCreateRequestSchema.parse(input)),
			},
			fetchImpl,
		),
	);
}

export async function issueRoomTicket(
	roomId: string,
	fetchImpl: typeof fetch = fetch,
): Promise<ConnectionTicketResponse> {
	return ConnectionTicketResponseSchema.parse(
		await roomRequest(`/rooms/${roomId}/tickets`, { method: "POST" }, fetchImpl),
	);
}

export function roomWebSocketUrl(roomId: string, ticket: string, apiUrl = DEFAULT_API_URL): string {
	const url = new URL(`/rooms/${roomId}/connect`, apiUrl);
	url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
	url.searchParams.set("ticket", ticket);
	return url.toString();
}
