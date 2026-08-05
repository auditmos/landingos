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

function applyRealtimeEvent(setSnapshot: SnapshotSetter, event: RoomRealtimeEvent) {
	if (event.type === "room_redacted") return;
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

function handleRealtimePayload(
	rawData: string,
	setSnapshot: SnapshotSetter,
	setError: Dispatch<SetStateAction<string>>,
) {
	try {
		const value: unknown = JSON.parse(rawData);
		const event = RoomRealtimeEventSchema.safeParse(value);
		if (event.success) {
			applyRealtimeEvent(setSnapshot, event.data);
			return;
		}
		const realtimeError = RoomRealtimeErrorSchema.safeParse(value);
		if (realtimeError.success) setError(realtimeError.data.error);
	} catch {
		setError("Odebrano nieprawidłowe zdarzenie pokoju.");
	}
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

		function handleMessage(raw: MessageEvent) {
			if (!active || typeof raw.data !== "string") return;
			try {
				const parsed = RoomRealtimeEventSchema.safeParse(JSON.parse(raw.data));
				if (parsed.success && parsed.data.type === "room_redacted") {
					void fetchRoomSnapshot(activeRoomId).then(setSnapshot).catch(closeRoomView);
					return;
				}
			} catch {
				// The shared payload parser below renders the Polish validation error.
			}
			handleRealtimePayload(raw.data, setSnapshot, setError);
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
