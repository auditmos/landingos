// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
	APPROVED_JOURNEY_EXTERNAL_HOSTS,
	OPERATOR_CATALOG_FIELDS,
	type TransferCatalogRecord,
} from "@repo/data-ops/journey";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OperatorCatalogConsole } from "./operator-catalog-console";

/*
 * Issue #21: every operator field gets the same small "i" disclosure as the landing
 * form, and the URL fields stop repeating the whole approved-host list as body text.
 */

vi.mock("@/lib/operator-catalog-api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/operator-catalog-api")>();
	return { ...actual, listCatalogEntries: vi.fn(async () => [] as TransferCatalogRecord[]) };
});

const CONSOLE_SOURCE = readFileSync(
	resolve(import.meta.dirname, "operator-catalog-console.tsx"),
	"utf8",
);

async function settle() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

describe("operator field help", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(async () => {
		(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
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

	it.each(
		OPERATOR_CATALOG_FIELDS,
	)("$name renders the shared disclosure next to its label", (field) => {
		const input = container.querySelector<HTMLElement>(`#catalog-${field.name}`);
		const label = container.querySelector<HTMLLabelElement>(`label[for="catalog-${field.name}"]`);
		const summary = container.querySelector<HTMLElement>(`#catalog-${field.name}-info-summary`);
		const help = container.querySelector<HTMLElement>(`#catalog-${field.name}-info`);

		expect(input).not.toBeNull();
		expect(label?.textContent).toContain(field.label);
		expect(summary?.tagName).toBe("SUMMARY");
		expect(summary?.getAttribute("aria-label")).toBe(`Informacja: ${field.label}`);
		expect(summary?.getAttribute("aria-expanded")).toBe("false");
		expect(help?.textContent).toBe(field.help);
		expect(input?.getAttribute("aria-describedby")).toContain(`catalog-${field.name}-info`);
	});

	it("exposes the expanded state after keyboard activation and keeps focus visible", async () => {
		const summary = container.querySelector<HTMLElement>("#catalog-operatorName-info-summary");
		summary?.focus();
		expect(document.activeElement).toBe(summary);
		expect(summary?.className).toContain("focus-visible:ring");
		expect(summary?.tabIndex).toBeGreaterThanOrEqual(0);

		// jsdom does not implement the native <summary> toggle, so drive the same event
		// the browser fires when Enter or Space activates it.
		await act(async () => {
			const details = summary?.closest("details");
			if (details) {
				details.open = true;
				details.dispatchEvent(new Event("toggle"));
			}
		});
		expect(summary?.getAttribute("aria-expanded")).toBe("true");
	});

	it("keeps the popover inside a narrow viewport", () => {
		const help = container.querySelector<HTMLElement>("#catalog-purchaseUrl-info");
		expect(help?.className).toContain("max-w-[calc(100vw-3rem)]");
	});

	it("no longer repeats the approved-host list as permanent body text", () => {
		const permanentText = [...container.querySelectorAll("p")]
			.filter((paragraph) => !paragraph.closest("details"))
			.map((paragraph) => paragraph.textContent ?? "")
			.join(" ");
		for (const host of APPROVED_JOURNEY_EXTERNAL_HOSTS) {
			expect(permanentText).not.toContain(host);
		}
		expect(container.querySelectorAll("#catalog-sourceUrl-info")).toHaveLength(1);
		expect(container.querySelectorAll("#catalog-purchaseUrl-info")).toHaveLength(1);
	});

	it("keeps draft save available while an empty publish reports every field", async () => {
		const publish = [...container.querySelectorAll("button")].find((candidate) =>
			candidate.textContent?.includes("Zapisz i opublikuj"),
		);
		const saveDraft = [...container.querySelectorAll("button")].find((candidate) =>
			candidate.textContent?.includes("Zapisz szkic"),
		);
		expect(saveDraft?.disabled).toBe(false);

		await act(async () => publish?.click());
		await settle();

		for (const field of OPERATOR_CATALOG_FIELDS) {
			const input = container.querySelector<HTMLElement>(`#catalog-${field.name}`);
			const error = container.querySelector<HTMLElement>(`#catalog-${field.name}-error`);
			expect(input?.getAttribute("aria-invalid"), field.name).toBe("true");
			expect(error?.textContent, field.name).toBe(field.requiredMessage);
			expect(input?.getAttribute("aria-describedby"), field.name).toBe(
				`catalog-${field.name}-info catalog-${field.name}-error`,
			);
		}
	});

	it("keeps a single source of labels and help copy", () => {
		expect(CONSOLE_SOURCE).toContain("OPERATOR_CATALOG_FIELDS");
		expect(CONSOLE_SOURCE).not.toMatch(/label:\s*"/);
		expect(CONSOLE_SOURCE).not.toContain("Zatwierdzone hosty");
	});
});
