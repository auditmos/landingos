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
import {
	createFixtureProviderAdapters,
	createLiveProviderAdapters,
	MILAN_MUNICIPALITY_VIEWPORT,
	type PlacesProvider,
	resolveProviderConfig,
} from "../../providers";

export interface DestinationHandlerOperations {
	autocomplete(input: DestinationAutocompleteRequest): Promise<DestinationAutocompleteResult>;
	select(input: DestinationSelectionRequest): Promise<DestinationSelectionResult>;
}

export type DestinationOperationsFactory = (env: Env) => DestinationHandlerOperations;

function unavailableProvider(): PlacesProvider {
	return {
		viewport: MILAN_MUNICIPALITY_VIEWPORT,
		autocomplete: async () => ({
			status: "provider_error",
			httpStatus: 503,
			retryable: true,
		}),
		details: async () => ({
			status: "provider_error",
			httpStatus: 503,
			retryable: true,
		}),
	};
}

function defaultOperations(env: Env): DestinationHandlerOperations {
	const config = resolveProviderConfig(env as unknown as Record<string, string | undefined>);
	let provider = unavailableProvider();
	if (config.ok && config.config.mode === "fixture") {
		provider = createFixtureProviderAdapters().places;
	} else if (config.ok && config.config.mode === "live") {
		provider = createLiveProviderAdapters(config.config.credentials, (input, init) =>
			fetch(input, init),
		).places;
	}
	return createDestinationService(provider);
}

function publicAutocompleteResult(
	result: DestinationAutocompleteResult,
): DestinationAutocompleteResult {
	if (result.status === "autocomplete_unavailable") {
		return { status: result.status, reason: result.reason };
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
		return { status: result.status, reason: result.reason };
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
		return c.json(
			publicAutocompleteResult(await operationsFactory(c.env).autocomplete(parsed.data)),
		);
	});

	destinations.post("/select", async (c) => {
		const body = await c.req.json().catch(() => ({}));
		const parsed = DestinationSelectionRequestSchema.safeParse(body);
		if (!parsed.success) {
			return c.json(validationResponse(parsed.error), 400);
		}
		return c.json(publicSelectionResult(await operationsFactory(c.env).select(parsed.data)));
	});

	return destinations;
}

export default createDestinationHandlers();
