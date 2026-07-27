import { describe, expect, it } from "vitest";
import {
	DestinationAutocompleteRequestSchema,
	DestinationAutocompleteResultSchema,
	DestinationSelectionResultSchema,
} from "./schema";

describe("private destination schemas", () => {
	it("requires three trimmed query characters and a provider session token", () => {
		expect(
			DestinationAutocompleteRequestSchema.safeParse({
				query: "  ab  ",
				sessionToken: "planner-session-123456",
			}).success,
		).toBe(false);
		expect(
			DestinationAutocompleteRequestSchema.parse({
				query: "  dom  ",
				sessionToken: "planner-session-123456",
			}),
		).toEqual({
			query: "dom",
			sessionToken: "planner-session-123456",
		});
	});

	it("rejects raw provider payloads at both private response boundaries", () => {
		expect(() =>
			DestinationAutocompleteResultSchema.parse({
				status: "suggestions",
				predictions: [
					{
						placeId: "fixture:place:duomo",
						primaryText: "Duomo di Milano",
						secondaryText: "Piazza del Duomo, Milano",
						rawProviderPayload: { secret: true },
					},
				],
			}),
		).toThrow();
		expect(() =>
			DestinationSelectionResultSchema.parse({
				status: "destination_selected",
				destination: {
					placeId: "fixture:place:duomo",
					displayName: "Duomo di Milano",
					coordinates: { latitude: 45.464098, longitude: 9.191926 },
					supportedAreaVersion: "milan-municipality-v1",
					providerResponse: "must-not-cross",
				},
			}),
		).toThrow();
	});
});
