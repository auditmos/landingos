// @vitest-environment jsdom
import type { RoomSnapshot } from "@repo/data-ops/room";
import { COMMUNITY_RULES_TOPICS, COMMUNITY_RULES_VERSION } from "@repo/data-ops/safety";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlightRoom } from "./flight-room";

const mocks = vi.hoisted(() => ({
	join: vi.fn(),
	refresh: vi.fn(),
	list: vi.fn(),
	past: vi.fn(),
	select: vi.fn(),
	send: vi.fn(),
	ticket: vi.fn(),
	rules: vi.fn(),
	acceptRules: vi.fn(),
	blocks: vi.fn(),
	block: vi.fn(),
	unblock: vi.fn(),
	report: vi.fn(),
}));

vi.mock("@/lib/safety-api", () => ({
	fetchCommunityRules: mocks.rules,
	acceptCommunityRules: mocks.acceptRules,
	fetchBlockedMembers: mocks.blocks,
	blockRoomMember: mocks.block,
	unblockRoomMember: mocks.unblock,
	reportRoomSafety: mocks.report,
}));

vi.mock("@/lib/room-api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/room-api")>();
	return {
		...actual,
		joinRoom: mocks.join,
		fetchRoomSnapshot: mocks.refresh,
		listMyRooms: mocks.list,
		fetchPastFlights: mocks.past,
		updateRoomSelection: mocks.select,
		sendRoomMessage: mocks.send,
		issueRoomTicket: mocks.ticket,
	};
});

const roomId = "018f4c8e-5697-7df4-8f6e-c7644b137e5b";
const otherMember = {
	pseudonym: "Bartek BGY",
	selection: { kind: "shared_taxi" as const },
};
const snapshot: RoomSnapshot = {
	room: {
		id: roomId,
		flightInstanceId: "flight-1",
		closesAt: "2026-09-15T08:20:00.000Z",
	},
	member: { pseudonym: "Alicja BGY", selection: null },
	members: [{ pseudonym: "Alicja BGY", selection: null }, otherMember],
	messages: [
		{
			id: "018f4c8e-5697-7df4-8f6e-c7644b137e59",
			clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e58",
			pseudonym: "Bartek BGY",
			content: "Jestem przy autobusie.",
			createdAt: "2026-09-14T07:00:01.000Z",
		},
	],
};
const selectedMember = {
	pseudonym: "Alicja BGY",
	selection: {
		kind: "public_transport",
		badges: ["recommended"],
		modes: ["bus"],
		operatorNames: ["Airport Bus Express"],
	},
};
const intentFixture = {
	flightInstanceId: "flight-1",
	selection: selectedMember.selection,
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
	disconnect(code = 1006) {
		this.dispatchEvent(new CloseEvent("close", { code }));
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

let container: HTMLDivElement;
let root: Root;

function primeRoomMocks() {
	mocks.join.mockResolvedValue(snapshot);
	mocks.list.mockResolvedValue([]);
	mocks.past.mockResolvedValue([]);
	mocks.select.mockResolvedValue(selectedMember);
	mocks.refresh.mockResolvedValue({
		...snapshot,
		member: selectedMember,
		members: [selectedMember, otherMember],
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
	mocks.rules.mockResolvedValue({
		version: COMMUNITY_RULES_VERSION,
		accepted: false,
		topics: COMMUNITY_RULES_TOPICS,
	});
	mocks.acceptRules.mockResolvedValue({
		version: COMMUNITY_RULES_VERSION,
		acceptedAt: "2026-09-14T07:00:00.000Z",
		created: true,
	});
	mocks.blocks.mockResolvedValue({ blockedPseudonyms: [] });
	mocks.block.mockResolvedValue({
		blockedPseudonym: "Bartek BGY",
		active: true,
		changed: true,
	});
	mocks.unblock.mockResolvedValue({
		blockedPseudonym: "Bartek BGY",
		active: false,
		changed: true,
	});
	mocks.report.mockResolvedValue({
		reportId: "018f4c8e-5697-7df4-8f6e-c7644b137e57",
		status: "open",
		created: true,
	});
}

async function mountRoom() {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	await act(async () =>
		root.render(
			createElement(QueryClientProvider, { client: new QueryClient() }, createElement(FlightRoom)),
		),
	);
	await settle();
	await settle();
}

async function unmountRoom() {
	vi.useRealTimers();
	await act(async () => root.unmount());
	container.remove();
	vi.unstubAllGlobals();
}

describe("Polish flight room UI", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		FakeWebSocket.instances = [];
		vi.stubGlobal("WebSocket", FakeWebSocket);
		sessionStorage.clear();
		sessionStorage.setItem("landingos.room-intent", JSON.stringify(intentFixture));
		primeRoomMocks();
		await mountRoom();
	});

	afterEach(unmountRoom);

	it("joins, applies the planner selection, and opens a ticketed socket", () => {
		expect(mocks.join).toHaveBeenCalledWith("flight-1");
		expect(mocks.select).toHaveBeenCalledWith(
			roomId,
			expect.objectContaining({ kind: "public_transport" }),
		);
		expect(mocks.refresh).not.toHaveBeenCalled();
		expect(mocks.ticket).toHaveBeenCalledWith(roomId);
		expect(FakeWebSocket.instances[0]?.url).toContain(
			`/rooms/${roomId}/connect?ticket=${"a".repeat(64)}`,
		);
		expect(container.textContent).toContain("Pokój lotu");
		expect(container.textContent).toContain("Alicja BGY");
		expect(container.textContent).toContain("nie sprawdza karty pokładowej");
		for (const topic of COMMUNITY_RULES_TOPICS) {
			expect(container.textContent).toContain(topic);
		}
		const stored: unknown = JSON.parse(sessionStorage.getItem("landingos.room-intent") ?? "{}");
		expect(stored).toMatchObject({ selectionApplied: true });
	});

	it("renders realtime messages and sends trimmed text with a client UUID", async () => {
		const accept = Array.from(container.querySelectorAll("button")).find((button) =>
			button.textContent?.includes("Akceptuję zasady"),
		);
		await act(async () => accept?.click());
		await settle();
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
		expect(mocks.refresh).toHaveBeenCalledTimes(1);
		expect(mocks.ticket).toHaveBeenCalledTimes(2);
		expect(FakeWebSocket.instances).toHaveLength(2);
		vi.useRealTimers();
	});

	it("removes the closed room and does not reconnect after the server closes both clients", async () => {
		vi.useFakeTimers();
		FakeWebSocket.instances[0]?.disconnect(4001);
		await act(async () => {
			await vi.runAllTimersAsync();
		});
		expect(container.textContent).toContain("Pokój został zamknięty");
		expect(container.textContent).not.toContain("Jestem przy autobusie.");
		expect(container.querySelector("#room-message")).toBeNull();
		expect(FakeWebSocket.instances).toHaveLength(1);
		expect(sessionStorage.getItem("landingos.room-intent")).toBeNull();
		vi.useRealTimers();
	});

	it("accepts rules, blocks a member, and reports a specific message in Polish UI", async () => {
		const accept = Array.from(container.querySelectorAll("button")).find((button) =>
			button.textContent?.includes("Akceptuję zasady"),
		);
		await act(async () => accept?.click());
		await settle();
		expect(mocks.acceptRules).toHaveBeenCalledWith(COMMUNITY_RULES_VERSION);

		const block = Array.from(container.querySelectorAll("button")).find(
			(button) => button.getAttribute("aria-label") === "Zablokuj",
		);
		await act(async () => block?.click());
		await settle();
		expect(mocks.block).toHaveBeenCalledWith(roomId, "Bartek BGY");

		const report = Array.from(container.querySelectorAll("button")).find((button) =>
			button.textContent?.includes("Zgłoś wiadomość"),
		);
		await act(async () => report?.click());
		await settle();
		const submit = Array.from(container.querySelectorAll("button")).find((button) =>
			button.textContent?.includes("Wyślij zgłoszenie"),
		);
		await act(async () => submit?.click());
		await settle();
		expect(mocks.report).toHaveBeenCalledWith(
			roomId,
			expect.objectContaining({
				targetType: "message",
				messageId: "018f4c8e-5697-7df4-8f6e-c7644b137e59",
			}),
		);
		expect(container.textContent).toContain("Zgłoszenie zostało zapisane");
	});
});

describe("room re-entry without planner intent", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		FakeWebSocket.instances = [];
		vi.stubGlobal("WebSocket", FakeWebSocket);
		sessionStorage.clear();
		primeRoomMocks();
	});

	afterEach(unmountRoom);

	it("re-enters the most imminent open room from server-side membership alone", async () => {
		mocks.list.mockResolvedValue([snapshot.room]);
		await mountRoom();
		expect(mocks.list).toHaveBeenCalledTimes(1);
		expect(mocks.join).not.toHaveBeenCalled();
		expect(mocks.select).not.toHaveBeenCalled();
		expect(mocks.refresh).toHaveBeenCalledWith(roomId);
		expect(container.textContent).toContain("Pokój lotu");
		expect(container.textContent).toContain("Alicja BGY");
		expect(container.textContent).not.toContain("Najpierw wybierz lot");
	});

	it("sends the traveler to the planner only when no open room membership exists", async () => {
		await mountRoom();
		expect(mocks.refresh).not.toHaveBeenCalled();
		expect(container.textContent).toContain("Najpierw wybierz lot i wariant przejazdu w planerze.");
		expect(container.textContent).toContain("Wróć do planera");
		expect(container.textContent).not.toContain("Poprzednie loty");
	});

	it("offers replanning recently closed flights when no room is open", async () => {
		mocks.past.mockResolvedValue([
			{
				closedAt: "2026-07-20T08:20:00.000Z",
				flight: {
					id: "flight-old",
					marketingCarrierCode: "FR",
					marketingCarrierName: "Ryanair",
					marketingFlightNumber: "1234",
					operatingCarrierCode: null,
					operatingFlightNumber: null,
					departureLocalDate: "2026-07-19",
					originIata: "WAW",
					destinationIata: "BGY",
					scheduledArrivalUtc: "2026-07-19T08:20:00.000Z",
					displayTimezone: "Europe/Rome",
					source: "provider",
				},
			},
		]);
		await mountRoom();
		expect(container.textContent).toContain("Poprzednie loty");
		expect(container.textContent).toContain("Ryanair FR1234");
		expect(container.textContent).toContain("WAW → BGY · 19.07.2026");
		const replan = Array.from(container.querySelectorAll("a")).find((anchor) =>
			anchor.textContent?.includes("Zaplanuj ponownie"),
		);
		expect(replan?.getAttribute("href")).toBe("/?flightNumber=FR1234");
	});

	it("shows the Moje loty switcher after planner entry when another room is open", async () => {
		sessionStorage.setItem("landingos.room-intent", JSON.stringify(intentFixture));
		mocks.list.mockResolvedValue([
			snapshot.room,
			{
				id: "018f4c8e-5697-7df4-8f6e-c7644b137e5c",
				flightInstanceId: "flight-2",
				closesAt: "2026-09-17T08:20:00.000Z",
			},
		]);
		await mountRoom();
		expect(mocks.join).toHaveBeenCalledWith("flight-1");
		const switcher = Array.from(container.querySelectorAll("button")).find((button) =>
			button.textContent?.includes("Moje loty"),
		);
		expect(switcher).toBeDefined();
	});

	it("applies a planner selection exactly once across room visits", async () => {
		sessionStorage.setItem("landingos.room-intent", JSON.stringify(intentFixture));
		await mountRoom();
		expect(mocks.select).toHaveBeenCalledTimes(1);

		await act(async () => root.unmount());
		container.remove();
		FakeWebSocket.instances = [];
		await mountRoom();

		expect(mocks.join).toHaveBeenCalledTimes(2);
		expect(mocks.select).toHaveBeenCalledTimes(1);
		expect(container.textContent).toContain("Pokój lotu");
	});

	it("offers Moje loty for several open rooms and enters the picked flight", async () => {
		const secondRoomId = "018f4c8e-5697-7df4-8f6e-c7644b137e5c";
		const flightFixture = {
			id: "flight-1",
			marketingCarrierCode: "FR",
			marketingCarrierName: "Ryanair",
			marketingFlightNumber: "1234",
			operatingCarrierCode: null,
			operatingFlightNumber: null,
			departureLocalDate: "2026-09-14",
			originIata: "WAW",
			destinationIata: "BGY",
			scheduledArrivalUtc: "2026-09-14T08:20:00.000Z",
			displayTimezone: "Europe/Rome",
			source: "provider",
		};
		mocks.list.mockResolvedValue([
			{ ...snapshot.room, flight: flightFixture },
			{
				id: secondRoomId,
				flightInstanceId: "flight-2",
				closesAt: "2026-09-17T08:20:00.000Z",
				flight: {
					...flightFixture,
					id: "flight-2",
					marketingFlightNumber: "5678",
					originIata: "GDN",
					departureLocalDate: "2026-09-16",
					scheduledArrivalUtc: "2026-09-16T08:20:00.000Z",
				},
			},
		]);
		await mountRoom();
		expect(mocks.refresh).not.toHaveBeenCalled();
		expect(container.textContent).toContain("Moje loty");
		expect(container.textContent).toContain("Ryanair FR1234");
		expect(container.textContent).toContain("Ryanair FR5678");
		expect(container.textContent).toContain("GDN → BGY");

		const pick = Array.from(container.querySelectorAll("button")).find((button) =>
			button.textContent?.includes("FR5678"),
		);
		await act(async () => pick?.click());
		await settle();
		expect(mocks.refresh).toHaveBeenCalledWith(secondRoomId);
		expect(container.textContent).toContain("Wspólny czat");

		const back = Array.from(container.querySelectorAll("button")).find((button) =>
			button.textContent?.includes("Moje loty"),
		);
		await act(async () => back?.click());
		await settle();
		expect(container.textContent).toContain("Ryanair FR1234");
		expect(container.querySelector("#room-message")).toBeNull();
	});
});
