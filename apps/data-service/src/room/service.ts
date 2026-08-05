import type { IdentityProfile } from "@repo/data-ops/identity";
import { isRoomReady } from "@repo/data-ops/identity";
import type {
	ConnectionTicketResponse,
	CreateConnectionTicketInput,
	JoinFlightRoomResult,
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
			| "rules_acceptance_required",
		readonly status: 400 | 403 | 409 | 410,
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
	broadcast(
		coordinatorKey: string,
		roomId: string,
		event: RoomRealtimeEvent,
		sourceUserId: string,
	): Promise<void>;
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
			const joined = await dependencies.joinFlightRoom({
				flightInstanceId,
				userId,
				now: dependencies.now(),
			});
			ensureRoomOpen(joined.room, dependencies.now());
			const snapshot = await dependencies.getRoomSnapshot(joined.room.id, userId);
			if (joined.membershipCreated) {
				await dependencies.broadcast(
					joined.room.flightInstanceId,
					joined.room.id,
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
			const now = dependencies.now();
			return (await dependencies.listActiveRooms(userId, now)).filter(
				(room) => now.getTime() < new Date(room.closesAt).getTime(),
			);
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
				access.coordinatorKey,
				roomId,
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
					access.coordinatorKey,
					roomId,
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
