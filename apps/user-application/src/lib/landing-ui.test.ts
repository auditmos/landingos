// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { FlightPlanner } from "@/components/flight/flight-planner";

describe("landing page visual baseline", () => {
	it("applies the theme background and foreground tokens to the document", () => {
		const styles = readFileSync(resolve(import.meta.dirname, "../styles.css"), "utf8");

		expect(styles).toContain("background-color: var(--background)");
		expect(styles).toContain("color: var(--foreground)");
		expect(styles).toContain("min-height: 100dvh");
	});

	it("renders a cohesive, readable hero and touch-sized lookup form", async () => {
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);
		await act(async () => root.render(createElement(FlightPlanner)));

		const page = container.firstElementChild;
		const heading = container.querySelector("h1");
		const introduction = heading?.nextElementSibling;
		const flightNumber = container.querySelector<HTMLInputElement>("#flight-number");
		const departurePicker = container.querySelector<HTMLButtonElement>("#departure-date");
		const nativeDateInput = container.querySelector<HTMLInputElement>("#departure-date-native");

		expect(page?.className).toContain("min-h-dvh");
		expect(page?.className).not.toContain("gradient");
		expect(heading?.className).toContain("text-balance");
		expect(introduction?.className).toContain("text-pretty");
		expect(flightNumber?.className).toContain("h-12");
		expect(departurePicker?.className).toContain("h-12");
		expect(nativeDateInput?.type).toBe("date");
		expect(nativeDateInput?.className).toContain("sr-only");

		await act(async () => root.unmount());
		container.remove();
	});

	it("rotates the hero destination and highlights Milan as the only live city", async () => {
		vi.useFakeTimers();
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);
		await act(async () => root.render(createElement(FlightPlanner)));

		const heading = container.querySelector("h1");
		const rotating = heading?.querySelector('[aria-hidden="true"]');

		// Initial paint: Milan, tinted as the only city that actually works.
		expect(rotating?.querySelector(".text-primary")?.textContent).toBe("Mediolanie");
		// Screen readers get a stable heading, not the teaser carousel.
		expect(heading?.querySelector(".sr-only")?.textContent).toBe("w Mediolanie");

		await act(async () => {
			vi.advanceTimersByTime(2700);
		});

		// Next city is a teaser: plain heading color, no primary tint.
		expect(rotating?.textContent).toContain("Madrycie");
		expect(rotating?.querySelector(".text-primary")).toBeNull();

		// The corridor line left the header; the footer lost the Milan-only sentence.
		expect(container.querySelector("header")?.textContent).not.toContain("BGY");
		expect(container.querySelector("footer")?.textContent).not.toContain("Zaczynamy od lotów");

		await act(async () => root.unmount());
		container.remove();
		vi.useRealTimers();
	});

	it("splits the route board into a live corridor and a coming-soon teaser", async () => {
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);
		await act(async () => root.render(createElement(FlightPlanner)));

		const live = [...container.querySelectorAll("p")].find((p) =>
			p.textContent?.includes("Dostępne teraz"),
		);
		const soon = [...container.querySelectorAll("p")].find((p) =>
			p.textContent?.includes("Kolejne kierunki wkrótce"),
		);

		// The live chip carries the corridor and the success pulse dot.
		expect(live?.textContent).toContain("Mediolan");
		expect(live?.querySelector(".bg-success")).not.toBeNull();
		// The teaser chip is visually secondary (dashed) and names the next cities.
		expect(soon?.className).toContain("border-dashed");
		expect(soon?.textContent).toContain("Madryt");

		await act(async () => root.unmount());
		container.remove();
	});

	it("offers a way back to the signed-in flight rooms", async () => {
		const container = document.createElement("div");
		document.body.appendChild(container);
		const root = createRoot(container);
		await act(async () => root.render(createElement(FlightPlanner)));

		const appLinks = [...container.querySelectorAll<HTMLAnchorElement>('a[href="/app"]')];

		expect(appLinks.length).toBeGreaterThan(0);
		expect(container.querySelector("header")?.querySelector('a[href="/app"]')).not.toBeNull();
		for (const link of appLinks) {
			expect(link.textContent?.trim()).not.toBe("");
		}

		await act(async () => root.unmount());
		container.remove();
	});
});
