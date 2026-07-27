// @vitest-environment jsdom

import { ANALYTICS_FUNNEL_HEADER } from "@repo/data-ops/analytics";
import type { FlightResolveResult } from "@repo/data-ops/flight";
import type { JourneyRecommendationResult } from "@repo/data-ops/journey";
import type { RoomSnapshot } from "@repo/data-ops/room";
import { clearAnalyticsFunnel } from "./analytics-funnel";
import { resolveFlightApi } from "./flight-planner";
import { recommendJourneysApi } from "./journey-planner";
import { joinRoom, sendRoomMessage, updateRoomSelection } from "./room-api";

const FUNNEL_ID = "00112233445566778899aabbccddeeff";
const ROOM_ID = "018f4c8e-5697-7df4-8f6e-c7644b137e5b";
const recognized: FlightResolveResult = {
	status: "recognized",
	flight: {
		id: "flight-1",
		marketingCarrierCode: "FR",
		marketingCarrierName: "Ryanair",
		marketingFlightNumber: "1234",
		operatingCarrierCode: "FR",
		operatingFlightNumber: "1234",
		departureLocalDate: "2026-09-14",
		originIata: "WAW",
		destinationIata: "BGY",
		scheduledArrivalUtc: "2026-09-14T08:20:00.000Z",
		displayTimezone: "Europe/Rome",
		source: "provider",
	},
};
const recommendations: JourneyRecommendationResult = {
	status: "recommendations",
	variants: [
		{
			id: "route-1",
			badges: ["recommended"],
			durationMinutes: 50,
			arrivalTimeUtc: "2026-09-14T10:00:00.000Z",
			cost: { currency: "EUR", minorMin: 1_000, minorMax: 1_000, completeness: "complete" },
			transferCount: 0,
			walkingMinutes: 0,
			walkingMeters: 0,
			steps: [
				{
					mode: "bus",
					from: "Aeroporto BGY",
					to: "Milano Centrale",
					durationMinutes: 50,
					walkingMeters: 0,
				},
			],
			sourceReferences: [{ kind: "provider", label: "Fixture", url: null, checkedAt: null }],
			manualVerification: null,
			externalLinks: [],
		},
	],
	explanation: null,
};
const snapshot: RoomSnapshot = {
	room: {
		id: ROOM_ID,
		flightInstanceId: "flight-1",
		closesAt: "2026-09-15T08:20:00.000Z",
	},
	member: { pseudonym: "Alicja BGY", selection: null },
	members: [{ pseudonym: "Alicja BGY", selection: null }],
	messages: [],
};

function withFunnel(body: unknown, status = 200) {
	return Response.json(body, {
		status,
		headers: { [ANALYTICS_FUNNEL_HEADER]: FUNNEL_ID },
	});
}

describe("full browser funnel continuity", () => {
	it("accepts the server-created ID once and reuses only that ID through retries and chat", async () => {
		clearAnalyticsFunnel();
		const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const path = new URL(String(input)).pathname;
			const headers = new Headers(init?.headers);
			if (fetchMock.mock.calls.length === 1) {
				expect(headers.has(ANALYTICS_FUNNEL_HEADER)).toBe(false);
			} else {
				expect(headers.get(ANALYTICS_FUNNEL_HEADER)).toBe(FUNNEL_ID);
			}
			if (path === "/flights/resolve") return withFunnel(recognized);
			if (path === "/journeys/recommend") return withFunnel(recommendations);
			if (path === "/rooms/join") return withFunnel(snapshot);
			if (path.endsWith("/selection")) {
				return withFunnel({
					pseudonym: "Alicja BGY",
					selection: { kind: "shared_taxi" },
				});
			}
			return withFunnel(
				{
					created: true,
					message: {
						id: "018f4c8e-5697-7df4-8f6e-c7644b137e51",
						clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e52",
						pseudonym: "Alicja BGY",
						content: "Cześć!",
						createdAt: "2026-09-14T07:00:00.000Z",
					},
				},
				201,
			);
		});

		await resolveFlightApi({ flightNumber: "FR1234", departureLocalDate: "2026-09-14" }, fetchMock);
		await resolveFlightApi({ flightNumber: "FR1234", departureLocalDate: "2026-09-14" }, fetchMock);
		await recommendJourneysApi(
			{
				flightInstanceId: "flight-1",
				scheduledArrivalUtc: "2026-09-14T08:20:00.000Z",
				privateDestinationCoordinates: { latitude: 45.46, longitude: 9.19 },
				bufferMinutes: 45,
			},
			undefined,
			fetchMock,
		);
		await joinRoom("flight-1", fetchMock);
		await updateRoomSelection(ROOM_ID, { kind: "shared_taxi" }, fetchMock);
		await sendRoomMessage(
			ROOM_ID,
			{
				clientMessageId: "018f4c8e-5697-7df4-8f6e-c7644b137e52",
				content: "Cześć!",
			},
			fetchMock,
		);

		expect(fetchMock).toHaveBeenCalledTimes(6);
		const analyticsHeaders = fetchMock.mock.calls.map((call) =>
			Object.fromEntries(new Headers(call[1]?.headers).entries()),
		);
		expect(JSON.stringify(analyticsHeaders)).not.toMatch(
			/email|placeId|coordinates|messageContent|actorPseudonym/i,
		);
	});
});
