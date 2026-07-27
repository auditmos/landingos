import { describe, expect, it } from "vitest";
import { createLiveFlightProvider } from "./live-flight";

describe("live flight provider", () => {
	it("normalizes an Aviationstack response into a canonical flight instance", async () => {
		const requestedUrls: string[] = [];
		const provider = createLiveFlightProvider(
			{ aviationstackAccessKey: "test-flight-key" },
			async (url) => {
				requestedUrls.push(url);
				return Response.json({
					data: [
						{
							flight: { iata: "FR1234" },
							airline: { name: "Ryanair" },
							departure: {
								iata: "WAW",
								airport: "Lotnisko Chopina w Warszawie",
							},
							arrival: {
								iata: "BGY",
								airport: "Mediolan-Bergamo",
								scheduled: "2026-09-14T10:20:00+02:00",
								timezone: "Europe/Rome",
							},
						},
					],
				});
			},
		);

		const result = await provider.lookup({
			flightNumber: " fr1234 ",
			date: "2026-09-14",
		});

		expect(result).toEqual({
			status: "success",
			value: {
				id: "fr1234:2026-09-14:waw-bgy",
				carrier: "Ryanair",
				flightNumber: "FR1234",
				date: "2026-09-14",
				origin: {
					iata: "WAW",
					name: "Lotnisko Chopina w Warszawie",
				},
				destination: {
					iata: "BGY",
					name: "Mediolan-Bergamo",
				},
				scheduledArrival: "2026-09-14T10:20:00+02:00",
				timeZone: "Europe/Rome",
			},
		});
		expect(requestedUrls).toEqual([
			"https://api.aviationstack.com/v1/flights?access_key=test-flight-key&flight_iata=FR1234&flight_date=2026-09-14",
		]);
	});
});
