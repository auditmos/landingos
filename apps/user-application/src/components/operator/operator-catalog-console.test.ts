// @vitest-environment jsdom
import type { TransferCatalogRecord } from "@repo/data-ops/journey";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperatorCatalogConsole } from "./operator-catalog-console";

const mocks = vi.hoisted(() => ({
	entry: null as TransferCatalogRecord | null,
	create: vi.fn(),
	update: vi.fn(),
	publish: vi.fn(),
	unpublish: vi.fn(),
	remove: vi.fn(),
}));

vi.mock("@/lib/operator-catalog-api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/operator-catalog-api")>();
	return {
		...actual,
		listCatalogEntries: vi.fn(async () => (mocks.entry ? [mocks.entry] : [])),
		createCatalogDraft: mocks.create,
		updateCatalogDraft: mocks.update,
		saveAndPublishCatalogEntry: mocks.publish,
		unpublishCatalogEntry: mocks.unpublish,
		deleteCatalogEntry: mocks.remove,
	};
});

const completeDraft: TransferCatalogRecord = {
	id: "entry-1",
	originIata: "BGY",
	operatorName: "Operator",
	serviceName: "BGY → Milano Centrale",
	destinationStopCode: "milano-centrale",
	destinationStopName: "Milano Centrale",
	durationMinutes: 50,
	transferCount: 0,
	walkingMinutes: 0,
	walkingMeters: 0,
	sourceUrl: "https://www.milanbergamoairport.it/en/bus/",
	checkedAt: new Date().toISOString(),
	costMinorMin: 1_000,
	costMinorMax: 1_200,
	purchaseUrl: "https://www.airportbusexpress.it/tickets",
	publicationStatus: "draft",
	provenance: "operator_verified",
	freshness: "fresh",
	createdAt: "2026-07-27T00:00:00.000Z",
	updatedAt: "2026-07-27T00:00:00.000Z",
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

async function click(element: HTMLElement) {
	await act(async () => {
		element.click();
	});
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

describe("operator catalog panel", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(async () => {
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		mocks.entry = null;
		vi.clearAllMocks();
		mocks.create.mockImplementation(async () => {
			mocks.entry = completeDraft;
			return completeDraft;
		});
		mocks.update.mockImplementation(async (_id, input) => {
			mocks.entry = { ...(mocks.entry as TransferCatalogRecord), ...input };
			return mocks.entry;
		});
		mocks.publish.mockImplementation(async () => {
			mocks.entry = {
				...(mocks.entry as TransferCatalogRecord),
				publicationStatus: "published",
			};
			return mocks.entry;
		});
		mocks.unpublish.mockImplementation(async () => {
			mocks.entry = { ...(mocks.entry as TransferCatalogRecord), publicationStatus: "draft" };
			return mocks.entry;
		});
		mocks.remove.mockImplementation(async () => {
			mocks.entry = null;
		});
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
					createElement(OperatorCatalogConsole),
				),
			);
		});
		await settle();
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		delete (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT;
	});

	it("creates, edits, publishes, views, unpublishes, and deletes through Polish controls", async () => {
		const operatorInput = container.querySelector<HTMLInputElement>("#catalog-operatorName");
		expect(operatorInput).not.toBeNull();
		await enter(operatorInput as HTMLInputElement, "Operator");
		await click(button(container, "Zapisz szkic"));
		expect(mocks.create).toHaveBeenCalledWith(
			expect.objectContaining({ operatorName: "Operator" }),
		);
		expect(container.textContent).toContain("BGY → Milano Centrale");

		const selectedOperator = container.querySelector<HTMLInputElement>("#catalog-operatorName");
		await enter(selectedOperator as HTMLInputElement, "Nowy operator");
		await click(button(container, "Zapisz szkic"));
		expect(mocks.update).toHaveBeenCalledWith(
			"entry-1",
			expect.objectContaining({ operatorName: "Nowy operator" }),
		);

		await click(button(container, "Zapisz i opublikuj"));
		expect(mocks.publish).toHaveBeenCalledWith(
			expect.objectContaining({ operatorName: "Nowy operator" }),
			"entry-1",
		);
		expect(container.textContent).toContain("Opublikowany");

		await click(button(container, "Wycofaj publikację"));
		expect(mocks.unpublish).toHaveBeenCalledWith("entry-1");
		await click(button(container, "Usuń"));
		expect(mocks.remove).toHaveBeenCalledWith("entry-1");
		expect(container.textContent).toContain("Katalog nie zawiera jeszcze wpisów");
	});
});
