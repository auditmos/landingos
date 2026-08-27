// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RoomApiError } from "@/lib/room-api";
import { useRoomSocket } from "./room-connection";

/*
 * Issue #52: a reconnect attempt that itself fails must schedule another one. A
 * just-landed traveler on flaky airport roaming is the likely case, not the edge
 * case — giving up after a single retry leaves them on a dead room view.
 */

const mocks = vi.hoisted(() => ({ refresh: vi.fn(), ticket: vi.fn() }));

vi.mock("@/lib/room-api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/room-api")>();
	return { ...actual, fetchRoomSnapshot: mocks.refresh, issueRoomTicket: mocks.ticket };
});

const roomId = "018f4c8e-5697-7df4-8f6e-c7644b137e5b";

class FakeWebSocket extends EventTarget {
	static instances: FakeWebSocket[] = [];
	readonly readyState = 1;
	constructor(readonly url: string) {
		super();
		FakeWebSocket.instances.push(this);
		queueMicrotask(() => this.dispatchEvent(new Event("open")));
	}
	close() {
		// Teardown only.
	}
	disconnect(code = 1006) {
		this.dispatchEvent(new CloseEvent("close", { code }));
	}
}

const handlers = {
	setSnapshot: vi.fn(),
	setError: vi.fn(),
	setConnection: vi.fn(),
	closeRoomView: vi.fn(),
};

function connectionStates(): string[] {
	return handlers.setConnection.mock.calls.map(([value]) => String(value));
}

function Harness() {
	useRoomSocket(roomId, handlers);
	return null;
}

let container: HTMLDivElement;
let root: Root;

async function mount() {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	await act(async () => root.render(createElement(Harness)));
	await advance(0);
}

async function advance(ms: number) {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms);
	});
}

beforeEach(() => {
	vi.clearAllMocks();
	FakeWebSocket.instances = [];
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
	vi.stubGlobal("WebSocket", FakeWebSocket);
	vi.useFakeTimers();
	mocks.refresh.mockResolvedValue({
		room: { id: roomId, flightInstanceId: "flight-1", closesAt: "2026-09-15T08:20:00.000Z" },
		member: { pseudonym: "Alicja BGY", selection: null },
		members: [{ pseudonym: "Alicja BGY", selection: null }],
		messages: [],
	});
	mocks.ticket.mockResolvedValue({
		ticket: "a".repeat(64),
		expiresAt: "2026-09-14T07:01:00.000Z",
	});
});

afterEach(async () => {
	await act(async () => root.unmount());
	container.remove();
	vi.useRealTimers();
	vi.unstubAllGlobals();
	delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("room reconnect backoff", () => {
	it("schedules another attempt when a retry attempt itself fails", async () => {
		mocks.ticket
			.mockRejectedValueOnce(new Error("Sieć niedostępna."))
			.mockRejectedValueOnce(new Error("Sieć niedostępna."));
		await mount();
		expect(mocks.ticket).toHaveBeenCalledTimes(1);
		expect(connectionStates()).not.toContain("Połączenie przerwane");

		await advance(1_000);
		expect(mocks.ticket).toHaveBeenCalledTimes(2);
		expect(connectionStates()).not.toContain("Połączenie przerwane");

		await advance(2_000);
		expect(mocks.ticket).toHaveBeenCalledTimes(3);
		expect(connectionStates()).toContain("Połączono");
		expect(connectionStates()).not.toContain("Połączenie przerwane");
	});

	it("backs off between attempts and reports the terminal state only at the cap", async () => {
		mocks.ticket.mockRejectedValue(new Error("Sieć niedostępna."));
		await mount();
		expect(mocks.ticket).toHaveBeenCalledTimes(1);

		await advance(1_000);
		expect(mocks.ticket).toHaveBeenCalledTimes(2);
		// The second delay is longer than the first, so a further second is not enough.
		await advance(1_000);
		expect(mocks.ticket).toHaveBeenCalledTimes(2);

		await advance(120_000);
		const attempts = mocks.ticket.mock.calls.length;
		expect(attempts).toBeGreaterThan(3);
		expect(connectionStates().filter((state) => state === "Połączenie przerwane")).toHaveLength(1);
		expect(connectionStates().at(-1)).toBe("Połączenie przerwane");

		// The cap is a cap: nothing is armed once the terminal state is shown.
		await advance(300_000);
		expect(mocks.ticket).toHaveBeenCalledTimes(attempts);
	});

	it("resets the retry budget once a reconnect succeeds", async () => {
		await mount();
		expect(connectionStates()).toContain("Połączono");

		FakeWebSocket.instances[0]?.disconnect();
		await advance(1_000);
		expect(mocks.ticket).toHaveBeenCalledTimes(2);
		expect(connectionStates().at(-1)).toBe("Połączono");

		// A live socket restarts the ladder: this drop waits 1s again, not the 2s
		// the second rung would have imposed had the budget kept running down.
		FakeWebSocket.instances[1]?.disconnect();
		await advance(1_000);
		expect(mocks.ticket).toHaveBeenCalledTimes(3);
		expect(connectionStates().at(-1)).toBe("Połączono");
	});

	it("cancels a pending retry on teardown and writes no state afterwards", async () => {
		mocks.ticket.mockRejectedValue(new Error("Sieć niedostępna."));
		await mount();
		expect(mocks.ticket).toHaveBeenCalledTimes(1);

		await act(async () => root.unmount());
		const callsAtTeardown = mocks.ticket.mock.calls.length;
		const statesAtTeardown = connectionStates().length;
		await advance(300_000);
		expect(mocks.ticket).toHaveBeenCalledTimes(callsAtTeardown);
		expect(connectionStates()).toHaveLength(statesAtTeardown);
		expect(handlers.setSnapshot).not.toHaveBeenCalled();

		// afterEach unmounts again; re-render an empty root so that stays valid.
		root = createRoot(container);
	});

	it("closes the room view on a 4001 close without retrying", async () => {
		await mount();
		FakeWebSocket.instances[0]?.disconnect(4001);
		await advance(300_000);
		expect(handlers.closeRoomView).toHaveBeenCalledTimes(1);
		expect(mocks.ticket).toHaveBeenCalledTimes(1);
		expect(connectionStates()).not.toContain("Przywracanie połączenia…");
	});
});

describe("room reconnect error classification", () => {
	it("surfaces a refused ticket at once instead of walking the ladder", async () => {
		mocks.ticket.mockRejectedValue(
			new RoomApiError("Nie należysz do tego pokoju.", "ROOM_ACCESS_DENIED", 403),
		);
		await mount();
		expect(mocks.ticket).toHaveBeenCalledTimes(1);
		expect(handlers.setError).toHaveBeenCalledWith("Nie należysz do tego pokoju.");
		expect(connectionStates().at(-1)).toBe("Połączenie przerwane");
		expect(connectionStates()).not.toContain("Przywracanie połączenia…");

		await advance(300_000);
		expect(mocks.ticket).toHaveBeenCalledTimes(1);
	});

	it("retries a server-side failure that may pass on the next attempt", async () => {
		mocks.ticket.mockRejectedValueOnce(
			new RoomApiError("Usługa chwilowo niedostępna.", "ROOM_API_ERROR", 503),
		);
		await mount();
		expect(connectionStates().at(-1)).toBe("Przywracanie połączenia…");

		await advance(1_000);
		expect(mocks.ticket).toHaveBeenCalledTimes(2);
		expect(connectionStates().at(-1)).toBe("Połączono");
	});

	it("retries a rate-limited ticket rather than treating it as terminal", async () => {
		mocks.ticket.mockRejectedValueOnce(new RoomApiError("Zbyt wiele prób.", "ROOM_API_ERROR", 429));
		await mount();
		expect(connectionStates().at(-1)).toBe("Przywracanie połączenia…");

		await advance(1_000);
		expect(mocks.ticket).toHaveBeenCalledTimes(2);
		expect(connectionStates().at(-1)).toBe("Połączono");
	});

	it("retries a network failure that carries no HTTP status at all", async () => {
		mocks.ticket.mockRejectedValueOnce(new TypeError("Failed to fetch"));
		await mount();
		await advance(1_000);
		expect(mocks.ticket).toHaveBeenCalledTimes(2);
		expect(connectionStates().at(-1)).toBe("Połączono");
	});
});
