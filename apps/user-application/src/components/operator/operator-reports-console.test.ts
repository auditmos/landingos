// @vitest-environment jsdom
import type { SafetyReportQueueItem, SafetyReportQueueQuery } from "@repo/data-ops/safety";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperatorReportsConsole } from "./operator-reports-console";

const mocks = vi.hoisted(() => ({ list: vi.fn() }));

vi.mock("@/lib/operator-reports-api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/operator-reports-api")>();
	return { ...actual, listSafetyReports: mocks.list };
});

const messageReport: SafetyReportQueueItem = {
	id: "018f4c8e-5697-7df4-8f6e-c7644b137e71",
	roomId: "018f4c8e-5697-7df4-8f6e-c7644b137e5b",
	flightDesignator: "FR1234",
	departureLocalDate: "2026-09-14",
	reporterPseudonym: "Alicja BGY",
	targetPseudonym: "Bartek BGY",
	messageId: "018f4c8e-5697-7df4-8f6e-c7644b137e61",
	reason: "commercial_spam",
	note: "Wysyła to samo do wszystkich.",
	status: "open",
	evidenceSnapshot: {
		messageText: "Kup teraz mój bilet",
		authorPseudonym: "Bartek BGY",
		originalMessageAt: "2026-09-14T07:00:00.000Z",
	},
	createdAt: "2026-09-14T07:20:00.000Z",
};

const erasedReport: SafetyReportQueueItem = {
	...messageReport,
	id: "018f4c8e-5697-7df4-8f6e-c7644b137e72",
	reporterPseudonym: null,
	targetPseudonym: null,
	evidenceSnapshot: null,
	note: null,
	reason: "harassment_or_discrimination",
};

const memberReport: SafetyReportQueueItem = {
	...messageReport,
	id: "018f4c8e-5697-7df4-8f6e-c7644b137e73",
	messageId: null,
	evidenceSnapshot: null,
	note: null,
	reason: "illegal_content",
};

function button(container: HTMLElement, label: string): HTMLButtonElement {
	const match = [...container.querySelectorAll("button")].find((candidate) =>
		candidate.textContent?.includes(label),
	);
	if (!match) throw new Error(`Brak przycisku: ${label}`);
	return match;
}

async function settle() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

describe("operator report queue panel", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(async () => {
		vi.clearAllMocks();
		mocks.list.mockImplementation(async (query: SafetyReportQueueQuery = {}) => ({
			reports: query.offset ? [memberReport] : [messageReport, erasedReport],
			hasMore: !query.offset,
		}));
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		const queryClient = new QueryClient({
			defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
		});
		await act(async () => {
			root.render(
				createElement(
					QueryClientProvider,
					{ client: queryClient },
					createElement(OperatorReportsConsole),
				),
			);
		});
		await settle();
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
	});

	it("renders pseudonyms, frozen evidence, and erased-account fallbacks in Polish", async () => {
		expect(container.textContent).toContain("Spam komercyjny");
		expect(container.textContent).toContain("Alicja BGY");
		expect(container.textContent).toContain("Bartek BGY");
		expect(container.textContent).toContain("Kup teraz mój bilet");
		expect(container.textContent).toContain("Wysyła to samo do wszystkich.");
		expect(container.textContent).toContain("FR1234");
		expect(container.textContent).toContain("konto usunięte");
		expect(container.textContent).toContain(
			"Treść wiadomości została usunięta po upływie okresu retencji.",
		);
	});

	it("filters by reason and appends the next page instead of replacing it", async () => {
		const filter = container.querySelector("#report-reason-filter");
		if (!(filter instanceof HTMLSelectElement)) throw new Error("Brak filtra powodu");
		await act(async () => {
			filter.value = "illegal_content";
			filter.dispatchEvent(new Event("change", { bubbles: true }));
		});
		await settle();
		expect(mocks.list).toHaveBeenCalledWith(
			expect.objectContaining({ reason: "illegal_content", offset: 0 }),
		);

		await act(async () => {
			button(container, "Wczytaj więcej").click();
		});
		await settle();
		expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ offset: 25 }));
		expect(container.textContent).toContain("Kup teraz mój bilet");
		expect(container.textContent).toContain(
			"Zgłoszenie dotyczy osoby, nie pojedynczej wiadomości.",
		);
	});
});
