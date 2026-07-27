import { DurableObject } from "cloudflare:workers";
import {
	ConnectionAttachmentSchema,
	RoomIdSchema,
	RoomRealtimeErrorSchema,
	type RoomRealtimeEvent,
	RoomRealtimeEventSchema,
} from "@repo/data-ops/room";
import { COMMUNITY_RULES_VERSION } from "@repo/data-ops/safety";

export const ROOM_ID_HEADER = "X-LandingOS-Room-Id";
export const ROOM_USER_ID_HEADER = "X-LandingOS-User-Id";
export const ROOM_CLOSES_AT_HEADER = "X-LandingOS-Room-Closes-At";
export const ROOM_RULES_VERSION_HEADER = "X-LandingOS-Rules-Version";
const RULES_TAG = `rules:${COMMUNITY_RULES_VERSION}`;
const ROOM_CLOSED_CODE = 4001;
const ROOM_CLOSED_MESSAGE = "Pokój tego lotu jest już zamknięty.";

function roomClosedResponse() {
	return Response.json({ code: "room_closed", error: ROOM_CLOSED_MESSAGE }, { status: 410 });
}

function errorPayload(
	code:
		| "BINARY_MESSAGE_NOT_SUPPORTED"
		| "MESSAGE_TRANSPORT_NOT_SUPPORTED"
		| "rules_acceptance_required",
) {
	const messages = {
		BINARY_MESSAGE_NOT_SUPPORTED: "Wiadomość musi być zwykłym tekstem.",
		MESSAGE_TRANSPORT_NOT_SUPPORTED: "Wiadomości wysyłaj przez bezpieczny formularz pokoju.",
		rules_acceptance_required:
			"Zaakceptuj aktualne zasady społeczności przed wysłaniem wiadomości.",
	} as const;
	return RoomRealtimeErrorSchema.parse({ type: "error", code, error: messages[code] });
}

export class FlightRoomDurableObject extends DurableObject<Env> {
	async fetch(request: Request): Promise<Response> {
		if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
			return new Response("Wymagane jest połączenie WebSocket.", { status: 426 });
		}
		const attachment = ConnectionAttachmentSchema.safeParse({
			roomId: request.headers.get(ROOM_ID_HEADER),
			userId: request.headers.get(ROOM_USER_ID_HEADER),
			closesAt: request.headers.get(ROOM_CLOSES_AT_HEADER),
		});
		if (!attachment.success) {
			return new Response("Brak prawidłowego kontekstu autoryzacji pokoju.", { status: 403 });
		}
		const closesAtMs = new Date(attachment.data.closesAt).getTime();
		if (Date.now() >= closesAtMs) return roomClosedResponse();

		const pair = new WebSocketPair();
		const client = pair[0];
		const server = pair[1];
		const tags = [attachment.data.roomId];
		if (request.headers.get(ROOM_RULES_VERSION_HEADER) === COMMUNITY_RULES_VERSION) {
			tags.push(RULES_TAG);
		}
		this.ctx.acceptWebSocket(server, tags);
		server.serializeAttachment(attachment.data);
		await this.ctx.storage.setAlarm(closesAtMs);
		return new Response(null, { status: 101, webSocket: client });
	}

	async closeExpiredSockets(nowMs = Date.now()): Promise<number> {
		let closed = 0;
		for (const socket of this.ctx.getWebSockets()) {
			const attachment = ConnectionAttachmentSchema.safeParse(socket.deserializeAttachment());
			if (!attachment.success || nowMs < new Date(attachment.data.closesAt).getTime()) {
				continue;
			}
			if (socket.readyState < WebSocket.CLOSING) {
				socket.close(ROOM_CLOSED_CODE, ROOM_CLOSED_MESSAGE);
				closed += 1;
			}
		}
		return closed;
	}

	async alarm(): Promise<void> {
		await this.closeExpiredSockets();
	}

	async broadcast(
		roomId: string,
		rawEvent: RoomRealtimeEvent,
		excludedUserIds: string[] = [],
	): Promise<void> {
		const expectedRoomId = RoomIdSchema.parse(roomId);
		const event = RoomRealtimeEventSchema.parse(rawEvent);
		await this.closeExpiredSockets();
		const payload = JSON.stringify(event);
		const excluded = new Set(excludedUserIds);
		for (const socket of this.ctx.getWebSockets(expectedRoomId)) {
			const attachment = ConnectionAttachmentSchema.safeParse(socket.deserializeAttachment());
			if (!attachment.success || attachment.data.roomId !== expectedRoomId) {
				socket.close(1008, "Nieprawidłowy kontekst pokoju.");
				continue;
			}
			if (excluded.has(attachment.data.userId)) continue;
			if (socket.readyState === WebSocket.OPEN) {
				socket.send(payload);
			}
		}
	}

	webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): void {
		const attachment = ConnectionAttachmentSchema.safeParse(socket.deserializeAttachment());
		if (!attachment.success) {
			socket.close(1008, "Nieprawidłowy kontekst autoryzacji.");
			return;
		}
		if (Date.now() >= new Date(attachment.data.closesAt).getTime()) {
			socket.close(ROOM_CLOSED_CODE, ROOM_CLOSED_MESSAGE);
			return;
		}
		const error =
			typeof message !== "string"
				? errorPayload("BINARY_MESSAGE_NOT_SUPPORTED")
				: this.ctx.getTags(socket).includes(RULES_TAG)
					? errorPayload("MESSAGE_TRANSPORT_NOT_SUPPORTED")
					: errorPayload("rules_acceptance_required");
		socket.send(JSON.stringify(error));
	}

	webSocketClose(_socket: WebSocket, _code: number, _reason: string, _wasClean: boolean): void {
		// The 2026-05-25 compatibility date enables the runtime's automatic close reply.
	}

	webSocketError(socket: WebSocket): void {
		socket.close(1011, "Błąd połączenia pokoju.");
	}
}
