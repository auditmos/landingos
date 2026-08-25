import { vi } from "vitest";
import type { FlightRoomService } from "../../room/service";
import { access, buildApp, room } from "./room-handlers.fixtures";

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
