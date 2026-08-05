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

	it("round-trips the planner's exact navigation link alongside the label", () => {
		const plannerUrl =
			"https://www.google.com/maps/dir/?api=1&origin=45.673889,9.704167&destination=45.464098,9.191926&travelmode=transit";
		savePrivateDropOff({ flightInstanceId: "flight-1", label: "Bershka", mapsUrl: plannerUrl });
		expect(loadPrivateDropOff("flight-1")?.mapsUrl).toBe(plannerUrl);
	});

	it("drops a navigation link that fails the external-host allowlist, keeping the label", () => {
		savePrivateDropOff({
			flightInstanceId: "flight-1",
			label: "Bershka",
			mapsUrl: "https://evil.example/maps?query=Bershka",
		});
		const loaded = loadPrivateDropOff("flight-1");
		expect(loaded?.label).toBe("Bershka");
		expect(loaded?.mapsUrl).toBeUndefined();
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
