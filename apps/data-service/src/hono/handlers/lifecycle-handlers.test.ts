import { Hono } from "hono";
import { createLifecycleHandlers } from "./lifecycle-handlers";

const ROOM_ID = "018f4c8e-5697-7df4-8f6e-c7644b137e5b";

function buildApp() {
	const broadcastRedaction = vi.fn(async () => undefined);
	const app = new Hono<{ Bindings: Env }>();
	app.route(
		"/internal/lifecycle",
		createLifecycleHandlers({
			expectedToken: () => "server-only-token",
			broadcastRedaction,
		}),
	);
	return { app, broadcastRedaction };
}

describe("internal account-redaction broadcast", () => {
	it("requires the server token and accepts only bounded room coordinates", async () => {
		const { app, broadcastRedaction } = buildApp();
		for (const request of [
			app.request("/internal/lifecycle/redact-rooms", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					rooms: [{ roomId: ROOM_ID, coordinatorKey: "flight-1" }],
				}),
			}),
			app.request("/internal/lifecycle/redact-rooms", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					Authorization: "Bearer wrong-token",
				},
				body: JSON.stringify({
					rooms: [{ roomId: ROOM_ID, coordinatorKey: "flight-1" }],
				}),
			}),
		]) {
			expect((await request).status).toBe(401);
		}
		expect(broadcastRedaction).not.toHaveBeenCalled();
	});

	it("broadcasts only a private-free room_redacted event", async () => {
		const { app, broadcastRedaction } = buildApp();
		const response = await app.request("/internal/lifecycle/redact-rooms", {
			method: "POST",
			headers: {
				"content-type": "application/json",
				Authorization: "Bearer server-only-token",
			},
			body: JSON.stringify({
				rooms: [{ roomId: ROOM_ID, coordinatorKey: "flight-1" }],
			}),
		});
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ redactedRooms: 1 });
		expect(broadcastRedaction).toHaveBeenCalledWith(undefined, "flight-1", ROOM_ID, {
			type: "room_redacted",
		});
		expect(JSON.stringify(broadcastRedaction.mock.calls)).not.toMatch(
			/delete-canary|address-canary|place-canary|coordinates-canary|message-canary/i,
		);
	});
});
