import type { RoomSnapshot } from "@repo/data-ops/room";
import { describe, expect, it, vi } from "vitest";
import {
	fetchPastFlights,
	fetchRoomSnapshot,
	issueRoomTicket,
	joinRoom,
	listMyRooms,
	roomWebSocketUrl,
	sendRoomMessage,
	updateRoomSelection,
} from "./room-api";

const roomId = "018f4c8e-5697-7df4-8f6e-c7644b137e5b";
const snapshot: RoomSnapshot = {
	room: {
		id: roomId,
		flightInstanceId: "flight-1",
		closesAt: "2026-09-15T08:20:00.000Z",
	},
	member: { pseudonym: "Alicja BGY", selection: null },
	members: [{ pseudonym: "Alicja BGY", selection: null }],
	messages: [],
};

describe("flight room browser API", () => {
	it("uses the session cookie for join, refresh, selection, message, and ticket calls", async () => {
		const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
			const path = new URL(String(input)).pathname;
			if (path.endsWith("/past")) {
				return Response.json([]);
			}
			if (path.endsWith("/rooms")) {
				return Response.json([snapshot.room]);
			}
			if (path.endsWith("/selection")) {
				return Response.json({
					pseudonym: "Alicja BGY",
					selection: { kind: "shared_taxi" },
				});
			}
			if (path.endsWith("/messages")) {
				return Response.json(
					{
						created: true,
						message: {
							id: "018f4c8e-5697-7df4-8f6e-c7644b137e51",
							clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e52",
							pseudonym: "Alicja BGY",
							content: "Cześć!",
							createdAt: "2026-09-14T07:00:00.000Z",
						},
					},
					{ status: 201 },
				);
			}
			if (path.endsWith("/tickets")) {
				return Response.json(
					{
						ticket: "a".repeat(64),
						expiresAt: "2026-09-14T07:01:00.000Z",
					},
					{ status: 201 },
				);
			}
			return Response.json(snapshot);
		});

		await joinRoom("flight-1", fetchMock);
		await fetchRoomSnapshot(roomId, fetchMock);
		const rooms = await listMyRooms(fetchMock);
		expect(rooms).toEqual([snapshot.room]);
		expect(await fetchPastFlights(fetchMock)).toEqual([]);
		await updateRoomSelection(roomId, { kind: "shared_taxi" }, fetchMock);
		await sendRoomMessage(
			roomId,
			{
				clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e52",
				content: "Cześć!",
			},
			fetchMock,
		);
		await issueRoomTicket(roomId, fetchMock);

		expect(fetchMock).toHaveBeenCalledTimes(7);
		for (const call of fetchMock.mock.calls) {
			const init = call[1];
			expect(init?.credentials).toBe("include");
			expect(new Headers(init?.headers).has("Authorization")).toBe(false);
		}
	});

	it("creates a browser WebSocket URL with only room ID and one-time ticket", () => {
		const url = roomWebSocketUrl(roomId, "a".repeat(64), "https://api-staging.landingos.app/");
		expect(url).toBe(
			`wss://api-staging.landingos.app/rooms/${roomId}/connect?ticket=${"a".repeat(64)}`,
		);
		expect(url).not.toMatch(/email|destination|token=|authorization/i);
	});
});
