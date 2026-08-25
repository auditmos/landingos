import { describe, expect, it } from "vitest";
import { FlightResolveResultSchema } from "../packages/data-ops/dist/flight/index.js";
import { assertFixtureContracts, contract, FixtureContractError } from "./e2e-fixture-contracts.ts";
import { fixtureFlight } from "./e2e-fixture-data.ts";

describe("e2e fixture contracts", () => {
	it("passes every served response family through its data-ops schema", () => {
		expect(() => assertFixtureContracts()).not.toThrow();
	});

	it("names the drifted family when a fixture stops matching the real contract", () => {
		const drifted = fixtureFlight("FR1234") as { flight: Record<string, unknown> };
		drifted.flight.scheduledArrival = drifted.flight.scheduledArrivalUtc;
		delete drifted.flight.scheduledArrivalUtc;

		expect(() => contract("flights/resolve", FlightResolveResultSchema, drifted)).toThrow(
			FixtureContractError,
		);
		expect(() => contract("flights/resolve", FlightResolveResultSchema, drifted)).toThrow(
			/flights\/resolve/,
		);
	});

	it("returns the parsed value so a validated payload is what gets served", () => {
		const resolved = fixtureFlight("FR1234");

		expect(contract("flights/resolve", FlightResolveResultSchema, resolved)).toEqual(resolved);
	});
});
