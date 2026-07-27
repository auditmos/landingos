export const FIXTURE_PROVENANCE = "synthetic_recorded_for_testing" as const;

export interface FixtureScenario<TInput, TResult> {
	scenarioId: string;
	provenance: typeof FIXTURE_PROVENANCE;
	input: TInput;
	result: TResult;
}
