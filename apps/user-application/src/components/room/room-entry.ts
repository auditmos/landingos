import type {
	PublicRoomMember,
	PublicRoomMessage,
	PublicTransportSelection,
	RoomListing,
	RoomSnapshot,
} from "@repo/data-ops/room";
import { fetchRoomSnapshot, joinRoom, listMyRooms, updateRoomSelection } from "@/lib/room-api";
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

export type EnteredRoom = {
	snapshot: RoomSnapshot;
	publicOption: PublicTransportSelection | null;
};

export type RoomEntry =
	| ({ kind: "room" } & EnteredRoom)
	| { kind: "flight_choice"; rooms: RoomListing[] }
	| { kind: "planner_required" };

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

export async function enterListedRoom(roomId: string): Promise<EnteredRoom> {
	const snapshot = await fetchRoomSnapshot(roomId);
	return { snapshot, publicOption: publicOptionFrom(null, snapshot) };
}

/**
 * Resolves what /app should show. A fresh planner intent wins; without one the
 * traveler is re-entered from server-side membership, so losing browser state
 * (new tab, device, restart) never strands them: one open room enters
 * directly, several offer the "Moje loty" choice. Only a traveler with no
 * open room is sent back to the planner.
 */
export async function resolveRoomEntry(): Promise<RoomEntry> {
	const intent = loadRoomIntent();
	if (intent) {
		const snapshot = await enterFromIntent(intent);
		return { kind: "room", snapshot, publicOption: publicOptionFrom(intent, snapshot) };
	}
	const rooms = await listMyRooms();
	const [nextRoom] = rooms;
	if (!nextRoom) return { kind: "planner_required" };
	if (rooms.length > 1) return { kind: "flight_choice", rooms };
	return { kind: "room", ...(await enterListedRoom(nextRoom.id)) };
}
