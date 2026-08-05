// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearPrivateDropOff, loadPrivateDropOff, savePrivateDropOff } from "./private-drop-off";

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

	it("discards corrupt browser state and clears on demand", () => {
		sessionStorage.setItem(STORAGE_KEY, "{not json");
		expect(loadPrivateDropOff("flight-1")).toBeNull();
		expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();

		savePrivateDropOff({ flightInstanceId: "flight-1", label: "Navigli" });
		clearPrivateDropOff();
		expect(sessionStorage.getItem(STORAGE_KEY)).toBeNull();
	});
});
