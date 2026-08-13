import { type ChildProcess, spawn } from "node:child_process";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { runRealAuthOtpRegression } from "./e2e-auth-regression.ts";
import { startFixtureServer } from "./e2e-fixture-server.ts";
import { type BrowserViewport, runViewportScenarios } from "./e2e-scenarios.ts";

const ROOT = resolve(import.meta.dirname, "..");
const USER_APP = resolve(ROOT, "apps/user-application");
const TOUCH_INIT = resolve(ROOT, "scripts/e2e-touch-init.js");
const FIXTURE_ORIGIN = "http://127.0.0.1:8789";
const BASE_URL = "http://127.0.0.1:4173";
const REALTIME_BOUND_MS = 5_000;
const VIEWPORTS: BrowserViewport[] = [
	{ name: "mobile", width: 390, height: 844, mobile: true },
	{ name: "desktop", width: 1440, height: 900, mobile: false },
];

async function waitForUrl(url: string, child?: ChildProcess) {
	for (let attempt = 0; attempt < 120; attempt += 1) {
		if (child?.exitCode !== null) throw new Error(`Vite exited with code ${child.exitCode}`);
		try {
			const response = await fetch(url);
			if (response.ok) return;
		} catch {
			// The isolated service is still starting.
		}
		await delay(100);
	}
	throw new Error(`Timed out waiting for ${url}`);
}

async function stopChild(child: ChildProcess) {
	if (child.exitCode !== null) return;
	const signalTree = (signal: NodeJS.Signals) => {
		try {
			if (child.pid) process.kill(-child.pid, signal);
			else child.kill(signal);
		} catch {
			child.kill(signal);
		}
	};
	signalTree("SIGTERM");
	await Promise.race([
		new Promise<void>((resolveExit) => child.once("exit", () => resolveExit())),
		delay(3_000).then(() => {
			if (child.exitCode === null) signalTree("SIGKILL");
		}),
	]);
}

function startVite(useRealAuthClient: boolean) {
	const output: string[] = [];
	const child = spawn("pnpm", ["run", "e2e:serve"], {
		cwd: USER_APP,
		detached: true,
		env: {
			...process.env,
			CLOUDFLARE_ENV: "development",
			VITE_DATA_SERVICE_URL: FIXTURE_ORIGIN,
			...(useRealAuthClient ? { LANDINGOS_E2E_REAL_AUTH: "true" } : {}),
		},
		stdio: ["ignore", "pipe", "pipe"],
	});
	for (const stream of [child.stdout, child.stderr]) {
		stream?.on("data", (chunk) => {
			output.push(String(chunk));
			if (output.length > 20) output.shift();
		});
	}
	return { child, output };
}

async function main() {
	const fixture = await startFixtureServer(8789);
	let activeVite: ChildProcess | undefined;
	let viteOutput: string[] = [];
	const heartbeat = setInterval(
		() => process.stdout.write("E2E heartbeat: agent-browser suite is still running.\n"),
		60_000,
	);
	try {
		const realAuthVite = startVite(true);
		activeVite = realAuthVite.child;
		viteOutput = realAuthVite.output;
		await waitForUrl(`${BASE_URL}/`, activeVite);
		for (const viewport of VIEWPORTS) {
			await fetch(`${FIXTURE_ORIGIN}/test-control/reset`, { method: "POST" });
			process.stdout.write(
				`Running real Better Auth OTP regression at ${viewport.width}x${viewport.height} (${viewport.name}).\n`,
			);
			await runRealAuthOtpRegression({
				baseUrl: BASE_URL,
				fixtureOrigin: FIXTURE_ORIGIN,
				namespace: `landingos-real-auth-e2e-${process.pid}`,
				initScript: TOUCH_INIT,
				viewport,
			});
		}
		await stopChild(activeVite);
		activeVite = undefined;
		if (process.env.LANDINGOS_E2E_AUTH_ONLY === "true") {
			process.stdout.write("Real Better Auth OTP regression passed at both viewports.\n");
			return;
		}

		const fixtureVite = startVite(false);
		activeVite = fixtureVite.child;
		viteOutput = fixtureVite.output;
		await waitForUrl(`${BASE_URL}/`, activeVite);
		for (const viewport of VIEWPORTS) {
			await fetch(`${FIXTURE_ORIGIN}/test-control/reset`, { method: "POST" });
			process.stdout.write(
				`Running agent-browser scenarios at ${viewport.width}x${viewport.height} (${viewport.name}).\n`,
			);
			await runViewportScenarios({
				baseUrl: BASE_URL,
				fixtureOrigin: FIXTURE_ORIGIN,
				namespace: `landingos-e2e-${process.pid}`,
				initScript: TOUCH_INIT,
				viewport,
			});
			const messageCount = Number(
				(
					fixture.store.db.prepare("SELECT COUNT(*) AS count FROM messages").get() as {
						count: number;
					}
				).count,
			);
			if (messageCount !== 2) {
				throw new Error(`Expected two room messages, found ${messageCount}`);
			}
			const reportCount = Number(
				(
					fixture.store.db.prepare("SELECT COUNT(*) AS count FROM reports").get() as {
						count: number;
					}
				).count,
			);
			if (reportCount !== 1) throw new Error(`Expected one safety report, found ${reportCount}`);
		}
		process.stdout.write(
			`Agent-browser E2E passed at both viewports; real-time bound ${REALTIME_BOUND_MS} ms.\n`,
		);
	} catch (error) {
		if (viteOutput.length > 0) process.stderr.write(viteOutput.join(""));
		throw error;
	} finally {
		clearInterval(heartbeat);
		if (activeVite) await stopChild(activeVite);
		await fixture.close();
	}
}

void main().catch((error: unknown) => {
	process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
	process.exitCode = 1;
});
