import type {
	PublicRoomMember,
	RoomAccessContext,
	RoomRealtimeEvent,
	RoomSnapshot,
} from "@repo/data-ops/room";
import { describe, expect, it, vi } from "vitest";
import {
	createFlightRoomService,
	type FlightRoomServiceDependencies,
	type FlightRoomServiceError,
	hashConnectionTicket,
	ROOM_CONNECTION_TICKET_TTL_MS,
} from "./service";

const room = {
	id: "018f4c8e-5697-7df4-8f6e-c7644b137e5b",
	flightInstanceId: "flight-1",
};
const member: PublicRoomMember = { pseudonym: "Alicja BGY", selection: null };
const access: RoomAccessContext = {
	room,
	membershipId: "018f4c8e-5697-7df4-8f6e-c7644b137e51",
	userId: "user-1",
	coordinatorKey: "flight-1",
};
const snapshot: RoomSnapshot = { room, member, members: [member], messages: [] };

function dependencies(
	overrides: Partial<FlightRoomServiceDependencies> = {},
): FlightRoomServiceDependencies {
	return {
		now: () => new Date("2026-09-14T07:00:00.000Z"),
		getIdentityProfile: vi.fn(async () => ({
			id: "user-1",
			emailVerified: true,
			pseudonym: "Alicja BGY",
			marketingConsentGranted: false,
			marketingConsentPolicyVersion: null,
			marketingConsentUpdatedAt: null,
			role: "user",
		})),
		joinFlightRoom: vi.fn(async () => ({
			room,
			membershipId: access.membershipId,
			membershipCreated: true,
		})),
		getRoomSnapshot: vi.fn(async () => snapshot),
		getRoomAccessContext: vi.fn(async () => access),
		replaceRoomSelection: vi.fn(async (_roomId, _userId, selection) => ({
			...member,
			selection,
		})),
		createRoomMessage: vi.fn(async (_roomId, _userId, input) => ({
			created: true,
			message: {
				id: "018f4c8e-5697-7df4-8f6e-c7644b137e52",
				clientMessageId: input.clientMessageId,
				pseudonym: member.pseudonym,
				content: input.content,
				createdAt: "2026-09-14T07:00:00.000Z",
			},
		})),
		createConnectionTicket: vi.fn(async () => undefined),
		consumeConnectionTicket: vi.fn(async () => ({ userId: "user-1" })),
		broadcast: vi.fn(async () => undefined),
		...overrides,
	};
}

describe("flight room service ordering and idempotency", () => {
	it("requires a verified profile and valid pseudonym before joining", async () => {
		const deps = dependencies({
			getIdentityProfile: vi.fn(async () => ({
				id: "user-1",
				emailVerified: true,
				pseudonym: null,
				marketingConsentGranted: false,
				marketingConsentPolicyVersion: null,
				marketingConsentUpdatedAt: null,
				role: "user",
			})),
		});

		await expect(createFlightRoomService(deps).join("flight-1", "user-1")).rejects.toEqual(
			expect.objectContaining<Partial<FlightRoomServiceError>>({
				code: "PSEUDONYM_REQUIRED",
				status: 409,
				message: expect.stringMatching(/pseudonim/i),
			}),
		);
		expect(deps.joinFlightRoom).not.toHaveBeenCalled();
	});

	it("broadcasts a join only after a newly persisted membership", async () => {
		const order: string[] = [];
		const deps = dependencies({
			joinFlightRoom: vi.fn(async () => {
				order.push("persist");
				return { room, membershipId: access.membershipId, membershipCreated: true };
			}),
			broadcast: vi.fn(async () => {
				order.push("broadcast");
			}),
		});
		expect(await createFlightRoomService(deps).join("flight-1", "user-1")).toEqual(snapshot);
		expect(order).toEqual(["persist", "broadcast"]);

		deps.joinFlightRoom = vi.fn(async () => ({
			room,
			membershipId: access.membershipId,
			membershipCreated: false,
		}));
		await createFlightRoomService(deps).join("flight-1", "user-1");
		expect(deps.broadcast).toHaveBeenCalledTimes(1);
	});

	it("persists selection and message changes before broadcasting them", async () => {
		const order: string[] = [];
		const selectionMember: PublicRoomMember = {
			...member,
			selection: { kind: "shared_taxi" },
		};
		const events: RoomRealtimeEvent[] = [];
		const deps = dependencies({
			replaceRoomSelection: vi.fn(async () => {
				order.push("selection:persist");
				return selectionMember;
			}),
			createRoomMessage: vi.fn(async (_roomId, _userId, input) => {
				order.push("message:persist");
				return {
					created: true,
					message: {
						id: "018f4c8e-5697-7df4-8f6e-c7644b137e52",
						clientMessageId: input.clientMessageId,
						pseudonym: member.pseudonym,
						content: input.content,
						createdAt: "2026-09-14T07:00:00.000Z",
					},
				};
			}),
			broadcast: vi.fn(async (_key, _roomId, event) => {
				order.push(`${event.type}:broadcast`);
				events.push(event);
			}),
		});
		const service = createFlightRoomService(deps);
		await service.replaceSelection(room.id, "user-1", { kind: "shared_taxi" });
		await service.createMessage(room.id, "user-1", {
			clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e53",
			content: "Jedziemy razem",
		});

		expect(order).toEqual([
			"selection:persist",
			"selection_changed:broadcast",
			"message:persist",
			"message_created:broadcast",
		]);
		expect(events).toHaveLength(2);
	});

	it("returns an existing retry without broadcasting it again", async () => {
		const deps = dependencies({
			createRoomMessage: vi.fn(async (_roomId, _userId, input) => ({
				created: false,
				message: {
					id: "018f4c8e-5697-7df4-8f6e-c7644b137e52",
					clientMessageId: input.clientMessageId,
					pseudonym: member.pseudonym,
					content: input.content,
					createdAt: "2026-09-14T07:00:00.000Z",
				},
			})),
		});
		const result = await createFlightRoomService(deps).createMessage(room.id, "user-1", {
			clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e53",
			content: "Ponowienie",
		});
		expect(result.created).toBe(false);
		expect(deps.broadcast).not.toHaveBeenCalled();
	});
});

describe("flight room connection tickets", () => {
	it("stores only a SHA-256 hash and sets the documented 60-second expiry", async () => {
		const deps = dependencies();
		const response = await createFlightRoomService(deps).issueTicket(room.id, "user-1");
		expect(response.ticket).toMatch(/^[a-f0-9]{64}$/);
		expect(response.expiresAt).toBe("2026-09-14T07:01:00.000Z");
		expect(ROOM_CONNECTION_TICKET_TTL_MS).toBe(60_000);
		expect(deps.createConnectionTicket).toHaveBeenCalledWith(
			expect.objectContaining({
				tokenHash: await hashConnectionTicket(response.ticket),
				expiresAt: new Date("2026-09-14T07:01:00.000Z"),
			}),
		);
		expect(deps.createConnectionTicket).not.toHaveBeenCalledWith(
			expect.objectContaining({ tokenHash: response.ticket }),
		);
	});

	it("revalidates membership after atomically consuming a ticket", async () => {
		const deps = dependencies();
		expect(await createFlightRoomService(deps).authenticateTicket(room.id, "a".repeat(64))).toEqual(
			access,
		);
		expect(deps.consumeConnectionTicket).toHaveBeenCalledWith(
			expect.objectContaining({
				roomId: room.id,
				tokenHash: await hashConnectionTicket("a".repeat(64)),
			}),
		);
		expect(deps.getRoomAccessContext).toHaveBeenLastCalledWith(room.id, "user-1");
	});
});
