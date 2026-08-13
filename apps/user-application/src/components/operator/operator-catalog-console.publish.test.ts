// @vitest-environment jsdom
import type { TransferCatalogDraftInput, TransferCatalogRecord } from "@repo/data-ops/journey";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperatorCatalogConsole } from "./operator-catalog-console";

const existingDraft: TransferCatalogRecord = {
	id: "entry-1",
	originIata: "BGY",
	operatorName: "Stary operator",
	serviceName: "Stary transfer",
	destinationStopCode: "old-stop",
	destinationStopName: "Stary przystanek",
	durationMinutes: 1,
	transferCount: 1,
	walkingMinutes: 1,
	walkingMeters: 1,
	sourceUrl: "https://www.milanbergamoairport.it/en/bus/",
	checkedAt: "2026-07-20T00:00:00.000Z",
	costMinorMin: 1,
	costMinorMax: 1,
	purchaseUrl: "https://www.airportbusexpress.it/tickets",
	publicationStatus: "draft",
	provenance: "operator_verified",
	freshness: "fresh",
	createdAt: "2026-07-20T00:00:00.000Z",
	updatedAt: "2026-07-20T00:00:00.000Z",
};

const visibleValues = {
	operatorName: "Terravision",
	serviceName: "BGY → Milano Centrale",
	destinationStopCode: "milano-centrale",
	destinationStopName: "Milano Centrale",
	durationMinutes: "50",
	transferCount: "0",
	walkingMinutes: "0",
	walkingMeters: "0",
	sourceUrl: "https://www.terravision.eu/airport_transfer/bus-bergamo-airport-milan/",
	checkedAt: "2026-08-13T05:00",
	costMinorMin: "500",
	costMinorMax: "1000",
	purchaseUrl: "https://www.flixbus.com/bus-routes/bus-bergamo-orio-al-serio-airport-milan",
} as const;

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

async function click(element: HTMLElement) {
	await act(async () => element.click());
	await settle();
}

async function enter(input: HTMLInputElement, value: string) {
	await act(async () => {
		const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
		setter?.call(input, value);
		input.dispatchEvent(new Event("input", { bubbles: true }));
		input.dispatchEvent(new Event("change", { bubbles: true }));
	});
}

async function renderConsole(
	initial: TransferCatalogRecord | null,
	otherEntries: TransferCatalogRecord[] = [],
) {
	let current = initial;
	let entries = [...(initial ? [initial] : []), ...otherEntries];
	const fetchSpy = vi.fn(async (request: RequestInfo | URL, init?: RequestInit) => {
		const path = new URL(String(request)).pathname;
		if (init?.method === "POST") {
			const input = JSON.parse(String(init.body)) as TransferCatalogDraftInput;
			current = {
				...existingDraft,
				...input,
				id: current?.id ?? "entry-new",
				publicationStatus: "published",
				freshness: "fresh",
			};
			entries = [...entries.filter((entry) => entry.id !== current?.id), current];
			return Response.json(current, { status: path === "/operator/catalog/publish" ? 201 : 200 });
		}
		return Response.json({ entries });
	});
	vi.stubGlobal("fetch", fetchSpy);
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	const queryClient = new QueryClient({
		defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
	});
	await act(async () => {
		root.render(
			createElement(
				QueryClientProvider,
				{ client: queryClient },
				createElement(OperatorCatalogConsole),
			),
		);
	});
	await settle();
	return { container, fetchSpy, root };
}

beforeEach(() => {
	(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
});

describe("operator catalog atomic publication", () => {
	it("marks edits and prevents silent loss on entry switch or browser leave", async () => {
		const secondDraft = {
			...existingDraft,
			id: "entry-2",
			operatorName: "Drugi operator",
			serviceName: "Drugi transfer",
		};
		const { container, root } = await renderConsole(existingDraft, [secondDraft]);
		try {
			await click(button(container, existingDraft.serviceName as string));
			const operatorName = container.querySelector<HTMLInputElement>("#catalog-operatorName");
			await enter(operatorName as HTMLInputElement, "Niezapisany operator");
			expect(container.textContent).toContain("Niezapisane zmiany");

			const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
			await click(button(container, secondDraft.serviceName));
			expect(confirm).toHaveBeenCalledWith("Masz niezapisane zmiany. Czy chcesz je odrzucić?");
			expect(container.querySelector<HTMLInputElement>("#catalog-operatorName")?.value).toBe(
				"Niezapisany operator",
			);

			const beforeUnload = new Event("beforeunload", { cancelable: true });
			expect(window.dispatchEvent(beforeUnload)).toBe(false);

			confirm.mockReturnValue(true);
			await click(button(container, secondDraft.serviceName));
			expect(container.querySelector<HTMLInputElement>("#catalog-operatorName")?.value).toBe(
				"Drugi operator",
			);
		} finally {
			await act(async () => root.unmount());
			container.remove();
		}
	});

	it("shows approved hosts beside both URL fields and names a rejected lookalike", async () => {
		const { container, fetchSpy, root } = await renderConsole(null);
		try {
			for (const field of ["sourceUrl", "purchaseUrl"] as const) {
				const input = container.querySelector<HTMLInputElement>(`#catalog-${field}`);
				const guidance = document.getElementById(input?.getAttribute("aria-describedby") ?? "");
				expect(guidance?.textContent).toContain("Wymagany HTTPS");
				expect(guidance?.textContent).toContain("www.flixbus.com");
				expect(guidance?.textContent).toContain("www.terravision.eu");
			}

			const source = container.querySelector<HTMLInputElement>("#catalog-sourceUrl");
			await enter(source as HTMLInputElement, "https://www.flixbus.com.evil.example/tickets");
			await click(button(container, "Zapisz i opublikuj"));

			expect(container.textContent).toContain(
				"Host „www.flixbus.com.evil.example” nie jest zatwierdzony.",
			);
			expect(fetchSpy.mock.calls.filter((call) => call[1]?.method === "POST")).toHaveLength(0);
		} finally {
			await act(async () => root.unmount());
			container.remove();
		}
	});

	it.each([
		["new", null, "/operator/catalog/publish"],
		["saved", existingDraft, "/operator/catalog/entry-1/publish"],
	] as const)("publishes all 13 visible values from a %s draft", async (_case, initial, path) => {
		const { container, fetchSpy, root } = await renderConsole(initial);
		try {
			if (initial) await click(button(container, initial.serviceName as string));
			for (const [field, value] of Object.entries(visibleValues)) {
				const input = container.querySelector<HTMLInputElement>(`#catalog-${field}`);
				expect(input, field).not.toBeNull();
				await enter(input as HTMLInputElement, value);
			}

			await click(button(container, "Zapisz i opublikuj"));

			const publishCalls = fetchSpy.mock.calls.filter((call) => call[1]?.method === "POST");
			expect(publishCalls).toHaveLength(1);
			expect(new URL(String(publishCalls[0]?.[0])).pathname).toBe(path);
			expect(JSON.parse(String(publishCalls[0]?.[1]?.body))).toEqual({
				...visibleValues,
				durationMinutes: 50,
				transferCount: 0,
				walkingMinutes: 0,
				walkingMeters: 0,
				costMinorMin: 500,
				costMinorMax: 1_000,
				checkedAt: new Date(visibleValues.checkedAt).toISOString(),
			});
		} finally {
			await act(async () => root.unmount());
			container.remove();
		}
	});
});
