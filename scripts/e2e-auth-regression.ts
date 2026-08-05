import { AgentBrowser } from "./e2e-agent.ts";
import type { BrowserViewport } from "./e2e-scenarios.ts";

type AuthRegressionContext = {
	baseUrl: string;
	fixtureOrigin: string;
	initScript: string;
	namespace: string;
	viewport: BrowserViewport;
};

export async function runRealAuthOtpRegression(context: AuthRegressionContext) {
	const agent = new AgentBrowser({
		namespace: context.namespace,
		session: `real-auth-${context.viewport.name}`,
		initScript: context.initScript,
	});
	const email = `real-auth-${context.viewport.name}@example.test`;

	try {
		await agent.open(context.baseUrl);
		await agent.viewport(context.viewport.width, context.viewport.height);
		await agent.waitForText("Zacznij od lotu");
		await agent.fill("#flight-number", "FR1234");
		await agent.fill("#departure-date", "2026-09-14");
		await agent.clickText("Sprawdź lot");
		await agent.waitForText("Lot rozpoznany");
		await agent.fill("#destination-query", "Duomo");
		await agent.waitForText("Duomo di Milano");
		await agent.clickContaining("Duomo di Milano");
		await agent.waitForText("Airport Bus Express");
		await agent.clickText("Jadę tym wariantem — do pokoju");
		await agent.waitForText("Zaloguj się kodem");

		await agent.eval(`(() => {
			const raw = sessionStorage.getItem("landingos.room-intent");
			if (!raw) throw new Error("Room intent was lost before authentication");
			const parsed = JSON.parse(raw);
			if (Object.keys(parsed).some((key) => !["flightInstanceId", "selection", "publicOption"].includes(key))) {
				throw new Error("Room intent contains unexpected fields: " + Object.keys(parsed).join(","));
			}
			if (/destination|address|placeId|coordinates|latitude|longitude|email/i.test(raw)) {
				throw new Error("Private planner data leaked into room intent");
			}
		})()`);
		await agent.fill("#auth-email", email);
		await agent.clickText("Wyślij kod");
		await agent.waitForText("Kod ma 6 cyfr");
		await agent.eval(`(async () => {
			const otpInput = document.querySelector("#auth-otp");
			if (!(otpInput instanceof HTMLInputElement)) throw new Error("OTP input was not mounted");
			document.dispatchEvent(new Event("visibilitychange"));
			await new Promise((resolve) => setTimeout(resolve, 500));
			if (!otpInput.isConnected || document.querySelector("#auth-otp") !== otpInput) {
				throw new Error("Returning to the active tab remounted the OTP form");
			}
		})()`);
		await agent.fill("#auth-otp", "111111");
		await agent.clickText("Zaloguj się");
		await agent.waitForText("Kod jest nieprawidłowy albo wygasł");
		await agent.eval(`(async () => {
			const response = await fetch("/api/auth/get-session");
			if (await response.json() !== null) throw new Error("Invalid OTP created a session");
			sessionStorage.setItem("landingos.e2e.observe-otp-completion", "true");
			sessionStorage.setItem("landingos.e2e.otp-email-step-flashed", "false");
		})()`);

		await agent.fill("#auth-otp", "246810");
		await agent.clickText("Zaloguj się");
		await agent.waitForText("Ustaw pseudonim");
		await agent.eval(`(() => {
			if (location.pathname !== "/app") throw new Error("Successful OTP did not reach /app");
			if (sessionStorage.getItem("landingos.e2e.otp-email-step-flashed") !== "false") {
				throw new Error("The email OTP form flashed after successful authentication");
			}
			sessionStorage.removeItem("landingos.e2e.observe-otp-completion");
			sessionStorage.removeItem("landingos.e2e.otp-email-step-flashed");
		})()`);

		await agent.open(`${context.baseUrl}/signin`);
		await agent.waitForText("Ustaw pseudonim");
		await agent.eval(
			`if (location.pathname !== "/app") throw new Error("Valid session with intent did not recover /app")`,
		);
		await agent.fill("#room-pseudonym", context.viewport.mobile ? "Ryś OTP M" : "Ryś OTP D");
		await agent.clickText("Zapisz i wejdź do pokoju");
		await agent.waitForText("Pokój lotu");

		await agent.eval(`sessionStorage.removeItem("landingos.room-intent")`);
		await agent.open(`${context.baseUrl}/signin`);
		await agent.waitForText("Zacznij od lotu");
		await agent.eval(
			`if (location.pathname !== "/") throw new Error("Valid session without intent did not recover /")`,
		);

		const response = await fetch(`${context.fixtureOrigin}/test-control/evidence`);
		const evidence = (await response.json()) as {
			requests: Array<{ path: string }>;
		};
		const sentCodes = evidence.requests.filter(
			(request) => request.path === "/api/auth/email-otp/send-verification-otp",
		).length;
		if (sentCodes !== 1) throw new Error(`Expected one OTP email, observed ${sentCodes}`);
		if (evidence.requests.some((request) => request.path.startsWith("/test-auth/"))) {
			throw new Error("Real-client OTP regression used the synchronous mock auth API");
		}
		if (!evidence.requests.some((request) => request.path === "/api/auth/get-session")) {
			throw new Error("Real Better Auth client did not request its session endpoint");
		}
		await agent.assertNoPageErrors();
	} finally {
		await agent.close();
	}
}
