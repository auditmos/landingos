import { describe, expect, it } from "vitest";
import {
	DestinationAutocompleteRequestSchema,
	DestinationSelectionRequestSchema,
} from "../packages/data-ops/src/destination/schema";
import {
	FlightLookupRequestSchema,
	ManualFlightRequestSchema,
} from "../packages/data-ops/src/flight/schema";
import { JourneyRecommendationRequestSchema } from "../packages/data-ops/src/journey/schema";

/**
 * Zod answers a **type-level** failure — a missing field, a wrong-typed one, a value
 * outside a declared bound — from its English locale unless the schema sets the
 * `error` parameter, which is separate from the per-check content messages. Those
 * strings reach every non-browser consumer verbatim (the native client,
 * `smoke:native-api`, curl), so an English default here breaks the Polish-UI
 * constraint on the API surface. #47 fixed one instance by hand; #50 fixed twelve.
 *
 * This guard exists so the thirteenth cannot be added silently: it derives the field
 * list from each schema's own shape, so a newly declared field is probed the moment
 * it appears, and fails closed rather than waiting for someone to write its pin.
 */
const ZOD_ENGLISH_DEFAULT = /^(Invalid input|Invalid option|Expected|Too (small|big))/;

/**
 * Values chosen to be hostile without knowing a field's type: whichever ones a given
 * field rejects, it must reject in Polish. Between them they reach the type check
 * (`null`, `true`, `42`, `"x"`, `[]`, `{}`) and the range checks (`""`, `±1e9`) that
 * `min`/`max` would otherwise answer with `"Too small"` / `"Too big"`.
 */
const HOSTILE_VALUES = [null, true, 42, "x", [], {}, "", -1e9, 1e9] as const;

const OMITTED = Symbol("omitted");

interface ProbeIssue {
	readonly path: readonly PropertyKey[];
	readonly message: string;
}

interface ProbeableSchema {
	safeParse(value: unknown):
		| { success: true }
		| {
				success: false;
				error: {
					readonly issues: readonly ProbeIssue[];
					flatten(): { fieldErrors: Record<string, string[] | undefined> };
				};
		  };
}

/**
 * Each entry is a request schema that reaches the wire, paired with a body it
 * accepts. The valid body doubles as the field inventory — every key, nested keys
 * included, becomes a probe target.
 */
const REQUEST_SCHEMAS: readonly (readonly [string, ProbeableSchema, Record<string, unknown>])[] = [
	[
		"POST /flights/resolve",
		FlightLookupRequestSchema,
		{ flightNumber: "FR1234", departureLocalDate: "2026-09-14" },
	],
	[
		"POST /flights/manual",
		ManualFlightRequestSchema,
		{
			flightNumber: "FR1234",
			departureLocalDate: "2026-09-14",
			destinationIata: "BGY",
			scheduledArrivalUtc: "2026-09-14T08:20:00.000Z",
		},
	],
	[
		"POST /destinations/autocomplete",
		DestinationAutocompleteRequestSchema,
		{ query: "Duomo", sessionToken: "planner-session-123456" },
	],
	[
		"POST /destinations/select",
		DestinationSelectionRequestSchema,
		{ placeId: "fixture:place:duomo", sessionToken: "planner-session-123456" },
	],
	[
		"POST /journeys/recommend",
		JourneyRecommendationRequestSchema,
		{
			flightInstanceId: "flight-1",
			scheduledArrivalUtc: "2026-09-14T08:20:00.000Z",
			privateDestinationCoordinates: { latitude: 45.464098, longitude: 9.191926 },
			bufferMinutes: 45,
		},
	],
];

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Every field path in an accepted body, depth-first, nested objects included. */
function fieldPaths(value: unknown, prefix: readonly string[] = []): readonly string[][] {
	if (!isPlainObject(value)) return [];
	return Object.keys(value).flatMap((key) => {
		const path = [...prefix, key];
		return [path, ...fieldPaths(value[key], path)];
	});
}

/** A copy of `body` with one field replaced by `value`, or deleted when `OMITTED`. */
function withField(
	body: Record<string, unknown>,
	path: readonly string[],
	value: unknown,
): Record<string, unknown> {
	const head = path[0];
	if (head === undefined) return { ...body };
	const next = { ...body };
	if (path.length === 1) {
		if (value === OMITTED) delete next[head];
		else next[head] = value;
		return next;
	}
	const child = body[head];
	next[head] = withField(isPlainObject(child) ? child : {}, path.slice(1), value);
	return next;
}

function describeValue(value: unknown): string {
	return value === OMITTED ? "<omitted>" : JSON.stringify(value);
}

interface ProbeReport {
	/** How many probes the schema rejected at all — zero means the probe proved nothing. */
	readonly rejections: number;
	/** One `field = value → message` line per issue still answering in English. */
	readonly english: readonly string[];
}

/** Replaces every field of an accepted body with each hostile value in turn. */
function probeEveryField(schema: ProbeableSchema, validBody: Record<string, unknown>): ProbeReport {
	const english: string[] = [];
	let rejections = 0;
	for (const path of fieldPaths(validBody)) {
		for (const value of [OMITTED, ...HOSTILE_VALUES]) {
			const result = schema.safeParse(withField(validBody, path, value));
			if (result.success) continue;
			rejections += 1;
			const leaked = result.error.issues.filter((issue) => ZOD_ENGLISH_DEFAULT.test(issue.message));
			english.push(
				...leaked.map((issue) => `${path.join(".")} = ${describeValue(value)} → ${issue.message}`),
			);
		}
	}
	return { rejections, english };
}

describe("Polish request copy boundary", () => {
	it.each(
		REQUEST_SCHEMAS,
	)("%s answers every rejected field in Polish, never zod's English default", (_route, schema, validBody) => {
		// A body the schema accepts is the premise: if this drifts, every probe
		// below degenerates into "the fixture is wrong" and proves nothing.
		expect(schema.safeParse(validBody).success).toBe(true);
		expect(fieldPaths(validBody).length).toBeGreaterThan(0);

		const { rejections, english } = probeEveryField(schema, validBody);
		// Without this the assertion below would pass a schema that accepted
		// everything, which is the other way this guard could go quietly useless.
		expect(rejections).toBeGreaterThan(0);
		expect(english).toEqual([]);
	});

	it("keeps a nested coordinate failure on its top-level fieldErrors key", () => {
		// `fieldErrors` is what the handlers ship and what the frontends index by, so
		// the Polish copy had to land without moving a key. Zod flattens any nested
		// path to its first segment — this pins that, since the nested messages added
		// in #50 are the only ones reachable below the top level.
		const result = JourneyRecommendationRequestSchema.safeParse({
			flightInstanceId: "flight-1",
			scheduledArrivalUtc: "2026-09-14T08:20:00.000Z",
			privateDestinationCoordinates: { latitude: "45.46", longitude: 9.191926 },
		});
		expect(result.success).toBe(false);
		if (result.success) return;
		expect(result.error.issues.map((issue) => issue.path)).toEqual([
			["privateDestinationCoordinates", "latitude"],
		]);
		expect(result.error.flatten().fieldErrors).toEqual({
			privateDestinationCoordinates: ["Nieprawidłowa szerokość geograficzna."],
		});
	});
});
