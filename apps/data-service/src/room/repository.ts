import { getDb } from "@repo/data-ops/database/setup";
import { getIdentityProfile } from "@repo/data-ops/identity";
import {
	consumeConnectionTicket,
	createConnectionTicket,
	createRoomMessage,
	getRoomAccessContext,
	getRoomSnapshot,
	joinFlightRoom,
	replaceRoomSelection,
} from "@repo/data-ops/room";
import { createFlightRoomService, type FlightRoomService } from "./service";

export function createDatabaseFlightRoomService(env: Env): FlightRoomService {
	const db = getDb();
	return createFlightRoomService({
		now: () => new Date(),
		getIdentityProfile: (userId) => getIdentityProfile(db, userId),
		joinFlightRoom: (input) => joinFlightRoom(db, input),
		getRoomSnapshot: (roomId, userId) => getRoomSnapshot(db, roomId, userId),
		getRoomAccessContext: (roomId, userId) => getRoomAccessContext(db, roomId, userId),
		replaceRoomSelection: (roomId, userId, selection) =>
			replaceRoomSelection(db, roomId, userId, selection),
		createRoomMessage: (roomId, userId, input) => createRoomMessage(db, roomId, userId, input),
		createConnectionTicket: (input) => createConnectionTicket(db, input),
		consumeConnectionTicket: (input) => consumeConnectionTicket(db, input),
		broadcast: async (coordinatorKey, roomId, event) => {
			await env.FLIGHT_ROOM.getByName(coordinatorKey).broadcast(roomId, event);
		},
	});
}
