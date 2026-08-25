import { describe, expect, it, vi } from "vitest";
import { createFixtureProviderAdapters } from "./fixture-adapters";
import type { ProviderFetch } from "./live-http";
import { MILAN_MUNICIPALITY_VIEWPORT } from "./milan-viewport";
import { createUnavailableProviderAdapters, resolveProviderAdapters } from "./resolve-adapters";
import type { ProviderAdapters } from "./types";

const LIVE_ENV = {
	CLOUDFLARE_ENV: "staging",
	LANDINGOS_PROVIDER_MODE: "live",
	LANDINGOS_FLIGHT_PROVIDER: "aviationstack",
	LANDINGOS_PLACES_PROVIDER: "google_places_new",
	LANDINGOS_TRANSIT_PROVIDER: "google_routes_transit",
	AVIATIONSTACK_ACCESS_KEY: "test-flight-key",
	GOOGLE_MAPS_API_KEY: "test-google-key",
} as const;

function probes(adapters: ProviderAdapters) {
	return [
		adapters.flight.lookup({ flightNumber: "FR1234", date: "2026-09-14" }),
		adapters.places.autocomplete({ query: "duomo" }),
		adapters.places.details({ placeId: "fixture:place:duomo" }),
		adapters.transit.route({
			origin: { latitude: 45.673889, longitude: 9.703889 },
			destination: { latitude: 45.464098, longitude: 9.191926 },
			departureTime: "2026-09-14T08:50:00.000Z",
		}),
		adapters.transferCatalog.list(),
	];
}

describe("provider adapter resolution", () => {
	it("selects fixture adapters when no mode is configured locally", async () => {
		const fetchImpl = vi.fn<ProviderFetch>(async () => Response.json({}));
		const adapters = resolveProviderAdapters({}, fetchImpl);

		expect(adapters.mode).toBe("fixture");
		expect(await adapters.flight.lookup({ flightNumber: "FR1234", date: "2026-09-14" })).toEqual(
			await createFixtureProviderAdapters().flight.lookup({
				flightNumber: "FR1234",
				date: "2026-09-14",
			}),
		);
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("selects live adapters only for a fully configured live environment", async () => {
		const fetchImpl = vi.fn<ProviderFetch>(async () => Response.json({ data: [] }));
		const adapters = resolveProviderAdapters(LIVE_ENV, fetchImpl);

		expect(adapters.mode).toBe("live");
		await adapters.flight.lookup({ flightNumber: "FR1234", date: "2026-09-14" });
		expect(fetchImpl).toHaveBeenCalledOnce();
		expect(fetchImpl.mock.calls[0]?.[0]).toContain("api.aviationstack.com");
	});

	it("never falls back to live: staging without an explicit mode degrades every contract", async () => {
		const fetchImpl = vi.fn<ProviderFetch>(async () => Response.json({}));
		const adapters = resolveProviderAdapters({ CLOUDFLARE_ENV: "staging" }, fetchImpl);

		expect(adapters.mode).toBe("unavailable");
		for (const result of await Promise.all(probes(adapters))) {
			expect(result).toEqual({ status: "provider_error", httpStatus: 503, retryable: true });
		}
		expect(fetchImpl).not.toHaveBeenCalled();
	});

	it("degrades every contract when a deployed environment asks for fixtures", async () => {
		const adapters = resolveProviderAdapters({
			CLOUDFLARE_ENV: "production",
			LANDINGOS_PROVIDER_MODE: "fixture",
		});

		expect(adapters.mode).toBe("unavailable");
		for (const result of await Promise.all(probes(adapters))) {
			expect(result).toEqual({ status: "provider_error", httpStatus: 503, retryable: true });
		}
	});

	it("keeps advertising the Milan viewport while places is unavailable", () => {
		expect(createUnavailableProviderAdapters().places.viewport).toBe(MILAN_MUNICIPALITY_VIEWPORT);
		expect(resolveProviderAdapters({ CLOUDFLARE_ENV: "staging" }).places.viewport).toBe(
			MILAN_MUNICIPALITY_VIEWPORT,
		);
	});
});
