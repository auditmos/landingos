import type { IdentityProfile } from "@repo/data-ops/identity";
import { isRoomReady } from "@repo/data-ops/identity";
import type {
	ConnectionTicketResponse,
	CreateConnectionTicketInput,
	JoinFlightRoomResult,
	PastFlightListing,
	PublicRoom,
	PublicRoomMember,
	RoomAccessContext,
	RoomListing,
	RoomMessageCreateRequest,
	RoomRealtimeEvent,
	RoomSelection,
	RoomSnapshot,
} from "@repo/data-ops/room";
import {
	ConnectionTicketResponseSchema,
	RoomMessageCreateRequestSchema,
	RoomQueryError,
	RoomSelectionSchema,
} from "@repo/data-ops/room";
import { COMMUNITY_RULES_VERSION } from "@repo/data-ops/safety";

export const ROOM_CONNECTION_TICKET_TTL_MS = 60_000;

export class FlightRoomServiceError extends Error {
	constructor(
		readonly code:
			| "PSEUDONYM_REQUIRED"
			| "ROOM_ACCESS_DENIED"
			| "ROOM_MESSAGE_INVALID"
			| "ROOM_SELECTION_INVALID"
			| "room_closed"
			| "flight_not_found"
			| "rules_acceptance_required",
		readonly status: 400 | 403 | 404 | 409 | 410,
		message: string,
	) {
		super(message);
		this.name = "FlightRoomServiceError";
	}
}

export interface FlightRoomServiceDependencies {
	now(): Date;
	rulesVersion?: string;
	hasCommunityRulesAcceptance(userId: string, rulesVersion: string): Promise<boolean>;
	getIdentityProfile(userId: string): Promise<IdentityProfile | null>;
	joinFlightRoom(input: {
		flightInstanceId: string;
		userId: string;
		now?: Date;
	}): Promise<JoinFlightRoomResult>;
	listActiveRooms(userId: string, now: Date): Promise<RoomListing[]>;
	listPastFlights(userId: string, now: Date): Promise<PastFlightListing[]>;
	getRoomSnapshot(roomId: string, userId: string): Promise<RoomSnapshot>;
	getRoomAccessContext(roomId: string, userId: string): Promise<RoomAccessContext | null>;
	replaceRoomSelection(
		roomId: string,
		userId: string,
		selection: RoomSelection,
	): Promise<PublicRoomMember>;
	createRoomMessage(
		roomId: string,
		userId: string,
		input: RoomMessageCreateRequest,
	): Promise<{ message: RoomSnapshot["messages"][number]; created: boolean }>;
	createConnectionTicket(input: CreateConnectionTicketInput): Promise<void>;
	consumeConnectionTicket(input: {
		tokenHash: string;
		roomId: string;
		now?: Date;
	}): Promise<{ userId: string } | null>;
	// Takes the room, not a (coordinatorKey, roomId) pair: one DO per canonical
	// flight instance is a locked decision, so the routing key is derivable and
	// must not be a second, independently-acquired identifier.
	broadcast(room: PublicRoom, event: RoomRealtimeEvent, sourceUserId: string): Promise<void>;
}

function randomConnectionTicket(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashConnectionTicket(ticket: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ticket));
	return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function accessOrThrow(
	dependencies: FlightRoomServiceDependencies,
	roomId: string,
	userId: string,
): Promise<RoomAccessContext> {
	const access = await dependencies.getRoomAccessContext(roomId, userId);
	if (!access) {
		throw new FlightRoomServiceError("ROOM_ACCESS_DENIED", 403, "Nie należysz do tego pokoju.");
	}
	ensureRoomOpen(access.room, dependencies.now());
	return access;
}

// The DB layer is the only place that knows a flight is unknown or its window has
// closed. Translating here keeps FlightRoomServiceError the single error currency
// above data-ops — otherwise RoomQueryError falls through the handler rethrow into
// onError and both states surface as a 500.
async function joinOrTranslate(
	dependencies: FlightRoomServiceDependencies,
	flightInstanceId: string,
	userId: string,
): Promise<JoinFlightRoomResult> {
	try {
		return await dependencies.joinFlightRoom({
			flightInstanceId,
			userId,
			now: dependencies.now(),
		});
	} catch (error) {
		if (!(error instanceof RoomQueryError)) throw error;
		if (error.code === "ROOM_CLOSED") {
			throw new FlightRoomServiceError("room_closed", 410, error.message);
		}
		// Unreachable behind the isRoomReady gate above, but a pseudonym the DB layer
		// refuses to freeze must not be reported as an unknown flight.
		if (error.code === "PSEUDONYM_REQUIRED") {
			throw new FlightRoomServiceError("PSEUDONYM_REQUIRED", 409, error.message);
		}
		throw new FlightRoomServiceError("flight_not_found", 404, error.message);
	}
}

function ensureRoomOpen(room: PublicRoom, now: Date): void {
	if (now.getTime() >= new Date(room.closesAt).getTime()) {
		throw new FlightRoomServiceError("room_closed", 410, "Pokój tego lotu jest już zamknięty.");
	}
}

export function createFlightRoomService(dependencies: FlightRoomServiceDependencies) {
	const rulesVersion = dependencies.rulesVersion ?? COMMUNITY_RULES_VERSION;
	return {
		async join(flightInstanceId: string, userId: string): Promise<RoomSnapshot> {
			const profile = await dependencies.getIdentityProfile(userId);
			if (!isRoomReady(profile)) {
				throw new FlightRoomServiceError(
					"PSEUDONYM_REQUIRED",
					409,
					"Ustaw prawidłowy pseudonim przed wejściem do pokoju.",
				);
			}
			const joined = await joinOrTranslate(dependencies, flightInstanceId, userId);
			// Belt-and-braces: joinFlightRoom already enforces this window in SQL with
			// the same clock, so this only guards a dependency that does not.
			ensureRoomOpen(joined.room, dependencies.now());
			const snapshot = await dependencies.getRoomSnapshot(joined.room.id, userId);
			if (joined.membershipCreated) {
				await dependencies.broadcast(
					joined.room,
					{
						type: "member_joined",
						member: snapshot.member,
					},
					userId,
				);
			}
			return snapshot;
		},

		async list(userId: string): Promise<RoomListing[]> {
			// Belt-and-braces: listActiveRooms filters the same window in SQL; this
			// re-filter only guards a dependency that does not.
			const now = dependencies.now();
			return (await dependencies.listActiveRooms(userId, now)).filter(
				(room) => now.getTime() < new Date(room.closesAt).getTime(),
			);
		},

		async listPast(userId: string): Promise<PastFlightListing[]> {
			return dependencies.listPastFlights(userId, dependencies.now());
		},

		async getSnapshot(roomId: string, userId: string): Promise<RoomSnapshot> {
			await accessOrThrow(dependencies, roomId, userId);
			return dependencies.getRoomSnapshot(roomId, userId);
		},

		async replaceSelection(
			roomId: string,
			userId: string,
			rawSelection: RoomSelection,
		): Promise<PublicRoomMember> {
			const parsed = RoomSelectionSchema.safeParse(rawSelection);
			if (!parsed.success) {
				throw new FlightRoomServiceError(
					"ROOM_SELECTION_INVALID",
					400,
					"Nieprawidłowy wybór transportu.",
				);
			}
			const access = await accessOrThrow(dependencies, roomId, userId);
			const member = await dependencies.replaceRoomSelection(roomId, userId, parsed.data);
			await dependencies.broadcast(
				access.room,
				{
					type: "selection_changed",
					member,
				},
				userId,
			);
			return member;
		},

		async createMessage(
			roomId: string,
			userId: string,
			rawInput: RoomMessageCreateRequest,
		): Promise<{ message: RoomSnapshot["messages"][number]; created: boolean }> {
			const parsed = RoomMessageCreateRequestSchema.safeParse(rawInput);
			if (!parsed.success) {
				throw new FlightRoomServiceError(
					"ROOM_MESSAGE_INVALID",
					400,
					parsed.error.issues[0]?.message ?? "Nieprawidłowa wiadomość.",
				);
			}
			const access = await accessOrThrow(dependencies, roomId, userId);
			if (!(await dependencies.hasCommunityRulesAcceptance(userId, rulesVersion))) {
				throw new FlightRoomServiceError(
					"rules_acceptance_required",
					409,
					"Zaakceptuj aktualne zasady społeczności przed wysłaniem wiadomości.",
				);
			}
			const result = await dependencies.createRoomMessage(roomId, userId, parsed.data);
			if (result.created) {
				await dependencies.broadcast(
					access.room,
					{
						type: "message_created",
						message: result.message,
					},
					userId,
				);
			}
			return result;
		},

		async issueTicket(roomId: string, userId: string): Promise<ConnectionTicketResponse> {
			await accessOrThrow(dependencies, roomId, userId);
			const now = dependencies.now();
			const expiresAt = new Date(now.getTime() + ROOM_CONNECTION_TICKET_TTL_MS);
			const ticket = randomConnectionTicket();
			await dependencies.createConnectionTicket({
				tokenHash: await hashConnectionTicket(ticket),
				roomId,
				userId,
				expiresAt,
				createdAt: now,
			});
			return ConnectionTicketResponseSchema.parse({
				ticket,
				expiresAt: expiresAt.toISOString(),
			});
		},

		async authenticateTicket(roomId: string, ticket: string): Promise<RoomAccessContext | null> {
			if (!/^[a-f0-9]{64}$/.test(ticket)) return null;
			const consumed = await dependencies.consumeConnectionTicket({
				tokenHash: await hashConnectionTicket(ticket),
				roomId,
				now: dependencies.now(),
			});
			if (!consumed) return null;
			const access = await dependencies.getRoomAccessContext(roomId, consumed.userId);
			if (access) ensureRoomOpen(access.room, dependencies.now());
			return access;
		},

		async authenticateUser(roomId: string, userId: string): Promise<RoomAccessContext | null> {
			const access = await dependencies.getRoomAccessContext(roomId, userId);
			if (access) ensureRoomOpen(access.room, dependencies.now());
			return access;
		},

		async hasAcceptedCurrentRules(userId: string): Promise<boolean> {
			return dependencies.hasCommunityRulesAcceptance(userId, rulesVersion);
		},
	};
}

export type FlightRoomService = ReturnType<typeof createFlightRoomService>;
