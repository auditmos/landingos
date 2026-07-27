import type { PublicRoomMember, RoomAccessContext, RoomSnapshot } from "@repo/data-ops/room";
import { Hono } from "hono";
import { vi } from "vitest";
import { ANALYTICS_FUNNEL_HEADER, type AnalyticsTracker } from "../../analytics/service";
import { type FlightRoomService, FlightRoomServiceError } from "../../room/service";
import { createRoomHandlers } from "./room-handlers";

const FUNNEL_ID = "00112233445566778899aabbccddeeff";

const room = {
	id: "018f4c8e-5697-7df4-8f6e-c7644b137e5b",
	flightInstanceId: "flight-1",
};
const member: PublicRoomMember = {
	pseudonym: "Alicja BGY",
	selection: {
		kind: "public_transport",
		badges: ["recommended"],
		modes: ["bus"],
		operatorNames: ["Airport Bus Express"],
	},
};
const snapshot: RoomSnapshot = {
	room,
	member,
	members: [member],
	messages: [],
};
const access: RoomAccessContext = {
	room,
	membershipId: "018f4c8e-5697-7df4-8f6e-c7644b137e51",
	userId: "user-1",
	coordinatorKey: "flight-1",
};

function buildApp(serviceOverrides: Partial<FlightRoomService> = {}) {
	const service: FlightRoomService = {
		join: vi.fn(async () => snapshot),
		getSnapshot: vi.fn(async () => snapshot),
		replaceSelection: vi.fn(async (_roomId, _userId, selection) => ({
			...member,
			selection,
		})),
		createMessage: vi.fn(async (_roomId, _userId, input) => ({
			created: true,
			message: {
				id: "018f4c8e-5697-7df4-8f6e-c7644b137e52",
				clientMessageId: input.clientMessageId,
				pseudonym: "Alicja BGY",
				content: input.content,
				createdAt: "2026-09-14T07:00:00.000Z",
			},
		})),
		issueTicket: vi.fn(async () => ({
			ticket: "a".repeat(64),
			expiresAt: "2026-09-14T07:01:00.000Z",
		})),
		authenticateTicket: vi.fn(async () => access),
		authenticateUser: vi.fn(async () => access),
		hasAcceptedCurrentRules: vi.fn(async () => true),
		...serviceOverrides,
	};
	const getSession = vi.fn(async (request: Request) => {
		if (request.headers.get("authorization") === "Bearer native-session") {
			return { user: { id: "user-1" } };
		}
		if (request.headers.get("cookie") === "better-auth.session_token=browser-session") {
			return { user: { id: "user-1" } };
		}
		return null;
	});
	const openSocket = vi.fn(async () => new Response(null, { status: 204 }));
	const analytics: AnalyticsTracker = {
		begin: vi.fn(async () => FUNNEL_ID),
		track: vi.fn(async () => FUNNEL_ID),
	};
	const handlers = createRoomHandlers({
		createService: () => service,
		createAnalyticsTracker: () => analytics,
		getSession,
		openSocket,
	});
	const app = new Hono();
	app.route("/rooms", handlers);
	return { analytics, app, getSession, openSocket, service };
}

const browserHeaders = {
	"content-type": "application/json",
	cookie: "better-auth.session_token=browser-session",
};

describe("flight room authenticated HTTP API", () => {
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

describe("flight room WebSocket authorization matrix", () => {
	it("accepts one browser ticket once, then rejects its replay", async () => {
		const authenticateTicket = vi
			.fn<FlightRoomService["authenticateTicket"]>()
			.mockResolvedValueOnce(access)
			.mockResolvedValueOnce(null);
		const { app, openSocket } = buildApp({ authenticateTicket });
		const url = `/rooms/${room.id}/connect?ticket=${"a".repeat(64)}`;
		expect(
			(
				await app.request(url, {
					headers: { Upgrade: "websocket" },
				})
			).status,
		).toBe(204);
		expect(
			(
				await app.request(url, {
					headers: { Upgrade: "websocket" },
				})
			).status,
		).toBe(401);
		expect(openSocket).toHaveBeenCalledTimes(1);
	});

	it.each([
		"wrong-room",
		"expired",
		"malformed",
	])("fails closed for a %s browser ticket", async () => {
		const { app, openSocket } = buildApp({
			authenticateTicket: vi.fn(async () => null),
		});
		const response = await app.request(`/rooms/${room.id}/connect?ticket=${"b".repeat(64)}`, {
			headers: { Upgrade: "websocket" },
		});
		expect(response.status).toBe(401);
		expect(openSocket).not.toHaveBeenCalled();
	});

	it("accepts a native Bearer upgrade without cookies", async () => {
		const { app, getSession, openSocket, service } = buildApp();
		const response = await app.request(`/rooms/${room.id}/connect`, {
			headers: { Upgrade: "websocket", Authorization: "Bearer native-session" },
		});
		expect(response.status).toBe(204);
		expect(getSession).toHaveBeenCalledWith(
			expect.objectContaining({
				headers: expect.objectContaining({}),
			}),
		);
		const sessionRequest = getSession.mock.calls[0]?.[0];
		expect(sessionRequest?.headers.get("cookie")).toBeNull();
		expect(service.authenticateUser).toHaveBeenCalledWith(room.id, "user-1");
		expect(openSocket).toHaveBeenCalledWith(access, expect.any(Request), true, undefined);
	});

	it("rejects a cookie-only WebSocket upgrade so browsers must use a ticket", async () => {
		const { app, getSession, openSocket } = buildApp();
		const response = await app.request(`/rooms/${room.id}/connect`, {
			headers: {
				Upgrade: "websocket",
				cookie: "better-auth.session_token=browser-session",
			},
		});
		expect(response.status).toBe(401);
		expect(getSession).not.toHaveBeenCalled();
		expect(openSocket).not.toHaveBeenCalled();
	});

	it("allows an unaccepted member to connect for reading but marks the socket unaccepted", async () => {
		const { app, openSocket } = buildApp({
			hasAcceptedCurrentRules: vi.fn(async () => false),
		});
		const response = await app.request(`/rooms/${room.id}/connect?ticket=${"a".repeat(64)}`, {
			headers: { Upgrade: "websocket" },
		});
		expect(response.status).toBe(204);
		expect(openSocket).toHaveBeenCalledWith(access, expect.any(Request), false, undefined);
	});
});
