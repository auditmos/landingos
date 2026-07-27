import type { FlightResolveResult } from "@repo/data-ops/flight";
import { describe, expect, it, vi } from "vitest";
import { createFlightHandlers, type FlightHandlerOperations } from "./flight-handlers";

const recognized: Extract<FlightResolveResult, { status: "recognized" }> = {
	status: "recognized",
	flight: {
		id: "f0c77147-2942-574c-8f2c-9dc44cb46049",
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

function operations(overrides: Partial<FlightHandlerOperations> = {}): FlightHandlerOperations {
	return {
		resolve: vi.fn(async () => recognized),
		completeManual: vi.fn(async () => ({
			...recognized,
			flight: { ...recognized.flight, source: "manual" as const },
		})),
		...overrides,
	};
}

function post(path: string, body: unknown) {
	return new Request(`http://localhost${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(body),
	});
}

describe("anonymous flight routes", () => {
	it.each([
		[{ flightNumber: "", departureLocalDate: "2026-09-14" }, "flightNumber"],
		[{ flightNumber: "FR12345", departureLocalDate: "2026-09-14" }, "flightNumber"],
		[{ flightNumber: "FR1234", departureLocalDate: "" }, "departureLocalDate"],
	] as const)("returns Polish field errors and makes zero resolver/provider calls", async (body, field) => {
		const service = operations();
		const app = createFlightHandlers(() => service);
		const response = await app.fetch(post("/resolve", body), {} as Env);
		expect(response.status).toBe(400);
		expect(service.resolve).not.toHaveBeenCalled();
		const payload = (await response.json()) as {
			status: string;
			fieldErrors: Record<string, string[]>;
		};
		expect(payload.status).toBe("validation_error");
		expect(payload.fieldErrors[field]?.[0]).toMatch(/^Podaj /);
	});

	it("returns a recognized flight to a request with no auth or session", async () => {
		const service = operations();
		const app = createFlightHandlers(() => service);
		const response = await app.fetch(
			post("/resolve", {
				flightNumber: " fr1234 ",
				departureLocalDate: "2026-09-14",
			}),
			{} as Env,
		);
		expect(response.status).toBe(200);
		expect(service.resolve).toHaveBeenCalledWith({
			flightNumber: "FR1234",
			departureLocalDate: "2026-09-14",
		});
		expect(await response.json()).toEqual(recognized);
	});

	it("returns only the public schema and never provider credentials or payload", async () => {
		const leaked = {
			...recognized,
			providerPayload: { access_key: "server-secret", raw: "provider-response" },
		} as unknown as FlightResolveResult;
		const app = createFlightHandlers(() => operations({ resolve: vi.fn(async () => leaked) }));
		const response = await app.fetch(
			post("/resolve", {
				flightNumber: "FR1234",
				departureLocalDate: "2026-09-14",
			}),
			{} as Env,
		);
		const text = await response.text();
		expect(response.status).toBe(200);
		expect(text).not.toContain("server-secret");
		expect(text).not.toContain("provider-response");
		expect(JSON.parse(text)).toEqual(recognized);
	});

	it("completes a manual BGY arrival without auth and returns planner-ready state", async () => {
		const service = operations();
		const app = createFlightHandlers(() => service);
		const response = await app.fetch(
			post("/manual", {
				flightNumber: "FR1234",
				departureLocalDate: "2026-09-14",
				destinationIata: "BGY",
				scheduledArrivalUtc: "2026-09-14T08:20:00.000Z",
			}),
			{} as Env,
		);
		expect(response.status).toBe(200);
		expect(service.completeManual).toHaveBeenCalledOnce();
		expect(await response.json()).toMatchObject({
			status: "recognized",
			flight: { source: "manual", destinationIata: "BGY" },
		});
	});
});
