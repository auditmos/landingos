// @vitest-environment jsdom
import type { RoomSnapshot } from "@repo/data-ops/room";
import {
	COMMUNITY_RULES_TOPICS,
	COMMUNITY_RULES_VERSION,
	SAFETY_REPORT_REASON_LABELS,
	SafetyReportReasonSchema,
} from "@repo/data-ops/safety";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FlightRoom } from "./flight-room";

const mocks = vi.hoisted(() => ({
	list: vi.fn(),
	refresh: vi.fn(),
	past: vi.fn(),
	ticket: vi.fn(),
	rules: vi.fn(),
	acceptRules: vi.fn(),
	blocks: vi.fn(),
	report: vi.fn(),
}));

vi.mock("@/lib/safety-api", () => ({
	fetchCommunityRules: mocks.rules,
	acceptCommunityRules: mocks.acceptRules,
	fetchBlockedMembers: mocks.blocks,
	blockRoomMember: vi.fn(),
	unblockRoomMember: vi.fn(),
	reportRoomSafety: mocks.report,
}));

vi.mock("@/lib/room-api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/room-api")>();
	return {
		...actual,
		listMyRooms: mocks.list,
		fetchRoomSnapshot: mocks.refresh,
		fetchPastFlights: mocks.past,
		issueRoomTicket: mocks.ticket,
	};
});

const roomId = "018f4c8e-5697-7df4-8f6e-c7644b137e5b";
const messageId = "018f4c8e-5697-7df4-8f6e-c7644b137e59";
const snapshot: RoomSnapshot = {
	room: { id: roomId, flightInstanceId: "flight-1", closesAt: "2026-09-15T08:20:00.000Z" },
	member: { pseudonym: "Alicja BGY", selection: null },
	members: [
		{ pseudonym: "Alicja BGY", selection: null },
		{ pseudonym: "Bartek BGY", selection: { kind: "shared_taxi" } },
	],
	messages: [
		{
			id: messageId,
			clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e58",
			pseudonym: "Bartek BGY",
			content: "Jestem przy autobusie.",
			createdAt: "2026-09-14T07:00:01.000Z",
		},
	],
};

class FakeWebSocket extends EventTarget {
	static readonly OPEN = 1;
	readonly readyState = FakeWebSocket.OPEN;
	constructor(readonly url: string) {
		super();
		queueMicrotask(() => this.dispatchEvent(new Event("open")));
	}
	close() {}
}

function button(text: string, root: Document | HTMLDivElement = document): HTMLButtonElement {
	const match = Array.from(root.querySelectorAll<HTMLButtonElement>("button")).find((candidate) =>
		candidate.textContent?.includes(text),
	);
	if (!match) throw new Error(`Brak przycisku: ${text}`);
	return match;
}

async function settle() {
	await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
}

async function setTextarea(value: string) {
	const note = document.querySelector<HTMLTextAreaElement>("#report-note");
	if (!note) throw new Error("Brak notatki zgłoszenia");
	await act(async () => {
		Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(note, value);
		note.dispatchEvent(new Event("input", { bubbles: true }));
	});
	return note;
}

let container: HTMLDivElement;
let root: Root;

async function openReport() {
	await act(async () => button("Akceptuję zasady", container).click());
	await settle();
	const trigger = button("Zgłoś wiadomość", container);
	await act(async () => trigger.click());
	await settle();
	return trigger;
}

describe("message report surface", () => {
	/**
	 * Issue #19 assumptions approved before RED:
	 * input is one selected public message; output is one Polish modal containing only its
	 * pseudonym and a 240-code-point preview; dirty/pending dismissal requires an explicit action;
	 * cancel/success restore origin focus. Viewport geometry and operator handoff are browser tests.
	 */
	beforeEach(async () => {
		vi.clearAllMocks();
		vi.stubGlobal("WebSocket", FakeWebSocket);
		sessionStorage.clear();
		mocks.list.mockResolvedValue([snapshot.room]);
		mocks.refresh.mockResolvedValue(snapshot);
		mocks.past.mockResolvedValue([]);
		mocks.ticket.mockResolvedValue({ ticket: "a".repeat(64), expiresAt: "2026-09-14T07:01:00Z" });
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
		mocks.report.mockResolvedValue({
			reportId: "018f4c8e-5697-7df4-8f6e-c7644b137e57",
			status: "open",
			created: true,
		});
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		await act(async () =>
			root.render(
				createElement(
					QueryClientProvider,
					{ client: new QueryClient() },
					createElement(FlightRoom),
				),
			),
		);
		await settle();
		await settle();
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		vi.unstubAllGlobals();
	});

	it("opens focused with the selected pseudonym and message preview", async () => {
		await openReport();
		const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
		expect(dialog?.textContent).toContain("Zgłoś wiadomość");
		expect(dialog?.textContent).toContain("Bartek BGY");
		expect(dialog?.textContent).toContain("Jestem przy autobusie.");
		expect(dialog?.querySelector("#report-reason")).toBe(document.activeElement);
	});

	it("rejects 501 characters before POST with a linked Polish field error", async () => {
		await openReport();
		const note = await setTextarea("a".repeat(501));
		expect(note.getAttribute("aria-invalid")).toBe("true");
		expect(note.getAttribute("aria-describedby")).toBe("report-note-help");
		expect(document.querySelector("#report-note-help")?.textContent).toContain("najwyżej 500");
		expect(button("Wyślij zgłoszenie").disabled).toBe(true);
		expect(mocks.report).not.toHaveBeenCalled();
	});

	it("offers all seven reasons and accepts a 500-character Unicode note", async () => {
		await openReport();
		expect(
			Array.from(document.querySelectorAll<HTMLOptionElement>("#report-reason option")).map(
				(option) => [option.value, option.textContent],
			),
		).toEqual(
			SafetyReportReasonSchema.options.map((reason) => [
				reason,
				SAFETY_REPORT_REASON_LABELS[reason],
			]),
		);
		await setTextarea("🙂".repeat(500));
		await act(async () => button("Wyślij zgłoszenie").click());
		await settle();
		expect(mocks.report).toHaveBeenCalledWith(
			roomId,
			expect.objectContaining({ note: "🙂".repeat(500) }),
		);
	});

	it("returns focus to the selected message after explicit cancel", async () => {
		const trigger = await openReport();
		await act(async () => button("Anuluj").click());
		await settle();
		expect(document.querySelector('[role="dialog"]')).toBeNull();
		expect(document.activeElement).toBe(trigger);
	});

	it("keeps dirty input intact when Escape is pressed", async () => {
		await openReport();
		await setTextarea("Nie zamykaj tego zgłoszenia.");
		await act(async () =>
			document
				.querySelector('[role="dialog"]')
				?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
		);
		await settle();
		expect(document.querySelector<HTMLTextAreaElement>("#report-note")?.value).toBe(
			"Nie zamykaj tego zgłoszenia.",
		);
	});

	it("keeps dirty input intact when the backdrop is pressed", async () => {
		await openReport();
		await setTextarea("Notatka zostaje po dotknięciu tła.");
		const backdrop = document.querySelector('[data-slot="dialog-overlay"]');
		if (!(backdrop instanceof HTMLElement)) throw new Error("Brak tła dialogu");
		await act(async () => {
			backdrop.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
			backdrop.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		await settle();
		expect(document.querySelector<HTMLTextAreaElement>("#report-note")?.value).toBe(
			"Notatka zostaje po dotknięciu tła.",
		);
	});

	it("returns focus and confirms a new stored status beside the message", async () => {
		const trigger = await openReport();
		await act(async () => button("Wyślij zgłoszenie").click());
		await settle();
		expect(document.activeElement).toBe(trigger);
		expect(trigger.parentElement?.querySelector("output")?.textContent).toContain(
			"Zgłoszenie zapisane. Status: Otwarte.",
		);
	});

	it("shows the existing stored status for a deduplicated report", async () => {
		mocks.report.mockResolvedValueOnce({
			reportId: "018f4c8e-5697-7df4-8f6e-c7644b137e57",
			status: "resolved",
			created: false,
		});
		const trigger = await openReport();
		await act(async () => button("Wyślij zgłoszenie").click());
		await settle();
		expect(trigger.parentElement?.querySelector("output")?.textContent).toContain(
			"Zgłoszenie już istnieje. Status: Zamknięte.",
		);
		expect(container.textContent).not.toContain("Zgłoszenie zostało zapisane.");
	});

	it("announces a Polish rate-limit failure inside the open dialog", async () => {
		mocks.report.mockRejectedValueOnce(
			new Error("Zbyt wiele operacji bezpieczeństwa. Spróbuj ponownie za 60 sekund."),
		);
		await openReport();
		await act(async () => button("Wyślij zgłoszenie").click());
		await settle();
		const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
		expect(dialog?.querySelector('[role="alert"]')?.textContent).toContain("za 60 sekund");
		expect(button("Wyślij zgłoszenie").disabled).toBe(false);
	});

	it("announces and locks the surface while submission is pending", async () => {
		let resolveReport: ((value: unknown) => void) | undefined;
		mocks.report.mockImplementationOnce(() => new Promise((resolve) => (resolveReport = resolve)));
		await openReport();
		await act(async () => button("Wyślij zgłoszenie").click());
		const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
		expect(dialog?.querySelector("output")?.textContent).toContain("Wysyłanie");
		expect(button("Wyślij zgłoszenie").disabled).toBe(true);
		expect(button("Anuluj").disabled).toBe(true);
		await act(async () =>
			resolveReport?.({
				reportId: "018f4c8e-5697-7df4-8f6e-c7644b137e57",
				status: "open",
				created: true,
			}),
		);
	});
});
