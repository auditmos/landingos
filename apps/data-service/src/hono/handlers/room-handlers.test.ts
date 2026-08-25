import type { RoomSnapshot } from "@repo/data-ops/room";
import { RoomQueryError } from "@repo/data-ops/room";
import { vi } from "vitest";
import { ANALYTICS_FUNNEL_HEADER } from "../../analytics/service";
import {
	createFlightRoomService,
	type FlightRoomService,
	type FlightRoomServiceDependencies,
	FlightRoomServiceError,
} from "../../room/service";
import {
	access,
	browserHeaders,
	buildApp,
	FUNNEL_ID,
	member,
	pastFlight,
	room,
	snapshot,
} from "./room-handlers.fixtures";

describe("flight room authenticated HTTP API", () => {
	it("returns the caller's past flights and requires a session for them", async () => {
		const { app, service } = buildApp();
		const anonymous = await app.request("/rooms/past");
		expect(anonymous.status).toBe(401);

		const listed = await app.request("/rooms/past", { headers: browserHeaders });
		expect(listed.status).toBe(200);
		expect(await listed.json()).toEqual([pastFlight]);
		expect(service.listPast).toHaveBeenCalledWith("user-1");
	});

	it("omits closed rooms and returns the typed closed state for history, reconnect, and send", async () => {
		const closed = new FlightRoomServiceError(
			"room_closed",
			410,
			"Pokój tego lotu jest już zamknięty.",
		);
		const { analytics, app, openSocket } = buildApp({
			list: vi.fn(async () => []),
			getSnapshot: vi.fn(async () => {
				throw closed;
			}),
			createMessage: vi.fn(async () => {
				throw closed;
			}),
			authenticateTicket: vi.fn(async () => {
				throw closed;
			}),
		});
		const listed = await app.request("/rooms", { headers: browserHeaders });
		expect(listed.status).toBe(200);
		expect(await listed.json()).toEqual([]);

		const history = await app.request(`/rooms/${room.id}`, { headers: browserHeaders });
		const sent = await app.request(`/rooms/${room.id}/messages`, {
			method: "POST",
			headers: browserHeaders,
			body: JSON.stringify({
				clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e53",
				content: "Za późno",
			}),
		});
		const connectUrl = `/rooms/${room.id}/connect?ticket=${"a".repeat(64)}`;
		const connected = await app.request(connectUrl, { headers: { Upgrade: "websocket" } });
		const reconnected = await app.request(connectUrl, { headers: { Upgrade: "websocket" } });
		for (const response of [history, sent, connected, reconnected]) {
			expect(response.status).toBe(410);
			expect(await response.json()).toEqual({
				code: "room_closed",
				error: "Pokój tego lotu jest już zamknięty.",
			});
		}
		expect(openSocket).not.toHaveBeenCalled();
		expect(analytics.track).not.toHaveBeenCalled();
	});

	it("rejects unauthenticated room HTTP calls in Polish", async () => {
		const { app, service } = buildApp();
		const response = await app.request("/rooms/join", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ flightInstanceId: "flight-1" }),
		});
		expect(response.status).toBe(401);
		expect(await response.json()).toEqual({
			code: "UNAUTHORIZED",
			error: "Wymagane jest zalogowanie.",
		});
		expect(service.join).not.toHaveBeenCalled();
	});

	it("joins over a browser session and returns only allowlisted public member fields", async () => {
		const { app, service } = buildApp();
		const response = await app.request("/rooms/join", {
			method: "POST",
			headers: browserHeaders,
			body: JSON.stringify({ flightInstanceId: "flight-1" }),
		});
		expect(response.status).toBe(200);
		const body = (await response.json()) as RoomSnapshot;
		expect(Object.keys(body.member)).toEqual(["pseudonym", "selection"]);
		expect(JSON.stringify(body)).not.toMatch(
			/email|userId|role|consent|destination|placeId|latitude|longitude|provider/i,
		);
		expect(service.join).toHaveBeenCalledWith("flight-1", "user-1");
	});

	it("keeps server-side history filtering user-keyed across cookie and Bearer sessions", async () => {
		const getSnapshot = vi.fn(async () => snapshot);
		const { app } = buildApp({ getSnapshot });

		const sessions = [
			new Headers({ cookie: "better-auth.session_token=browser-session" }),
			new Headers({ Authorization: "Bearer native-session" }),
		];
		for (const headers of sessions) {
			const response = await app.request(`/rooms/${room.id}`, { headers });
			expect(response.status).toBe(200);
			expect((await response.json()) as RoomSnapshot).toEqual(snapshot);
		}

		expect(getSnapshot).toHaveBeenNthCalledWith(1, room.id, "user-1");
		expect(getSnapshot).toHaveBeenNthCalledWith(2, room.id, "user-1");
	});

	it("rejects private selection fields before persistence", async () => {
		const { app, service } = buildApp();
		const response = await app.request(`/rooms/${room.id}/selection`, {
			method: "PUT",
			headers: browserHeaders,
			body: JSON.stringify({
				selection: {
					kind: "public_transport",
					badges: ["recommended"],
					modes: ["bus"],
					operatorNames: ["Operator"],
					destination: "Via Torino 42",
				},
			}),
		});
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({
			code: "ROOM_SELECTION_INVALID",
			error: expect.stringMatching(/wybór transportu/i),
		});
		expect(service.replaceSelection).not.toHaveBeenCalled();
	});

	it("rejects empty and over-1000-code-point messages without persistence", async () => {
		for (const content of [" ", "🙂".repeat(1_001)]) {
			const { app, service } = buildApp();
			const response = await app.request(`/rooms/${room.id}/messages`, {
				method: "POST",
				headers: browserHeaders,
				body: JSON.stringify({
					clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e53",
					content,
				}),
			});
			expect(response.status).toBe(400);
			expect(await response.json()).toMatchObject({
				code: "ROOM_MESSAGE_INVALID",
				error: expect.stringMatching(/Wiadomość/),
			});
			expect(service.createMessage).not.toHaveBeenCalled();
		}
	});

	it("rejects an unparsable body in Polish on every room mutation route", async () => {
		// Malformed and empty bodies both reach the schema as `undefined`; the reply must
		// stay the family's own Polish copy rather than a raw zod message.
		const routes = [
			{
				path: "/rooms/join",
				method: "POST",
				code: "ROOM_JOIN_INVALID",
				error: "Wybierz rozpoznany lot.",
				called: (service: FlightRoomService) => service.join,
			},
			{
				path: `/rooms/${room.id}/selection`,
				method: "PUT",
				code: "ROOM_SELECTION_INVALID",
				error: "Nieprawidłowy wybór transportu.",
				called: (service: FlightRoomService) => service.replaceSelection,
			},
			{
				path: `/rooms/${room.id}/messages`,
				method: "POST",
				code: "ROOM_MESSAGE_INVALID",
				error: "Nieprawidłowa wiadomość.",
				called: (service: FlightRoomService) => service.createMessage,
			},
		] as const;
		for (const route of routes) {
			for (const body of ["{", ""]) {
				const { app, service } = buildApp();
				const response = await app.request(route.path, {
					method: route.method,
					headers: browserHeaders,
					body,
				});
				expect(response.status).toBe(400);
				expect(await response.json()).toEqual({ code: route.code, error: route.error });
				expect(route.called(service)).not.toHaveBeenCalled();
			}
		}
	});

	it("still accepts a valid JSON body sent without a content-type header", async () => {
		const { app, service } = buildApp();
		const response = await app.request("/rooms/join", {
			method: "POST",
			headers: { cookie: "better-auth.session_token=browser-session" },
			body: JSON.stringify({ flightInstanceId: "flight-1" }),
		});
		expect(response.status).toBe(200);
		expect(service.join).toHaveBeenCalledWith("flight-1", "user-1");
	});

	it("returns a typed rules_acceptance_required response for an unaccepted HTTP send", async () => {
		const { app } = buildApp({
			createMessage: vi.fn(async () => {
				throw new FlightRoomServiceError(
					"rules_acceptance_required",
					409,
					"Zaakceptuj aktualne zasady społeczności przed wysłaniem wiadomości.",
				);
			}),
		});
		const response = await app.request(`/rooms/${room.id}/messages`, {
			method: "POST",
			headers: browserHeaders,
			body: JSON.stringify({
				clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e53",
				content: "Pierwsza wiadomość",
			}),
		});
		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({
			code: "rules_acceptance_required",
			error: "Zaakceptuj aktualne zasady społeczności przed wysłaniem wiadomości.",
		});
	});

	it("records join, first selection, and first persisted chat with only the opaque funnel ID", async () => {
		const { analytics, app } = buildApp();
		const headers = {
			...browserHeaders,
			[ANALYTICS_FUNNEL_HEADER]: FUNNEL_ID,
		};
		const joined = await app.request("/rooms/join", {
			method: "POST",
			headers,
			body: JSON.stringify({ flightInstanceId: "flight-1" }),
		});
		const selected = await app.request(`/rooms/${room.id}/selection`, {
			method: "PUT",
			headers,
			body: JSON.stringify({ selection: { kind: "shared_taxi" } }),
		});
		const messaged = await app.request(`/rooms/${room.id}/messages`, {
			method: "POST",
			headers,
			body: JSON.stringify({
				clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e53",
				content: "Pierwsza wiadomość",
			}),
		});
		expect([joined.status, selected.status, messaged.status]).toEqual([200, 200, 201]);
		expect(joined.headers.get(ANALYTICS_FUNNEL_HEADER)).toBe(FUNNEL_ID);
		expect(analytics.track).toHaveBeenNthCalledWith(1, FUNNEL_ID, {
			eventName: "room_joined",
			userId: "user-1",
			roomOccupancyBucket: "one",
		});
		expect(analytics.track).toHaveBeenNthCalledWith(2, FUNNEL_ID, {
			eventName: "transport_selected",
			userId: "user-1",
			transportKind: "shared_taxi",
		});
		expect(analytics.track).toHaveBeenNthCalledWith(3, FUNNEL_ID, {
			eventName: "chat_activated",
			userId: "user-1",
		});
		expect(JSON.stringify(vi.mocked(analytics.track).mock.calls)).not.toMatch(
			/email|address|placeId|coordinates|messageContent|Pierwsza wiadomość/i,
		);
	});

	it("issues a short-lived browser connection ticket to a room member", async () => {
		const { app, service } = buildApp();
		const response = await app.request(`/rooms/${room.id}/tickets`, {
			method: "POST",
			headers: browserHeaders,
		});
		expect(response.status).toBe(201);
		expect(await response.json()).toEqual({
			ticket: "a".repeat(64),
			expiresAt: "2026-09-14T07:01:00.000Z",
		});
		expect(service.issueTicket).toHaveBeenCalledWith(room.id, "user-1");
	});
});

/*
 * Regression assumptions:
 * - input: the real service (not a stubbed one) over a data-ops joinFlightRoom
 *   that rejects with the typed RoomQueryError it throws in production;
 * - output: POST /rooms/join answers with the typed Polish 410/404 body;
 * - boundary: nothing unmapped reaches the global onError, which previously
 *   turned both states into a 500;
 * - out of scope: the DB predicate itself, covered by data-ops queries tests.
 */
describe("POST /rooms/join over the real service", () => {
	function appOverRealService(joinFlightRoom: FlightRoomServiceDependencies["joinFlightRoom"]) {
		const service = createFlightRoomService({
			now: () => new Date("2026-09-14T07:00:00.000Z"),
			hasCommunityRulesAcceptance: async () => true,
			getIdentityProfile: async () => ({
				id: "user-1",
				emailVerified: true,
				pseudonym: "Alicja BGY",
				marketingConsentGranted: false,
				marketingConsentPolicyVersion: null,
				marketingConsentUpdatedAt: null,
				role: "user",
			}),
			joinFlightRoom,
			listActiveRooms: async () => [room],
			listPastFlights: async () => [],
			getRoomSnapshot: async () => snapshot,
			getRoomAccessContext: async () => access,
			replaceRoomSelection: async () => member,
			createRoomMessage: async () => {
				throw new Error("not exercised by join");
			},
			createConnectionTicket: async () => undefined,
			consumeConnectionTicket: async () => ({ userId: "user-1" }),
			broadcast: async () => undefined,
		});
		return buildApp({ join: service.join }).app;
	}

	it.each([
		["ROOM_CLOSED" as const, 410, "room_closed", "Pokój tego lotu jest już zamknięty."],
		["FLIGHT_NOT_FOUND" as const, 404, "flight_not_found", "Nie znaleziono rozpoznanego lotu."],
	])("maps RoomQueryError(%s) to %i", async (queryCode, status, code, error) => {
		const app = appOverRealService(async () => {
			throw new RoomQueryError(queryCode);
		});

		const response = await app.request("/rooms/join", {
			method: "POST",
			headers: browserHeaders,
			body: JSON.stringify({ flightInstanceId: "flight-1" }),
		});

		expect(response.status).toBe(status);
		expect(await response.json()).toEqual({ code, error });
	});
});
