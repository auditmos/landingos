import { evictDurableObject } from "cloudflare:test";
import { env } from "cloudflare:workers";
import type { RoomRealtimeEvent } from "@repo/data-ops/room";
import { COMMUNITY_RULES_VERSION } from "@repo/data-ops/safety";
import { afterEach, describe, expect, it } from "vitest";
import type { FlightRoomDurableObject } from "./flight-room";

const ROOM_A = "018f4c8e-5697-7df4-8f6e-c7644b137e5b";
const ROOM_B = "018f51b4-c697-74ab-820f-d9e72852a52c";
const sockets: WebSocket[] = [];

const joinEvent: RoomRealtimeEvent = {
	type: "member_joined",
	member: { pseudonym: "Alicja BGY", selection: null },
};
const selectionEvent: RoomRealtimeEvent = {
	type: "selection_changed",
	member: { pseudonym: "Alicja BGY", selection: { kind: "shared_taxi" } },
};
const messageEvent: RoomRealtimeEvent = {
	type: "message_created",
	message: {
		id: "018f4c8e-5697-7df4-8f6e-c7644b137e51",
		clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e52",
		pseudonym: "Alicja BGY",
		content: "Spotkajmy się przy wyjściu.",
		createdAt: "2026-09-14T07:00:00.000Z",
	},
};

async function connect(
	stub: DurableObjectStub<FlightRoomDurableObject>,
	roomId: string,
	userId: string,
	rulesAccepted = true,
) {
	const response = await stub.fetch(
		new Request("https://room.internal/connect", {
			headers: {
				Upgrade: "websocket",
				"X-LandingOS-Room-Id": roomId,
				"X-LandingOS-User-Id": userId,
				...(rulesAccepted ? { "X-LandingOS-Rules-Version": COMMUNITY_RULES_VERSION } : undefined),
			},
		}),
	);
	expect(response.status).toBe(101);
	expect(response.webSocket).not.toBeNull();
	const socket = response.webSocket;
	if (!socket) throw new Error("Brak klienta WebSocket w odpowiedzi 101.");
	socket.accept();
	sockets.push(socket);
	return socket;
}

function receive(socket: WebSocket, timeoutMs = 5_000): Promise<string> {
	return new Promise((resolve, reject) => {
		const timeout = setTimeout(() => reject(new Error("Brak zdarzenia WebSocket.")), timeoutMs);
		socket.addEventListener(
			"message",
			(event) => {
				clearTimeout(timeout);
				resolve(String(event.data));
			},
			{ once: true },
		);
	});
}

afterEach(() => {
	for (const socket of sockets.splice(0)) {
		if (socket.readyState < WebSocket.CLOSING) socket.close(1000, "Koniec testu");
	}
});

describe("FlightRoomDurableObject hibernating WebSockets", () => {
	it("delivers join, selection, and message events to a second client under 5000 ms", async () => {
		const stub = env.FLIGHT_ROOM.getByName("flight-a");
		await connect(stub, ROOM_A, "user-a");
		const second = await connect(stub, ROOM_A, "user-b");

		for (const event of [joinEvent, selectionEvent, messageEvent]) {
			const pending = receive(second);
			const startedAt = performance.now();
			await stub.broadcast(ROOM_A, event);
			expect(JSON.parse(await pending)).toEqual(event);
			expect(performance.now() - startedAt).toBeLessThan(5_000);
		}
	});

	it("isolates two clients in one room from a third client in another room", async () => {
		const roomAStub = env.FLIGHT_ROOM.getByName("flight-a");
		const roomBStub = env.FLIGHT_ROOM.getByName("flight-b");
		const first = await connect(roomAStub, ROOM_A, "user-a");
		const second = await connect(roomAStub, ROOM_A, "user-b");
		const outsider = await connect(roomBStub, ROOM_B, "user-c");
		const outsiderEvents: string[] = [];
		outsider.addEventListener("message", (event: MessageEvent) => {
			outsiderEvents.push(String(event.data));
		});

		const firstPending = receive(first);
		const secondPending = receive(second);
		await roomAStub.broadcast(ROOM_A, messageEvent);
		expect(JSON.parse(await firstPending)).toEqual(messageEvent);
		expect(JSON.parse(await secondPending)).toEqual(messageEvent);
		await new Promise((resolve) => setTimeout(resolve, 25));
		expect(outsiderEvents).toEqual([]);
	});

	it("filters each realtime send for blocked recipients without affecting B or unrelated C", async () => {
		const stub = env.FLIGHT_ROOM.getByName("flight-filtered");
		const blocker = await connect(stub, ROOM_A, "user-a");
		const source = await connect(stub, ROOM_A, "user-b");
		const unrelated = await connect(stub, ROOM_A, "user-c");
		const blockerEvents: string[] = [];
		blocker.addEventListener("message", (event: MessageEvent) => {
			blockerEvents.push(String(event.data));
		});
		const sourcePending = receive(source);
		const unrelatedPending = receive(unrelated);
		await stub.broadcast(ROOM_A, messageEvent, ["user-a"]);
		expect(JSON.parse(await sourcePending)).toEqual(messageEvent);
		expect(JSON.parse(await unrelatedPending)).toEqual(messageEvent);
		await new Promise((resolve) => setTimeout(resolve, 25));
		expect(blockerEvents).toEqual([]);

		const futurePending = receive(blocker);
		await stub.broadcast(ROOM_A, selectionEvent);
		expect(JSON.parse(await futurePending)).toEqual(selectionEvent);
	});

	it("keeps the socket and authorization attachment across forced hibernation", async () => {
		const stub = env.FLIGHT_ROOM.getByName("flight-hibernation");
		const socket = await connect(stub, ROOM_A, "user-a");
		await evictDurableObject(stub, { webSockets: "hibernate" });

		const pendingEvent = receive(socket);
		await stub.broadcast(ROOM_A, selectionEvent);
		expect(JSON.parse(await pendingEvent)).toEqual(selectionEvent);

		const pendingError = receive(socket);
		socket.send("wiadomość wysłana niewłaściwym transportem");
		expect(JSON.parse(await pendingError)).toEqual({
			type: "error",
			code: "MESSAGE_TRANSPORT_NOT_SUPPORTED",
			error: "Wiadomości wysyłaj przez bezpieczny formularz pokoju.",
		});
	});

	it("accepts a replacement connection after forced hibernation and disconnect", async () => {
		const stub = env.FLIGHT_ROOM.getByName("flight-reconnect");
		const first = await connect(stub, ROOM_A, "user-a");
		await evictDurableObject(stub, { webSockets: "hibernate" });
		first.close(1000, "Test ponownego połączenia");

		const replacement = await connect(stub, ROOM_A, "user-a");
		const selectionPending = receive(replacement);
		await stub.broadcast(ROOM_A, selectionEvent);
		expect(JSON.parse(await selectionPending)).toEqual(selectionEvent);
		const messagePending = receive(replacement);
		await stub.broadcast(ROOM_A, messageEvent);
		expect(JSON.parse(await messagePending)).toEqual(messageEvent);
	});

	it("rejects missing authorization context and binary frames in Polish", async () => {
		const stub = env.FLIGHT_ROOM.getByName("flight-invalid");
		const rejected = await stub.fetch(
			new Request("https://room.internal/connect", {
				headers: { Upgrade: "websocket", "X-LandingOS-Room-Id": ROOM_A },
			}),
		);
		expect(rejected.status).toBe(403);
		expect(await rejected.text()).toMatch(/autoryzacji/i);

		const socket = await connect(stub, ROOM_A, "user-a");
		const pending = receive(socket);
		socket.send(new Uint8Array([1, 2, 3]).buffer);
		expect(JSON.parse(await pending)).toEqual({
			type: "error",
			code: "BINARY_MESSAGE_NOT_SUPPORTED",
			error: "Wiadomość musi być zwykłym tekstem.",
		});
	});

	it("returns rules_acceptance_required for unaccepted WebSocket sends", async () => {
		const stub = env.FLIGHT_ROOM.getByName("flight-rules");
		const socket = await connect(stub, ROOM_A, "user-a", false);
		const pending = receive(socket);
		socket.send("próba wysłania wiadomości");
		expect(JSON.parse(await pending)).toEqual({
			type: "error",
			code: "rules_acceptance_required",
			error: "Zaakceptuj aktualne zasady społeczności przed wysłaniem wiadomości.",
		});
	});
});
