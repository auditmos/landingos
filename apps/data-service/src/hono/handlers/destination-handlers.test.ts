import type {
	DestinationAutocompleteResult,
	DestinationSelectionResult,
} from "@repo/data-ops/destination";
import {
	createDestinationHandlers,
	type DestinationHandlerOperations,
} from "./destination-handlers";

const suggestions: DestinationAutocompleteResult = {
	status: "suggestions",
	predictions: [
		{
			placeId: "fixture:place:duomo",
			primaryText: "Duomo di Milano",
			secondaryText: "Piazza del Duomo, Milano",
		},
	],
};

const selected: DestinationSelectionResult = {
	status: "destination_selected",
	destination: {
		placeId: "fixture:place:duomo",
		displayName: "Duomo di Milano",
		coordinates: { latitude: 45.464098, longitude: 9.191926 },
		supportedAreaVersion: "milan-municipality-v1",
	},
};

function operations(
	overrides: Partial<DestinationHandlerOperations> = {},
): DestinationHandlerOperations {
	return {
		autocomplete: vi.fn(async () => suggestions),
		select: vi.fn(async () => selected),
		...overrides,
	};
}

const NO_QUERY = ["Wpisz co najmniej 3 znaki."];
const NO_SESSION_TOKEN = ["Brakuje sesji wyszukiwania miejsca."];
const NO_PLACE_ID = ["Wybierz miejsce z listy."];

function raw(path: string, body: string) {
	return new Request(`http://localhost${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body,
	});
}

function post(path: string, body: unknown) {
	return new Request(`http://localhost${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("anonymous private destination routes", () => {
	it.each([
		["/autocomplete", { query: NO_QUERY, sessionToken: NO_SESSION_TOKEN }],
		["/select", { placeId: NO_PLACE_ID, sessionToken: NO_SESSION_TOKEN }],
	] as const)("reports every required field of %s when the body will not parse", async (path, fieldErrors) => {
		// An unparsable body reads as `{}` here so the caller sees each missing field
		// rather than one opaque form error — the fallback this family depends on.
		for (const body of ["{", ""]) {
			const service = operations();
			const app = createDestinationHandlers(() => service);
			const response = await app.fetch(raw(path, body), {} as Env);
			expect(response.status).toBe(400);
			expect(await response.json()).toEqual({ status: "validation_error", fieldErrors });
			expect(service.autocomplete).not.toHaveBeenCalled();
			expect(service.select).not.toHaveBeenCalled();
		}
	});

	it("returns a Polish field error and makes zero service/provider calls below three characters", async () => {
		const service = operations();
		const app = createDestinationHandlers(() => service);
		const response = await app.fetch(
			post("/autocomplete", {
				query: " ab ",
				sessionToken: "planner-session-123456",
			}),
			{} as Env,
		);
		expect(response.status).toBe(400);
		expect(service.autocomplete).not.toHaveBeenCalled();
		expect(await response.json()).toMatchObject({
			status: "validation_error",
			fieldErrors: { query: ["Wpisz co najmniej 3 znaki."] },
		});
	});

	it("works without auth and returns distinct prediction text only", async () => {
		const service = operations();
		const app = createDestinationHandlers(() => service);
		const response = await app.fetch(
			post("/autocomplete", {
				query: "  Duomo ",
				sessionToken: "planner-session-123456",
			}),
			{} as Env,
		);
		expect(response.status).toBe(200);
		expect(service.autocomplete).toHaveBeenCalledWith({
			query: "Duomo",
			sessionToken: "planner-session-123456",
		});
		expect(await response.json()).toEqual(suggestions);
	});

	it("whitelists the private planner response and strips raw provider payload", async () => {
		const leaked = {
			...selected,
			destination: {
				...selected.destination,
				rawProviderPayload: { apiKey: "server-secret", raw: "private-provider-response" },
			},
		} as DestinationSelectionResult;
		const app = createDestinationHandlers(() => operations({ select: vi.fn(async () => leaked) }));
		const response = await app.fetch(
			post("/select", {
				placeId: "fixture:place:duomo",
				sessionToken: "planner-session-123456",
			}),
			{} as Env,
		);
		const text = await response.text();
		expect(response.status).toBe(200);
		expect(text).not.toContain("server-secret");
		expect(text).not.toContain("private-provider-response");
		expect(JSON.parse(text)).toEqual(selected);
	});
});
