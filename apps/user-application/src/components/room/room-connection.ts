import {
	RoomRealtimeErrorSchema,
	type RoomRealtimeEvent,
	RoomRealtimeEventSchema,
	type RoomSnapshot,
} from "@repo/data-ops/room";
import { type Dispatch, type SetStateAction, useEffect } from "react";
import { fetchRoomSnapshot, issueRoomTicket, roomWebSocketUrl } from "@/lib/room-api";
import { upsertMember, upsertMessage } from "./room-entry";

type SnapshotSetter = Dispatch<SetStateAction<RoomSnapshot | null>>;

type RoomSocketHandlers = {
	open: () => void;
	message: (event: MessageEvent) => void;
	close: (event: CloseEvent) => void;
};

async function openRoomConnection(
	roomId: string,
	recoverHistory: boolean,
	handlers: RoomSocketHandlers,
) {
	const recovered = recoverHistory ? await fetchRoomSnapshot(roomId) : undefined;
	const ticket = await issueRoomTicket(roomId);
	const socket = new WebSocket(roomWebSocketUrl(roomId, ticket.ticket));
	socket.addEventListener("open", handlers.open);
	socket.addEventListener("message", handlers.message);
	socket.addEventListener("close", handlers.close);
	return { recovered, socket };
}

type RealtimeFrame =
	| { kind: "event"; event: Exclude<RoomRealtimeEvent, { type: "room_redacted" }> }
	| { kind: "redaction" }
	| { kind: "socket_error"; message: string }
	| { kind: "invalid" };

/**
 * Classifies one raw socket frame exactly once. Every downstream outcome —
 * message, member, redaction, server-side error, unusable payload — is a
 * distinct variant, so the dispatch site owns each one and only once.
 */
function parseRealtimeFrame(raw: string): RealtimeFrame {
	let value: unknown;
	try {
		value = JSON.parse(raw);
	} catch {
		return { kind: "invalid" };
	}
	const event = RoomRealtimeEventSchema.safeParse(value);
	if (event.success) {
		return event.data.type === "room_redacted"
			? { kind: "redaction" }
			: { kind: "event", event: event.data };
	}
	const realtimeError = RoomRealtimeErrorSchema.safeParse(value);
	if (realtimeError.success) return { kind: "socket_error", message: realtimeError.data.error };
	return { kind: "invalid" };
}

function applyRealtimeEvent(
	setSnapshot: SnapshotSetter,
	event: Exclude<RoomRealtimeEvent, { type: "room_redacted" }>,
) {
	setSnapshot((current) => {
		if (!current) return current;
		if (event.type === "message_created") {
			return {
				...current,
				messages: upsertMessage(current.messages, event.message),
			};
		}
		return {
			...current,
			members: upsertMember(current.members, event.member),
		};
	});
}

/**
 * Fires `closeRoomView` the moment the room's closesAt deadline passes,
 * re-arming in chunks below the 32-bit setTimeout ceiling for far deadlines.
 */
export function useRoomExpiry(closesAt: string | undefined, closeRoomView: () => void) {
	useEffect(() => {
		if (!closesAt) return;
		let timer: ReturnType<typeof setTimeout>;
		const schedule = () => {
			const remaining = new Date(closesAt).getTime() - Date.now();
			if (remaining <= 0) {
				closeRoomView();
				return;
			}
			timer = setTimeout(
				remaining > 2_147_000_000 ? schedule : closeRoomView,
				Math.min(remaining, 2_147_000_000),
			);
		};
		schedule();
		return () => clearTimeout(timer);
	}, [closesAt, closeRoomView]);
}

/**
 * Keeps one live, self-reconnecting room WebSocket for the given room id and
 * feeds its realtime events into the snapshot state. A server close with code
 * 4001 (room expired) triggers `closeRoomView`; any other disconnect recovers
 * history and reconnects with a fresh single-use ticket.
 */
export function useRoomSocket(
	roomId: string | undefined,
	handlers: {
		setSnapshot: SnapshotSetter;
		setError: Dispatch<SetStateAction<string>>;
		setConnection: Dispatch<SetStateAction<string>>;
		closeRoomView: () => void;
	},
) {
	const { setSnapshot, setError, setConnection, closeRoomView } = handlers;
	useEffect(() => {
		if (!roomId) return;
		const activeRoomId = roomId;
		let active = true;
		let socket: WebSocket | undefined;
		let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

		function handleOpen() {
			if (active) setConnection("Połączono");
		}

		// A redaction removes content the client already holds, so the whole
		// snapshot is refetched. Like every other socket callback it must not
		// write after teardown: a refetch still in flight when the room closes
		// would otherwise re-open a socket to a room the server already ended.
		function refetchAfterRedaction() {
			void fetchRoomSnapshot(activeRoomId)
				.then((refreshed) => {
					if (active) setSnapshot(refreshed);
				})
				.catch(() => {
					if (active) closeRoomView();
				});
		}

		function handleMessage(raw: MessageEvent) {
			if (!active || typeof raw.data !== "string") return;
			const frame = parseRealtimeFrame(raw.data);
			switch (frame.kind) {
				case "event":
					applyRealtimeEvent(setSnapshot, frame.event);
					return;
				case "redaction":
					refetchAfterRedaction();
					return;
				case "socket_error":
					setError(frame.message);
					return;
				case "invalid":
					setError("Odebrano nieprawidłowe zdarzenie pokoju.");
					return;
			}
		}

		function handleClose(event: CloseEvent) {
			if (!active) return;
			if (event.code === 4001) {
				closeRoomView();
				return;
			}
			setConnection("Przywracanie połączenia…");
			reconnectTimer = setTimeout(() => void connect(true), 1_000);
		}

		function connect(recoverHistory: boolean) {
			void openRoomConnection(activeRoomId, recoverHistory, {
				open: handleOpen,
				message: handleMessage,
				close: handleClose,
			})
				.then((prepared) => {
					if (!active) {
						prepared.socket.close(1000, "Widok został zamknięty");
						return;
					}
					if (prepared.recovered) setSnapshot(prepared.recovered);
					socket = prepared.socket;
				})
				.catch((caught: unknown) => {
					if (!active) return;
					setConnection("Połączenie przerwane");
					setError(caught instanceof Error ? caught.message : "Nie udało się połączyć z pokojem.");
				});
		}

		connect(false);
		return () => {
			active = false;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			socket?.close(1000, "Zmiana widoku");
		};
	}, [roomId, setSnapshot, setError, setConnection, closeRoomView]);
}
