import { getDb } from "@repo/data-ops/database/setup";
import { getIdentityProfile } from "@repo/data-ops/identity";
import {
	consumeConnectionTicket,
	createConnectionTicket,
	createRoomMessage,
	getRoomAccessContext,
	getRoomSnapshot,
	joinFlightRoom,
	listActiveRoomsForUser,
	listPastFlightsForUser,
	replaceRoomSelection,
} from "@repo/data-ops/room";
import {
	COMMUNITY_RULES_VERSION,
	hasCommunityRulesAcceptance,
	listBlockedRecipientIds,
} from "@repo/data-ops/safety";
import { createFlightRoomService, type FlightRoomService } from "./service";

export function createDatabaseFlightRoomService(env: Env): FlightRoomService {
	const db = getDb();
	return createFlightRoomService({
		now: () => new Date(),
		rulesVersion: COMMUNITY_RULES_VERSION,
		hasCommunityRulesAcceptance: (userId, rulesVersion) =>
			hasCommunityRulesAcceptance(db, userId, rulesVersion),
		getIdentityProfile: (userId) => getIdentityProfile(db, userId),
		joinFlightRoom: (input) => joinFlightRoom(db, input),
		listActiveRooms: (userId, now) => listActiveRoomsForUser(db, userId, now),
		listPastFlights: (userId, now) => listPastFlightsForUser(db, userId, now),
		getRoomSnapshot: (roomId, userId) => getRoomSnapshot(db, roomId, userId),
		getRoomAccessContext: (roomId, userId) => getRoomAccessContext(db, roomId, userId),
		replaceRoomSelection: (roomId, userId, selection) =>
			replaceRoomSelection(db, roomId, userId, selection),
		createRoomMessage: (roomId, userId, input) => createRoomMessage(db, roomId, userId, input),
		createConnectionTicket: (input) => createConnectionTicket(db, input),
		consumeConnectionTicket: (input) => consumeConnectionTicket(db, input),
		broadcast: async (coordinatorKey, roomId, event, sourceUserId) => {
			const excludedUserIds = await listBlockedRecipientIds(db, roomId, sourceUserId);
			await env.FLIGHT_ROOM.getByName(coordinatorKey).broadcast(roomId, event, excludedUserIds);
		},
	});
}
