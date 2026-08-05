// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MyFlightsPage } from "./my-flights-list";

const mocks = vi.hoisted(() => ({
	list: vi.fn(),
	past: vi.fn(),
}));

vi.mock("@/lib/room-api", async (importOriginal) => {
	const actual = await importOriginal<typeof import("@/lib/room-api")>();
	return {
		...actual,
		listMyRooms: mocks.list,
		fetchPastFlights: mocks.past,
	};
});

const roomId = "018f4c8e-5697-7df4-8f6e-c7644b137e5b";
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

let container: HTMLDivElement;
let root: Root;

async function settle() {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
}

async function mountPage() {
	container = document.createElement("div");
	document.body.appendChild(container);
	root = createRoot(container);
	await act(async () =>
		root.render(
			createElement(
				QueryClientProvider,
				{ client: new QueryClient() },
				createElement(MyFlightsPage),
			),
		),
	);
	await settle();
	await settle();
}

describe("Moje loty page", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
	});

	it("links each open room to its deep link and offers replanning past flights", async () => {
		mocks.list.mockResolvedValue([
			{
				id: roomId,
				flightInstanceId: "flight-1",
				closesAt: "2026-09-15T08:20:00.000Z",
				flight: flightFixture,
			},
		]);
		mocks.past.mockResolvedValue([
			{
				closedAt: "2026-07-20T08:20:00.000Z",
				flight: {
					...flightFixture,
					id: "flight-old",
					marketingFlightNumber: "5678",
					departureLocalDate: "2026-07-19",
					scheduledArrivalUtc: "2026-07-19T08:20:00.000Z",
				},
			},
		]);
		await mountPage();
		expect(container.textContent).toContain("Moje loty");
		expect(container.textContent).toContain("Otwarte pokoje");
		const roomLink = Array.from(container.querySelectorAll("a")).find((anchor) =>
			anchor.textContent?.includes("Ryanair FR1234"),
		);
		expect(roomLink?.getAttribute("href")).toBe(`/app?roomId=${roomId}`);

		expect(container.textContent).toContain("Poprzednie loty");
		const replan = Array.from(container.querySelectorAll("a")).find((anchor) =>
			anchor.textContent?.includes("Zaplanuj ponownie"),
		);
		expect(replan?.getAttribute("href")).toBe("/?flightNumber=FR5678");
	});

	it("shows the planner empty state without any open room", async () => {
		mocks.list.mockResolvedValue([]);
		mocks.past.mockResolvedValue([]);
		await mountPage();
		expect(container.textContent).toContain("Nie masz teraz otwartego pokoju lotu");
		expect(container.textContent).toContain("Wróć do planera");
		expect(container.textContent).not.toContain("Poprzednie loty");
	});
});
