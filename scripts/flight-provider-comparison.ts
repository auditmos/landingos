import { executeFlightProviderComparison } from "./flight-provider-comparison-command";

async function main(): Promise<void> {
	const result = await executeFlightProviderComparison({
		env: process.env,
		fetchImpl: (url, init) => fetch(url, init),
		generatedAt: new Date().toISOString(),
		nowMs: () => performance.now(),
		onProgress: (message) => console.error(message),
	});
	console.log(JSON.stringify(result.payload));
	process.exitCode = result.exitCode;
}

main().catch(() => {
	console.log(JSON.stringify({ status: "internal_error" }));
	process.exitCode = 1;
});
