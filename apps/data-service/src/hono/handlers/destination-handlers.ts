import {
	type DestinationAutocompleteRequest,
	DestinationAutocompleteRequestSchema,
	type DestinationAutocompleteResult,
	type DestinationSelectionRequest,
	DestinationSelectionRequestSchema,
	type DestinationSelectionResult,
} from "@repo/data-ops/destination";
import { Hono } from "hono";
import { createDestinationService } from "../../destination/service";
import { type DiagnosticContext, resolveProviderAdapters } from "../../providers";
import { publicDiagnostic, requestDiagnosticContext } from "../utils/diagnostics-context";

export interface DestinationHandlerOperations {
	autocomplete(input: DestinationAutocompleteRequest): Promise<DestinationAutocompleteResult>;
	select(input: DestinationSelectionRequest): Promise<DestinationSelectionResult>;
}

export type DestinationOperationsFactory = (
	env: Env,
	diagnostics: DiagnosticContext,
) => DestinationHandlerOperations;

function defaultOperations(env: Env, diagnostics: DiagnosticContext): DestinationHandlerOperations {
	return createDestinationService(resolveProviderAdapters(env).places, diagnostics);
}

function publicAutocompleteResult(
	result: DestinationAutocompleteResult,
): DestinationAutocompleteResult {
	if (result.status === "autocomplete_unavailable") {
		return { status: result.status, reason: result.reason, ...publicDiagnostic(result.diagnostic) };
	}
	return {
		status: "suggestions",
		predictions: result.predictions.map((prediction) => ({
			placeId: prediction.placeId,
			primaryText: prediction.primaryText,
			secondaryText: prediction.secondaryText,
		})),
	};
}

function publicSelectionResult(result: DestinationSelectionResult): DestinationSelectionResult {
	if (result.status === "destination_not_supported") {
		return {
			status: result.status,
			supportedAreaVersion: result.supportedAreaVersion,
		};
	}
	if (result.status === "destination_unavailable") {
		return { status: result.status, reason: result.reason, ...publicDiagnostic(result.diagnostic) };
	}
	return {
		status: "destination_selected",
		destination: {
			placeId: result.destination.placeId,
			displayName: result.destination.displayName,
			coordinates: {
				latitude: result.destination.coordinates.latitude,
				longitude: result.destination.coordinates.longitude,
			},
			supportedAreaVersion: result.destination.supportedAreaVersion,
		},
	};
}

function validationResponse(error: {
	flatten(): { fieldErrors: Record<string, string[] | undefined> };
}) {
	return {
		status: "validation_error" as const,
		fieldErrors: error.flatten().fieldErrors,
	};
}

export function createDestinationHandlers(
	operationsFactory: DestinationOperationsFactory = defaultOperations,
) {
	const destinations = new Hono<{ Bindings: Env }>();

	destinations.post("/autocomplete", async (c) => {
		const body = await c.req.json().catch(() => ({}));
		const parsed = DestinationAutocompleteRequestSchema.safeParse(body);
		if (!parsed.success) {
			return c.json(validationResponse(parsed.error), 400);
		}
		const operations = operationsFactory(c.env, requestDiagnosticContext(c, "miejsce"));
		return c.json(publicAutocompleteResult(await operations.autocomplete(parsed.data)));
	});

	destinations.post("/select", async (c) => {
		const body = await c.req.json().catch(() => ({}));
		const parsed = DestinationSelectionRequestSchema.safeParse(body);
		if (!parsed.success) {
			return c.json(validationResponse(parsed.error), 400);
		}
		const operations = operationsFactory(c.env, requestDiagnosticContext(c, "miejsce"));
		return c.json(publicSelectionResult(await operations.select(parsed.data)));
	});

	return destinations;
}

export default createDestinationHandlers();
