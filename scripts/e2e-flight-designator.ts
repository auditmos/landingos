import { AgentBrowser } from "./e2e-agent.ts";

export type FlightDesignatorScenarioContext = {
	baseUrl: string;
	fixtureOrigin: string;
	namespace: string;
	initScript: string;
	viewport: { name: "mobile" | "desktop"; width: number; height: number; mobile: boolean };
};

function createAgent(context: FlightDesignatorScenarioContext, suffix: string) {
	return new AgentBrowser({
		namespace: context.namespace,
		session: `${context.viewport.name}-${suffix}`,
		initScript: context.initScript,
	});
}

async function prepareAgent(agent: AgentBrowser, context: FlightDesignatorScenarioContext) {
	await agent.open(`${context.baseUrl}/`);
	await agent.viewport(context.viewport.width, context.viewport.height);
}

async function assertRuntimeClean(agent: AgentBrowser) {
	await agent.eval(`(() => {
		const failures = window.__landingosE2eErrors || [];
		if (failures.length > 0) throw new Error("Runtime errors: " + failures.join(" | "));
	})()`);
	await agent.assertNoPageErrors();
}

async function setManualRoomIntent(agent: AgentBrowser) {
	await agent.eval(
		`sessionStorage.setItem("landingos.room-intent", ${JSON.stringify(
			JSON.stringify({
				flightInstanceId: "flight-manual-w61431-2026-09-14",
				selection: {
					kind: "public_transport",
					badges: ["recommended"],
					modes: ["bus"],
					operatorNames: ["Airport Bus Express"],
				},
			}),
		)})`,
	);
}

export async function runFlightInputContract(context: FlightDesignatorScenarioContext) {
	const agent = createAgent(context, "flight-input");
	try {
		await prepareAgent(agent, context);
		await agent.waitForText("Numer lotu z biletu lub karty pokładowej — nie numer rezerwacji");
		await agent.assertScreen("Sprawdź lot", context.viewport.mobile);
		await agent.eval(`(() => {
			const input = document.querySelector("#flight-number");
			if (!(input instanceof HTMLInputElement)) throw new Error("Flight input is missing");
			if (input.maxLength !== 16 || input.autocapitalize !== "characters" || input.spellcheck) {
				throw new Error("Flight input mobile attributes are incomplete");
			}
			const ids = (input.getAttribute("aria-describedby") || "").split(" ").filter(Boolean);
			if (ids.length === 0 || ids.some((id) => !document.getElementById(id))) {
				throw new Error("Flight input accessible description is broken");
			}
		})()`);

		await agent.fill("#flight-number", "w6-1431");
		await agent.waitForText("Rozpoznamy jako W61431");
		await agent.eval(`(() => {
			const input = document.querySelector("#flight-number");
			if (!(input instanceof HTMLInputElement) || input.value !== "w6-1431") {
				throw new Error("Paste was masked instead of preserved while editing");
			}
			if (document.querySelector("#flight-number-preview")?.getAttribute("aria-live") !== "polite") {
				throw new Error("Canonical preview is not announced accessibly");
			}
		})()`);

		await agent.fill("#flight-number", "W6141");
		await agent.eval(`(() => {
			const input = document.querySelector("#flight-number");
			if (!(input instanceof HTMLInputElement)) throw new Error("Flight input is missing");
			input.focus();
			input.setSelectionRange(4, 4);
		})()`);
		await agent.command("keyboard", "type", "3");
		await agent.waitForText("Rozpoznamy jako W61431");
		await agent.eval(`(() => {
			const input = document.querySelector("#flight-number");
			if (!(input instanceof HTMLInputElement) || input.value !== "W61431") {
				throw new Error("Mid-string correction did not preserve the intended value");
			}
		})()`);

		const evidence = () =>
			fetch(`${context.fixtureOrigin}/test-control/evidence`).then(
				(response) => response.json() as Promise<{ requests: Array<{ path: string }> }>,
			);
		const resolveCalls = (value: { requests: Array<{ path: string }> }) =>
			value.requests.filter((request) => request.path === "/flights/resolve").length;
		const before = await evidence();
		await agent.fill("#flight-number", "EZY123");
		await agent.fill("#departure-date-native", "2026-09-14");
		await agent.clickText("Sprawdź lot");
		await agent.waitForText("To wygląda jak trzy-literowy kod operacyjny");
		if (resolveCalls(await evidence()) !== resolveCalls(before)) {
			throw new Error("Unsupported ICAO input called the provider boundary");
		}
		await agent.eval(`(() => {
			const input = document.querySelector("#flight-number");
			if (!(input instanceof HTMLInputElement) || input.getAttribute("aria-invalid") !== "true") {
				throw new Error("Flight validation is not exposed accessibly");
			}
			const errorId = (input.getAttribute("aria-describedby") || "")
				.split(" ").find((id) => id === "flight-number-error");
			if (!errorId || !document.getElementById(errorId)) throw new Error("Flight error is not described");
		})()`);
		await assertRuntimeClean(agent);
	} finally {
		await agent.close();
	}
}

async function authenticateAndJoin(
	agent: AgentBrowser,
	context: FlightDesignatorScenarioContext,
	email: string,
	pseudonym: string,
) {
	await agent.open(`${context.baseUrl}/signin`);
	await agent.waitForText("Zaloguj się kodem");
	await agent.fill("#auth-email", email);
	await agent.clickText("Wyślij kod");
	await agent.waitForText("Kod ma 6 cyfr");
	await agent.fill("#auth-otp", "246810");
	await agent.clickText("Zaloguj się");
	await agent.waitForText("Ustaw pseudonim");
	await agent.fill("#room-pseudonym", pseudonym);
	await agent.clickText("Zapisz i wejdź do pokoju");
	await agent.waitForText("Pokój lotu");
	await agent.waitForText("Połączono");
	await agent.waitForText("Akceptuję zasady");
	await agent.clickText("Akceptuję zasady");
	await agent.waitForText("Zasady społeczności zostały zaakceptowane.");
}

async function completeManualAndJoin(
	agent: AgentBrowser,
	context: FlightDesignatorScenarioContext,
	input: {
		designator: string;
		arrival: string;
		email: string;
		pseudonym: string;
		conflict: boolean;
	},
) {
	await prepareAgent(agent, context);
	await agent.fill("#flight-number", input.designator);
	await agent.fill("#departure-date-native", "2026-09-14");
	await agent.clickText("Sprawdź lot");
	await agent.waitForText("Uzupełnij przylot ręcznie");
	await agent.fill("#arrival-native", input.arrival);
	await agent.clickText("Zapisz i kontynuuj");
	await agent.waitForText("W6 1431");
	await agent.waitForText("Godzina przylotu podana przez podróżnych");
	if (input.conflict) {
		await agent.waitForText("Korzystamy ze wspólnej godziny przylotu 14.09.2026, 10:20");
	}
	await setManualRoomIntent(agent);
	await authenticateAndJoin(agent, context, input.email, input.pseudonym);
}

export async function runManualRoomIdentity(
	context: FlightDesignatorScenarioContext,
	userSuffix: string,
) {
	const first = createAgent(context, `manual-room-a-${userSuffix}`);
	const second = createAgent(context, `manual-room-b-${userSuffix}`);
	try {
		await completeManualAndJoin(first, context, {
			designator: "w6-1431",
			arrival: "2026-09-14T10:20",
			email: `manual-a-${userSuffix}@example.test`,
			pseudonym: `Wilk${userSuffix}`,
			conflict: false,
		});
		await completeManualAndJoin(second, context, {
			designator: "W6 W61431",
			arrival: "2026-09-14T10:37",
			email: `manual-b-${userSuffix}@example.test`,
			pseudonym: `Lis${userSuffix}`,
			conflict: true,
		});
		await first.waitForText(`Lis${userSuffix}`);
		await first.assertTextCount(`Lis${userSuffix}`, 1);
		await second.waitForText(`Wilk${userSuffix}`);
		await Promise.all([assertRuntimeClean(first), assertRuntimeClean(second)]);
	} finally {
		await Promise.all([first.close(), second.close()]);
	}
}
