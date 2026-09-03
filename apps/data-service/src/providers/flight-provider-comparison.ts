import { createLiveFlightProvider } from "./live-flight";
import { createAerodataboxFlightProvider } from "./live-flight-aerodatabox";
import { LIVE_FLIGHT_SAMPLE_V1, type ScheduledFlightSampleCase } from "./live-flight-sample";
import type { ProviderFetch } from "./live-http";
import type { FlightProvider, ProviderFlight, ProviderResult } from "./types";

const AVIATIONSTACK_INTERVAL_MS = 60_000;
const WAIT_HEARTBEAT_MS = 30_000;
const AERODATABOX_UNITS_PER_FLIGHT_LOOKUP = 2;

type ComparedProvider = "aviationstack" | "aerodatabox";

interface ComparisonCredentials {
	aviationstackAccessKey: string;
	aerodataboxRapidApiKey: string;
}

interface FlightProviderComparisonOptions {
	credentials: ComparisonCredentials;
	fetchImpl: ProviderFetch;
	generatedAt: string;
	nowMs: () => number;
	onProgress: (message: string) => void;
	sleep?: (milliseconds: number) => Promise<void>;
}

interface ComparedResult {
	status: ProviderResult<ProviderFlight>["status"];
	latencyMs: number;
	matchesExpected: boolean;
	normalizedOutcome:
		| { status: Exclude<ProviderResult<ProviderFlight>["status"], "success"> }
		| {
				status: "success";
				originIata: string;
				destinationIata: string;
				scheduledArrival: string;
				timeZone: string;
		  };
}

interface ProviderScore {
	total: number;
	correct: number;
	requiredCorrect: number;
	status: "passing" | "failing";
	requests: number;
}

export interface FlightProviderComparisonEvidence {
	schemaVersion: "landingos-flight-provider-comparison-v1";
	generatedAt: string;
	dataset: {
		schemaVersion: typeof LIVE_FLIGHT_SAMPLE_V1.schemaVersion;
		total: number;
		caseIds: string[];
	};
	providers: {
		aviationstack: ProviderScore;
		aerodatabox: ProviderScore & { apiUnits: number };
	};
	cases: Array<{
		caseId: string;
		input: ScheduledFlightSampleCase["input"];
		reference: ScheduledFlightSampleCase["expected"];
		source: ScheduledFlightSampleCase["source"];
		results: Record<ComparedProvider, ComparedResult>;
	}>;
	productionReadiness: {
		ready: false;
		blockers: string[];
	};
}

function defaultSleep(milliseconds: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function normalize(result: ProviderResult<ProviderFlight>): ComparedResult["normalizedOutcome"] {
	if (result.status !== "success") return { status: result.status };
	return {
		status: "success",
		originIata: result.value.origin.iata,
		destinationIata: result.value.destination.iata,
		scheduledArrival: result.value.scheduledArrival,
		timeZone: result.value.timeZone,
	};
}

function matchesReference(
	result: ProviderResult<ProviderFlight>,
	reference: ScheduledFlightSampleCase["expected"],
): boolean {
	return (
		result.status === "success" &&
		result.value.origin.iata === reference.originIata &&
		result.value.destination.iata === reference.destinationIata &&
		result.value.timeZone === reference.timeZone &&
		Date.parse(result.value.scheduledArrival) === Date.parse(reference.scheduledArrival)
	);
}

async function measure(
	provider: FlightProvider,
	scenario: ScheduledFlightSampleCase,
	nowMs: () => number,
): Promise<ComparedResult> {
	const startedAt = nowMs();
	const result = await provider.lookup(scenario.input);
	return {
		status: result.status,
		latencyMs: Math.max(0, nowMs() - startedAt),
		matchesExpected: matchesReference(result, scenario.expected),
		normalizedOutcome: normalize(result),
	};
}

function score(results: ComparedResult[]): ProviderScore {
	const total = results.length;
	const correct = results.filter((result) => result.matchesExpected).length;
	const requiredCorrect = Math.ceil(total * 0.9);
	return {
		total,
		correct,
		requiredCorrect,
		status: correct >= requiredCorrect ? "passing" : "failing",
		requests: total,
	};
}

async function waitBetweenAviationstackCalls(
	caseNumber: number,
	total: number,
	options: FlightProviderComparisonOptions,
): Promise<void> {
	for (let waitedMs = 0; waitedMs < AVIATIONSTACK_INTERVAL_MS; waitedMs += WAIT_HEARTBEAT_MS) {
		const elapsed = waitedMs + WAIT_HEARTBEAT_MS;
		options.onProgress(
			`[flight-compare] wait ${caseNumber}/${total} ${elapsed / 1_000}/${AVIATIONSTACK_INTERVAL_MS / 1_000}s`,
		);
		await (options.sleep ?? defaultSleep)(WAIT_HEARTBEAT_MS);
	}
}

export async function runFlightProviderComparison(
	options: FlightProviderComparisonOptions,
): Promise<FlightProviderComparisonEvidence> {
	const today = options.generatedAt.slice(0, 10);
	const providers = {
		aviationstack: createLiveFlightProvider(
			{ aviationstackAccessKey: options.credentials.aviationstackAccessKey },
			options.fetchImpl,
			{ today: () => today },
		),
		aerodatabox: createAerodataboxFlightProvider(
			{ aerodataboxRapidApiKey: options.credentials.aerodataboxRapidApiKey },
			options.fetchImpl,
		),
	};
	const cases: FlightProviderComparisonEvidence["cases"] = [];
	const flightCases = LIVE_FLIGHT_SAMPLE_V1.cases;

	for (const [index, scenario] of flightCases.entries()) {
		if (index > 0) await waitBetweenAviationstackCalls(index + 1, flightCases.length, options);
		const aviationstack = await measure(providers.aviationstack, scenario, options.nowMs);
		options.onProgress(
			`[flight-compare] ${index + 1}/${flightCases.length} aviationstack ${scenario.caseId} ${aviationstack.status}`,
		);
		const aerodatabox = await measure(providers.aerodatabox, scenario, options.nowMs);
		options.onProgress(
			`[flight-compare] ${index + 1}/${flightCases.length} aerodatabox ${scenario.caseId} ${aerodatabox.status}`,
		);
		cases.push({
			caseId: scenario.caseId,
			input: scenario.input,
			reference: scenario.expected,
			source: scenario.source,
			results: { aviationstack, aerodatabox },
		});
	}

	const aviationstack = score(cases.map((item) => item.results.aviationstack));
	const aerodataboxScore = score(cases.map((item) => item.results.aerodatabox));
	const blockers = [
		...(aerodataboxScore.status === "failing" ? ["aerodatabox_recognition_below_9_of_10"] : []),
		"commercial_licensing_acceptance_missing",
		"privacy_compliance_approval_missing",
	];

	return {
		schemaVersion: "landingos-flight-provider-comparison-v1",
		generatedAt: options.generatedAt,
		dataset: {
			schemaVersion: LIVE_FLIGHT_SAMPLE_V1.schemaVersion,
			total: flightCases.length,
			caseIds: flightCases.map((item) => item.caseId),
		},
		providers: {
			aviationstack,
			aerodatabox: {
				...aerodataboxScore,
				apiUnits: aerodataboxScore.requests * AERODATABOX_UNITS_PER_FLIGHT_LOOKUP,
			},
		},
		cases,
		productionReadiness: { ready: false, blockers },
	};
}
