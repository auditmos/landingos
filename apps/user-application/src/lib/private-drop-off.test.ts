// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
	clearPrivateDropOff,
	dropOffMapsUrl,
	loadPrivateDropOff,
	savePrivateDropOff,
} from "./private-drop-off";

const STORAGE_KEY = "landingos.private-drop-off";

describe("private drop-off store", () => {
	beforeEach(() => sessionStorage.clear());

	it("round-trips a label for the matching flight instance", () => {
		savePrivateDropOff({ flightInstanceId: "flight-1", label: "  Piazza del Duomo 1  " });
		expect(loadPrivateDropOff("flight-1")).toEqual({
			flightInstanceId: "flight-1",
			label: "Piazza del Duomo 1",
		});
	});

	it("discards state saved for a different flight instance", () => {
		savePrivateDropOff({ flightInstanceId: "flight-1", label: "Navigli" });
		expect(loadPrivateDropOff("flight-2")).toBeNull();
		expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it("stores only the label — never place IDs or coordinates", () => {
		savePrivateDropOff({ flightInstanceId: "flight-1", label: "Navigli" });
		expect(sessionStorage.getItem(STORAGE_KEY)).not.toMatch(
			/placeId|coordinates|latitude|longitude/i,
		);
	});

	it("refuses labels beyond 120 characters instead of persisting them", () => {
		savePrivateDropOff({ flightInstanceId: "flight-1", label: "x".repeat(121) });
		expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it("round-trips the chosen route summary alongside the label", () => {
		savePrivateDropOff({
			flightInstanceId: "flight-1",
			label: "Bershka",
			route: [
				{ mode: "bus", from: "Bergamo BGY", to: "Milano Centrale", durationMinutes: 50 },
				{ mode: "walk", from: "Milano Centrale", to: "Bershka", durationMinutes: 8 },
			],
		});
		const loaded = loadPrivateDropOff("flight-1");
		expect(loaded?.route).toHaveLength(2);
		expect(loaded?.route?.[0]).toEqual({
			mode: "bus",
			from: "Bergamo BGY",
			to: "Milano Centrale",
			durationMinutes: 50,
		});
	});

	it("refuses an oversized route instead of persisting it", () => {
		savePrivateDropOff({
			flightInstanceId: "flight-1",
			label: "Bershka",
			route: Array.from({ length: 21 }, (_, index) => ({
				mode: "bus",
				from: `Stop ${index}`,
				to: `Stop ${index + 1}`,
				durationMinutes: 5,
			})),
		});
		expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
	});

	it("builds an allowlisted Google Maps search link from the label", () => {
		expect(dropOffMapsUrl("Piazza del Duomo 1")).toBe(
			"https://www.google.com/maps/search/?api=1&query=Piazza%20del%20Duomo%201",
		);
		expect(dropOffMapsUrl("   ")).toBeNull();
	});

	it("discards corrupt browser state and clears on demand", () => {
		sessionStorage.setItem(STORAGE_KEY, "{not json");
		expect(loadPrivateDropOff("flight-1")).toBeNull();
		expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();

		savePrivateDropOff({ flightInstanceId: "flight-1", label: "Navigli" });
		clearPrivateDropOff();
		expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
	});
});
