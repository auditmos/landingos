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
									text: { text: "Duomo di Milano" },
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
		});
		const details = await provider.details({ placeId: "google:duomo" });

		expect(provider.viewport).toBe(MILAN_MUNICIPALITY_VIEWPORT);
		expect(autocomplete).toEqual({
			status: "success",
			value: [
				{
					placeId: "google:duomo",
					displayText: "Duomo di Milano",
				},
			],
		});
		expect(details).toEqual({
			status: "success",
			value: {
				placeId: "google:duomo",
				displayText: "Duomo di Milano",
				coordinate: {
					latitude: 45.464098,
					longitude: 9.191926,
				},
			},
		});
		expect(JSON.parse(String(requests[0]?.init?.body))).toMatchObject({
			locationRestriction: {
				rectangle: MILAN_MUNICIPALITY_VIEWPORT.rectangle,
			},
		});
		expect(requests.map((request) => request.url)).toEqual([
			"https://places.googleapis.com/v1/places:autocomplete",
			"https://places.googleapis.com/v1/places/google%3Aduomo",
		]);
	});
});
