import { describe, expect, it } from "vitest";
import { createLivePlacesProvider } from "./live-places";
import { MILAN_MUNICIPALITY_VIEWPORT } from "./milan-viewport";

describe("live Places provider", () => {
	it("uses the locked rectangle and returns normalized autocomplete/details values", async () => {
		const requests: Array<{ url: string; init?: RequestInit }> = [];
		const provider = createLivePlacesProvider(
			{ googleMapsApiKey: "test-google-key" },
			async (url, init) => {
				requests.push({ url, init });
				if (url.endsWith("places:autocomplete")) {
					return Response.json({
						suggestions: [
							{
								placePrediction: {
									placeId: "google:duomo",
									structuredFormat: {
										mainText: { text: "Duomo di Milano" },
										secondaryText: { text: "Piazza del Duomo, Milano" },
									},
								},
							},
						],
					});
				}
				return Response.json({
					id: "google:duomo",
					displayName: { text: "Duomo di Milano" },
					location: { latitude: 45.464098, longitude: 9.191926 },
				});
			},
		);

		const autocomplete = await provider.autocomplete({
			query: "Duomo",
			languageCode: "pl",
			regionCode: "IT",
			sessionToken: "planner-session-123456",
		});
		const details = await provider.details({
			placeId: "google:duomo",
			languageCode: "pl",
			regionCode: "IT",
			sessionToken: "planner-session-123456",
		});

		expect(provider.viewport).toBe(MILAN_MUNICIPALITY_VIEWPORT);
		expect(autocomplete).toEqual({
			status: "success",
			value: [
				{
					placeId: "google:duomo",
					primaryText: "Duomo di Milano",
					secondaryText: "Piazza del Duomo, Milano",
				},
			],
		});
		expect(details).toEqual({
			status: "success",
			value: {
				placeId: "google:duomo",
				displayName: "Duomo di Milano",
				coordinate: {
					latitude: 45.464098,
					longitude: 9.191926,
				},
			},
		});
		expect(JSON.parse(String(requests[0]?.init?.body))).toMatchObject({
			languageCode: "pl",
			regionCode: "IT",
			sessionToken: "planner-session-123456",
			locationRestriction: {
				rectangle: MILAN_MUNICIPALITY_VIEWPORT.rectangle,
			},
		});
		expect(requests.map((request) => request.url)).toEqual([
			"https://places.googleapis.com/v1/places:autocomplete",
			"https://places.googleapis.com/v1/places/google%3Aduomo?languageCode=pl&regionCode=IT&sessionToken=planner-session-123456",
		]);
	});

	it("reads a replacement versioned rectangle from configuration", async () => {
		const configuredArea = {
			version: "milan-test-v2",
			rectangle: {
				low: { latitude: 45.4, longitude: 9.1 },
				high: { latitude: 45.5, longitude: 9.2 },
			},
		};
		let requestBody: unknown;
		const provider = createLivePlacesProvider(
			{ googleMapsApiKey: "test-google-key" },
			async (_url, init) => {
				requestBody = JSON.parse(String(init?.body));
				return Response.json({ suggestions: [] });
			},
			configuredArea,
		);
		await provider.autocomplete({
			query: "Duomo",
			sessionToken: "planner-session-123456",
		});
		expect(provider.viewport).toBe(configuredArea);
		expect(requestBody).toMatchObject({
			locationRestriction: { rectangle: configuredArea.rectangle },
		});
	});
});
