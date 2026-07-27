import { executeProviderSpike, type SpikeMode } from "./provider-spike-command";

async function runFixtureMode(): Promise<void> {
	console.error("[s0] fixture contracts: flight, places, transit, catalog");
	const result = await executeProviderSpike({
		mode: "fixture",
		env: process.env,
		fetchImpl: (url, init) => fetch(url, init),
		nowMs: () => performance.now(),
		generatedAt: new Date().toISOString(),
		onProgress: (message) => console.error(message),
	});
	const summary = result.payload as {
		scenarioResults?: unknown[];
	};
	console.error(`[s0] fixture scenarios: ${summary.scenarioResults?.length ?? 0} complete`);
	console.log(JSON.stringify(result.payload));
	process.exitCode = result.exitCode;
}

async function runLiveMode(): Promise<void> {
	const result = await executeProviderSpike({
		mode: "live",
		env: process.env,
		fetchImpl: (url, init) => fetch(url, init),
		nowMs: () => performance.now(),
		generatedAt: new Date().toISOString(),
		onProgress: (message) => console.error(message),
	});
	console.log(JSON.stringify(result.payload));
	process.exitCode = result.exitCode;
}

async function main(): Promise<void> {
	const mode = process.argv[2] as SpikeMode | undefined;
	if (mode === "fixture") {
		await runFixtureMode();
		return;
	}
	if (mode === "live") {
		await runLiveMode();
		return;
	}
	console.log(JSON.stringify({ status: "invalid_spike_mode" }));
	process.exitCode = 1;
}

main().catch(() => {
	console.log(JSON.stringify({ status: "internal_error" }));
	process.exitCode = 1;
});
