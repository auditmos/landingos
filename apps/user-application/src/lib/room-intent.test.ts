// @vitest-environment jsdom
import type { JourneyVariant } from "@repo/data-ops/journey";
import { beforeEach, describe, expect, it } from "vitest";
import {
	clearRoomIntent,
	loadRoomIntent,
	markRoomIntentSelectionApplied,
	publicSelectionFromJourneyVariant,
	saveRoomIntent,
} from "./room-intent";

const variant: JourneyVariant = {
	id: "journey-1",
	badges: ["recommended", "fastest"],
	durationMinutes: 65,
	arrivalTimeUtc: "2026-09-14T10:10:00.000Z",
	cost: {
		currency: "EUR",
		minorMin: 1_000,
		minorMax: 1_200,
		completeness: "partial",
	},
	transferCount: 1,
	walkingMinutes: 8,
	walkingMeters: 550,
	steps: [
		{
			mode: "bus",
			from: "BGY",
			to: "Milano Centrale",
			durationMinutes: 50,
			walkingMeters: 0,
		},
		{
			mode: "metro",
			from: "Centrale",
			to: "Duomo",
			durationMinutes: 7,
			walkingMeters: 0,
		},
	],
	sourceReferences: [
		{
			kind: "catalog",
			label: "Airport Bus Express",
			url: "https://www.milanbergamoairport.it/en/bus/",
			checkedAt: "2026-07-27T00:00:00.000Z",
		},
		{
			kind: "provider",
			label: "ATM",
			url: null,
			checkedAt: null,
		},
	],
	manualVerification: null,
	externalLinks: [
		{
			kind: "navigation",
			label: "Nawigacja",
			url: "https://www.google.com/maps/dir/?api=1&destination=45.46,9.19",
		},
	],
};

beforeEach(() => sessionStorage.clear());

describe("public room intent", () => {
	it("derives only redacted badges, modes, and operator names from a private itinerary", () => {
		const selection = publicSelectionFromJourneyVariant(variant);
		expect(selection).toEqual({
			kind: "public_transport",
			badges: ["recommended", "fastest"],
			modes: ["bus", "metro"],
			operatorNames: ["Airport Bus Express", "ATM"],
		});
		expect(Object.keys(selection)).toEqual(["kind", "badges", "modes", "operatorNames"]);
		expect(JSON.stringify(selection)).not.toMatch(
			/destination|coordinates|cost|minor|walking|duration|url|checkedAt/i,
		);
	});

	it("persists only flight identity and the public selection across login", () => {
		saveRoomIntent({
			flightInstanceId: "flight-1",
			selection: publicSelectionFromJourneyVariant(variant),
		});
		expect(loadRoomIntent()).toEqual({
			flightInstanceId: "flight-1",
			selection: {
				kind: "public_transport",
				badges: ["recommended", "fastest"],
				modes: ["bus", "metro"],
				operatorNames: ["Airport Bus Express", "ATM"],
			},
		});
		const stored = sessionStorage.getItem("landingos.room-intent") ?? "";
		expect(stored).not.toMatch(
			/destination|coordinates|placeId|latitude|longitude|email|providerPayload/i,
		);
		clearRoomIntent();
		expect(loadRoomIntent()).toBeNull();
	});

	it("supports the separate minimal shared-taxi declaration", () => {
		saveRoomIntent({
			flightInstanceId: "flight-1",
			selection: { kind: "shared_taxi" },
		});
		expect(loadRoomIntent()?.selection).toEqual({ kind: "shared_taxi" });
	});

	it("marks the planner selection as applied exactly once, until the planner writes a fresh intent", () => {
		saveRoomIntent({ flightInstanceId: "flight-1", selection: { kind: "shared_taxi" } });
		expect(loadRoomIntent()?.selectionApplied).toBeUndefined();
		markRoomIntentSelectionApplied();
		expect(loadRoomIntent()?.selectionApplied).toBe(true);
		saveRoomIntent({ flightInstanceId: "flight-1", selection: { kind: "shared_taxi" } });
		expect(loadRoomIntent()?.selectionApplied).toBeUndefined();
	});

	it("ignores the applied marker when no intent is stored", () => {
		markRoomIntentSelectionApplied();
		expect(loadRoomIntent()).toBeNull();
	});

	it("keeps a public-transport option alongside a shared-taxi choice so the room can switch back (US-19)", () => {
		const publicOption = publicSelectionFromJourneyVariant(variant);
		saveRoomIntent({
			flightInstanceId: "flight-1",
			selection: { kind: "shared_taxi" },
			publicOption,
		});
		const loaded = loadRoomIntent();
		expect(loaded?.selection).toEqual({ kind: "shared_taxi" });
		expect(loaded?.publicOption).toEqual(publicOption);
	});
});
