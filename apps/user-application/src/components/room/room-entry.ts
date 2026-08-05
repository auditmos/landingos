import type {
	PastFlightListing,
	PublicRoomMember,
	PublicRoomMessage,
	PublicTransportSelection,
	RoomSnapshot,
} from "@repo/data-ops/room";
import {
	fetchPastFlights,
	fetchRoomSnapshot,
	joinRoom,
	listMyRooms,
	updateRoomSelection,
} from "@/lib/room-api";
import { loadRoomIntent, markRoomIntentSelectionApplied, type RoomIntent } from "@/lib/room-intent";

export function upsertMember(
	members: PublicRoomMember[],
	member: PublicRoomMember,
): PublicRoomMember[] {
	const index = members.findIndex((candidate) => candidate.pseudonym === member.pseudonym);
	if (index < 0) return [...members, member];
	return members.map((candidate, candidateIndex) =>
		candidateIndex === index ? member : candidate,
	);
}

export function upsertMessage(
	messages: PublicRoomMessage[],
	message: PublicRoomMessage,
): PublicRoomMessage[] {
	return messages.some((candidate) => candidate.id === message.id)
		? messages
		: [...messages, message];
}

type EnteredRoom = {
	snapshot: RoomSnapshot;
	publicOption: PublicTransportSelection | null;
};

export type RoomEntry =
	| ({ kind: "room" } & EnteredRoom)
	| { kind: "flight_choice" }
	| { kind: "planner_required"; pastFlights: PastFlightListing[] };

function publicOptionFrom(
	intent: RoomIntent | null,
	snapshot: RoomSnapshot,
): PublicTransportSelection | null {
	if (intent?.selection.kind === "public_transport") return intent.selection;
	if (intent?.publicOption) return intent.publicOption;
	const current = snapshot.member.selection;
	if (current?.kind !== "public_transport") return null;
	// The remembered option must not carry the drop-off share: re-selecting
	// public transport later must never silently re-share a revoked drop-off.
	const { dropOffText: _private, ...option } = current;
	return option;
}

async function enterFromIntent(intent: RoomIntent): Promise<RoomSnapshot> {
	const joined = await joinRoom(intent.flightInstanceId);
	if (intent.selectionApplied) return joined;
	const member = await updateRoomSelection(joined.room.id, intent.selection);
	markRoomIntentSelectionApplied();
	return { ...joined, member, members: upsertMember(joined.members, member) };
}

async function enterListedRoom(roomId: string): Promise<EnteredRoom> {
	const snapshot = await fetchRoomSnapshot(roomId);
	return { snapshot, publicOption: publicOptionFrom(null, snapshot) };
}

// The replan aid is an enrichment — its failure must never block the planner prompt.
async function listPastFlightsSafely(): Promise<PastFlightListing[]> {
	try {
		return await fetchPastFlights();
	} catch {
		return [];
	}
}

/**
 * Resolves what /app should show. An explicit ?roomId deep link (from the
 * "Moje loty" page) wins; then a fresh planner intent; then server-side
 * membership, so losing browser state (new tab, device, restart) never
 * strands the traveler: one open room enters directly, several redirect to
 * the "Moje loty" page. A traveler with no open room gets the planner prompt
 * plus recently closed flights to replan.
 */
export async function resolveRoomEntry(roomId?: string): Promise<RoomEntry> {
	if (roomId) return { kind: "room", ...(await enterListedRoom(roomId)) };
	const intent = loadRoomIntent();
	if (intent) {
		const snapshot = await enterFromIntent(intent);
		return { kind: "room", snapshot, publicOption: publicOptionFrom(intent, snapshot) };
	}
	const rooms = await listMyRooms();
	const [nextRoom] = rooms;
	if (!nextRoom) return { kind: "planner_required", pastFlights: await listPastFlightsSafely() };
	if (rooms.length > 1) return { kind: "flight_choice" };
	return { kind: "room", ...(await enterListedRoom(nextRoom.id)) };
}
