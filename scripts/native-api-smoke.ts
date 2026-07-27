import { randomUUID } from "node:crypto";
import { startFixtureServer } from "./e2e-fixture-server.ts";
import { RawWebSocketClient } from "./e2e-websocket.ts";

function assert(condition: unknown, message: string): asserts condition {
	if (!condition) throw new Error(message);
}

async function jsonRequest(
	origin: string,
	path: string,
	init: RequestInit,
	token?: string,
): Promise<Record<string, unknown>> {
	const response = await fetch(`${origin}${path}`, {
		...init,
		headers: {
			...(init.body ? { "content-type": "application/json" } : {}),
			...(token ? { authorization: `Bearer ${token}` } : {}),
		},
	});
	assert(response.ok, `${init.method ?? "GET"} ${path} returned ${response.status}`);
	return (await response.json()) as Record<string, unknown>;
}

async function main() {
	const fixture = await startFixtureServer(0);
	let socket: RawWebSocketClient | undefined;
	try {
		const email = "native-smoke@example.test";
		await jsonRequest(fixture.origin, "/test-auth/request", {
			method: "POST",
			body: JSON.stringify({ email, type: "sign-in" }),
		});
		const otp = fixture.store.latestOtp(email);
		assert(otp, "The recording email fixture did not capture an OTP");
		const verified = await jsonRequest(fixture.origin, "/test-auth/verify", {
			method: "POST",
			body: JSON.stringify({ email, otp }),
		});
		const token = verified.token;
		assert(typeof token === "string" && token.length > 20, "OTP exchange did not return a token");

		await jsonRequest(
			fixture.origin,
			"/api/profile",
			{ method: "PATCH", body: JSON.stringify({ action: "pseudonym", pseudonym: "NativeFox" }) },
			token,
		);
		const resolved = await jsonRequest(
			fixture.origin,
			"/flights/resolve",
			{
				method: "POST",
				body: JSON.stringify({ flightNumber: "FR1234", departureLocalDate: "2026-09-14" }),
			},
			token,
		);
		const flight = resolved.flight as { id?: unknown } | undefined;
		assert(typeof flight?.id === "string", "Flight resolution did not return an instance");
		const joined = await jsonRequest(
			fixture.origin,
			"/rooms/join",
			{ method: "POST", body: JSON.stringify({ flightInstanceId: flight.id }) },
			token,
		);
		const room = joined.room as { id?: unknown } | undefined;
		assert(typeof room?.id === "string", "Room join did not return a room");
		await jsonRequest(
			fixture.origin,
			"/safety/rules/accept",
			{ method: "POST", body: JSON.stringify({ version: "2026-07" }) },
			token,
		);

		const websocketUrl = new URL(`/rooms/${room.id}/connect`, fixture.origin);
		websocketUrl.protocol = "ws:";
		socket = await RawWebSocketClient.connect(websocketUrl, `Bearer ${token}`);
		const clientMessageId = randomUUID();
		await jsonRequest(
			fixture.origin,
			`/rooms/${room.id}/messages`,
			{
				method: "POST",
				body: JSON.stringify({ clientMessageId, content: "Wiadomość z natywnego smoke testu" }),
			},
			token,
		);
		const event = JSON.parse(await socket.nextText(5_000)) as {
			type?: unknown;
			message?: { content?: unknown };
		};
		assert(event.type === "message_created", "Raw WebSocket did not receive message_created");
		assert(
			event.message?.content === "Wiadomość z natywnego smoke testu",
			"Raw WebSocket received the wrong message",
		);
		socket.sendText(JSON.stringify({ content: "must-not-use-websocket-for-write" }));
		const transportError = JSON.parse(await socket.nextText(5_000)) as { code?: unknown };
		assert(
			transportError.code === "MESSAGE_TRANSPORT_NOT_SUPPORTED",
			"Raw WebSocket writes were not rejected with the typed transport error",
		);

		const protectedRequests = fixture.store.requests.filter(
			(request) =>
				request.path.startsWith("/api/") ||
				request.path.startsWith("/rooms/") ||
				request.path.startsWith("/safety/"),
		);
		assert(protectedRequests.length >= 5, "Native smoke did not exercise the protected API");
		assert(
			protectedRequests.every((request) => request.authorization),
			"A protected native request omitted Authorization: Bearer",
		);
		assert(
			protectedRequests.every((request) => !request.cookie),
			"A native request sent a Cookie header",
		);
		assert(
			protectedRequests.some((request) => request.upgrade && request.authorization),
			"The raw WebSocket upgrade did not authenticate with Bearer",
		);
		process.stdout.write(
			"Native API smoke passed: OTP, Bearer HTTP, room join, and raw WebSocket.\n",
		);
	} finally {
		socket?.close();
		await fixture.close();
	}
}

void main().catch((error: unknown) => {
	process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
	process.exitCode = 1;
});
