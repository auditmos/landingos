import { getDb } from "@repo/data-ops/database/setup";
import {
	type FlightInstance,
	FlightInstanceSchema,
	type FlightLookupRequest,
	FlightLookupRequestSchema,
	type FlightResolveResult,
	type ManualFlightRequest,
	ManualFlightRequestSchema,
} from "@repo/data-ops/flight";
import { Hono, type MiddlewareHandler } from "hono";
import { createDatabaseAnalyticsTracker } from "../../analytics/repository";
import {
	ANALYTICS_FUNNEL_HEADER,
	type AnalyticsTracker,
	readRequestedFunnelId,
} from "../../analytics/service";
import { createFlightService } from "../../flight/service";
import { type DiagnosticContext, resolveProviderAdapters } from "../../providers";
import { turnstileGuard } from "../middleware/turnstile";
import { validationErrorBody } from "../utils/api-errors";
import { publicDiagnostic, requestDiagnosticContext } from "../utils/diagnostics-context";
import { parseJsonBody } from "../utils/request-body";

export interface FlightHandlerOperations {
	resolve(input: FlightLookupRequest): Promise<FlightResolveResult>;
	completeManual(input: ManualFlightRequest): Promise<FlightResolveResult>;
}

export type FlightOperationsFactory = (
	env: Env,
	diagnostics: DiagnosticContext,
) => FlightHandlerOperations;
export type FlightAnalyticsFactory = (env: Env) => AnalyticsTracker;

function defaultOperations(env: Env, diagnostics: DiagnosticContext): FlightHandlerOperations {
	return createFlightService(resolveProviderAdapters(env).flight, getDb(), diagnostics);
}

function publicFlight(flight: FlightInstance): FlightInstance {
	return FlightInstanceSchema.parse({
		id: flight.id,
		marketingCarrierCode: flight.marketingCarrierCode,
		marketingCarrierName: flight.marketingCarrierName,
		marketingFlightNumber: flight.marketingFlightNumber,
		operatingCarrierCode: flight.operatingCarrierCode,
		operatingFlightNumber: flight.operatingFlightNumber,
		departureLocalDate: flight.departureLocalDate,
		originIata: flight.originIata,
		destinationIata: flight.destinationIata,
		scheduledArrivalUtc: flight.scheduledArrivalUtc,
		displayTimezone: flight.displayTimezone,
		source: flight.source,
	});
}

function publicResult(result: FlightResolveResult): FlightResolveResult {
	if (result.status === "recognized") {
		return {
			status: "recognized",
			flight: publicFlight(result.flight),
			...(result.manualArrivalConflict
				? { manualArrivalConflict: result.manualArrivalConflict }
				: {}),
		};
	}
	return {
		status: "manual_required",
		reason: result.reason,
		flightNumber: result.flightNumber,
		departureLocalDate: result.departureLocalDate,
		...publicDiagnostic(result.diagnostic),
	};
}

export function createFlightHandlers(
	operationsFactory: FlightOperationsFactory = defaultOperations,
	analyticsFactory: FlightAnalyticsFactory = createDatabaseAnalyticsTracker,
	// Turnstile guard on the public lookup entry point. `/manual` is only reachable
	// after a successful (already-challenged) `/resolve`, so it stays ungated.
	captchaGuard: MiddlewareHandler<{ Bindings: Env }> = turnstileGuard(),
) {
	const flights = new Hono<{ Bindings: Env }>();

	flights.post("/resolve", captchaGuard, async (c) => {
		const body = await parseJsonBody(c, FlightLookupRequestSchema, {});
		if (!body.ok) {
			return c.json(validationErrorBody(body.error), 400);
		}
		const tracker = analyticsFactory(c.env);
		let funnelId = await tracker.begin(readRequestedFunnelId(c.req.raw));
		const result = await operationsFactory(c.env, requestDiagnosticContext(c, "lot")).resolve(
			body.data,
		);
		if (result.status === "recognized") {
			funnelId = await tracker.track(funnelId, { eventName: "flight_recognized" });
		}
		c.header(ANALYTICS_FUNNEL_HEADER, funnelId);
		return c.json(publicResult(result));
	});

	flights.post("/manual", async (c) => {
		const body = await parseJsonBody(c, ManualFlightRequestSchema, {});
		if (!body.ok) {
			return c.json(validationErrorBody(body.error), 400);
		}
		const tracker = analyticsFactory(c.env);
		let funnelId = await tracker.begin(readRequestedFunnelId(c.req.raw));
		const result = await operationsFactory(
			c.env,
			requestDiagnosticContext(c, "lot"),
		).completeManual(body.data);
		if (result.status === "recognized") {
			funnelId = await tracker.track(funnelId, { eventName: "flight_recognized" });
		}
		c.header(ANALYTICS_FUNNEL_HEADER, funnelId);
		return c.json(publicResult(result));
	});

	return flights;
}

export default createFlightHandlers();
