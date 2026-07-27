// @vitest-environment jsdom
import type { RoomSnapshot } from "@repo/data-ops/room";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlightRoom } from "./flight-room";

const mocks = vi.hoisted(() => ({
	join: vi.fn(),
	refresh: vi.fn(),
	select: vi.fn(),
	send: vi.fn(),
	ticket: vi.fn(),
}));

vi.mock("@/lib/room-api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/room-api")>();
	return {
		...actual,
		joinRoom: mocks.join,
		fetchRoomSnapshot: mocks.refresh,
		updateRoomSelection: mocks.select,
		sendRoomMessage: mocks.send,
		issueRoomTicket: mocks.ticket,
	};
});

const roomId = "018f4c8e-5697-7df4-8f6e-c7644b137e5b";
const snapshot: RoomSnapshot = {
	room: { id: roomId, flightInstanceId: "flight-1" },
	member: { pseudonym: "Alicja BGY", selection: null },
	members: [{ pseudonym: "Alicja BGY", selection: null }],
	messages: [],
};

class FakeWebSocket extends EventTarget {
	static readonly OPEN = 1;
	static readonly CLOSING = 2;
	static readonly CLOSED = 3;
	readonly readyState = FakeWebSocket.OPEN;
	constructor(readonly url: string) {
		super();
		FakeWebSocket.instances.push(this);
		queueMicrotask(() => this.dispatchEvent(new Event("open")));
	}
	close() {
		// Component cleanup only.
	}
	static instances: FakeWebSocket[] = [];
	emit(data: unknown) {
		this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(data) }));
	}
	disconnect() {
		this.dispatchEvent(new CloseEvent("close"));
	}
}

async function settle() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

async function enter(input: HTMLInputElement, value: string) {
	await act(async () => {
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
		setter?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
		input.dispatchEvent(new Event("change", { bubbles: true }));
	});
}

describe("Polish flight room UI", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(async () => {
		vi.clearAllMocks();
		FakeWebSocket.instances = [];
		vi.stubGlobal("WebSocket", FakeWebSocket);
		sessionStorage.clear();
		sessionStorage.setItem(
			"landingos.room-intent",
			JSON.stringify({
				flightInstanceId: "flight-1",
				selection: {
					kind: "public_transport",
					badges: ["recommended"],
					modes: ["bus"],
					operatorNames: ["Airport Bus Express"],
				},
			}),
		);
		mocks.join.mockResolvedValue(snapshot);
		mocks.select.mockResolvedValue({
			pseudonym: "Alicja BGY",
			selection: {
				kind: "public_transport",
				badges: ["recommended"],
				modes: ["bus"],
				operatorNames: ["Airport Bus Express"],
			},
		});
		mocks.refresh.mockResolvedValue({
			...snapshot,
			member: await mocks.select(),
			members: [await mocks.select()],
		});
		mocks.ticket.mockResolvedValue({
			ticket: "a".repeat(64),
			expiresAt: "2026-09-14T07:01:00.000Z",
		});
		mocks.send.mockResolvedValue({
			created: true,
			message: {
				id: "018f4c8e-5697-7df4-8f6e-c7644b137e51",
				clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e52",
				pseudonym: "Alicja BGY",
				content: "Cześć!",
				createdAt: "2026-09-14T07:00:00.000Z",
			},
		});
		vi.clearAllMocks();
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		await act(async () => root.render(createElement(FlightRoom)));
		await settle();
		await settle();
	});

	afterEach(async () => {
		vi.useRealTimers();
		await act(async () => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
	});

	it("joins, persists the public selection, recovers history, and opens a ticketed socket", () => {
		expect(mocks.join).toHaveBeenCalledWith("flight-1");
		expect(mocks.select).toHaveBeenCalledWith(
			roomId,
			expect.objectContaining({ kind: "public_transport" }),
		);
		expect(mocks.refresh).toHaveBeenCalledWith(roomId);
		expect(mocks.ticket).toHaveBeenCalledWith(roomId);
		expect(FakeWebSocket.instances[0]?.url).toContain(
			`/rooms/${roomId}/connect?ticket=${"a".repeat(64)}`,
		);
		expect(container.textContent).toContain("Pokój lotu");
		expect(container.textContent).toContain("Alicja BGY");
		expect(container.textContent).toContain("nie sprawdza karty pokładowej");
	});

	it("renders realtime messages and sends trimmed text with a client UUID", async () => {
		FakeWebSocket.instances[0]?.emit({
			type: "message_created",
			message: {
				id: "018f4c8e-5697-7df4-8f6e-c7644b137e59",
				clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e58",
				pseudonym: "Bartek BGY",
				content: "Jestem przy autobusie.",
				createdAt: "2026-09-14T07:00:01.000Z",
			},
		});
		await settle();
		expect(container.textContent).toContain("Jestem przy autobusie.");

		const input = container.querySelector<HTMLInputElement>("#room-message");
		expect(input).not.toBeNull();
		await enter(input as HTMLInputElement, "  Cześć!  ");
		const submit = container.querySelector<HTMLButtonElement>('button[type="submit"]');
		await act(async () => submit?.click());
		await settle();
		expect(mocks.send).toHaveBeenCalledWith(
			roomId,
			expect.objectContaining({
				clientMessageId: expect.stringMatching(
					/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
				),
				content: "Cześć!",
			}),
		);
	});

	it("recovers ordered history and obtains a new ticket after disconnect", async () => {
		vi.useFakeTimers();
		FakeWebSocket.instances[0]?.disconnect();
		await act(async () => {
			await vi.advanceTimersByTimeAsync(1_000);
		});
		await act(async () => {
			await Promise.resolve();
		});
		expect(mocks.refresh).toHaveBeenCalledTimes(2);
		expect(mocks.ticket).toHaveBeenCalledTimes(2);
		expect(FakeWebSocket.instances).toHaveLength(2);
		vi.useRealTimers();
	});
});
