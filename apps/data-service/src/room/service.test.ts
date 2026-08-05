import type {
	PublicRoomMember,
	RoomAccessContext,
	RoomRealtimeEvent,
	RoomSnapshot,
} from "@repo/data-ops/room";
import { COMMUNITY_RULES_VERSION } from "@repo/data-ops/safety";
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
	closesAt: "2026-09-15T08:20:00.000Z",
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
		rulesVersion: COMMUNITY_RULES_VERSION,
		hasCommunityRulesAcceptance: vi.fn(async () => true),
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
		listActiveRooms: vi.fn(async () => [room]),
		listPastFlights: vi.fn(async () => []),
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
	it("allows every room operation at closeAt - 1 ms and returns room_closed at closeAt", async () => {
		let now = new Date("2026-09-15T08:19:59.999Z");
		const deps = dependencies({ now: () => now });
		const service = createFlightRoomService(deps);
		expect(await service.join("flight-1", "user-1")).toEqual(snapshot);
		expect(await service.list("user-1")).toEqual([room]);
		expect(await service.listPast("user-1")).toEqual([]);
		expect(await service.getSnapshot(room.id, "user-1")).toEqual(snapshot);
		await expect(
			service.replaceSelection(room.id, "user-1", { kind: "shared_taxi" }),
		).resolves.toBeDefined();
		await expect(
			service.createMessage(room.id, "user-1", {
				clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e50",
				content: "Ostatnia wiadomość",
			}),
		).resolves.toBeDefined();
		await expect(service.issueTicket(room.id, "user-1")).resolves.toBeDefined();
		await expect(service.authenticateUser(room.id, "user-1")).resolves.toEqual(access);

		now = new Date(room.closesAt);
		expect(await service.list("user-1")).toEqual([]);
		for (const operation of [
			service.join("flight-1", "user-1"),
			service.getSnapshot(room.id, "user-1"),
			service.replaceSelection(room.id, "user-1", { kind: "shared_taxi" }),
			service.createMessage(room.id, "user-1", {
				clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e51",
				content: "Za późno",
			}),
			service.issueTicket(room.id, "user-1"),
			service.authenticateUser(room.id, "user-1"),
			service.authenticateTicket(room.id, "a".repeat(64)),
		]) {
			await expect(operation).rejects.toMatchObject({
				code: "room_closed",
				status: 410,
			});
		}
	});

	it("allows join/read but rejects HTTP message sends until the current rules are accepted", async () => {
		const deps = dependencies({ hasCommunityRulesAcceptance: vi.fn(async () => false) });
		const service = createFlightRoomService(deps);
		expect(await service.join("flight-1", "user-1")).toEqual(snapshot);
		expect(await service.getSnapshot(room.id, "user-1")).toEqual(snapshot);
		vi.mocked(deps.broadcast).mockClear();
		await expect(
			service.createMessage(room.id, "user-1", {
				clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e53",
				content: "Pierwsza wiadomość",
			}),
		).rejects.toEqual(
			expect.objectContaining<Partial<FlightRoomServiceError>>({
				code: "rules_acceptance_required",
				status: 409,
				message: expect.stringMatching(/zasady społeczności/i),
			}),
		);
		expect(deps.createRoomMessage).not.toHaveBeenCalled();
		expect(deps.broadcast).not.toHaveBeenCalled();
	});

	it("does not prompt accepted users again until the configured rules version changes", async () => {
		const hasAcceptance = vi.fn(async (_userId: string, version: string) => {
			return version === COMMUNITY_RULES_VERSION;
		});
		const accepted = createFlightRoomService(
			dependencies({ hasCommunityRulesAcceptance: hasAcceptance }),
		);
		await accepted.createMessage(room.id, "user-1", {
			clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e53",
			content: "Pierwsza wiadomość po akceptacji",
		});
		await accepted.createMessage(room.id, "user-1", {
			clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e54",
			content: "Kolejna wiadomość bez ponownego pytania",
		});

		const changedVersion = createFlightRoomService(
			dependencies({
				rulesVersion: "2026-10-01-v2",
				hasCommunityRulesAcceptance: hasAcceptance,
			}),
		);
		await expect(
			changedVersion.createMessage(room.id, "user-1", {
				clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e55",
				content: "Wiadomość po zmianie zasad",
			}),
		).rejects.toMatchObject({ code: "rules_acceptance_required" });
		expect(hasAcceptance).toHaveBeenLastCalledWith("user-1", "2026-10-01-v2");
	});

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
		expect(deps.broadcast).toHaveBeenCalledWith(
			"flight-1",
			room.id,
			expect.objectContaining({ type: "message_created" }),
			"user-1",
		);
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
