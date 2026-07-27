import { performance } from "node:perf_hooks";
import { AgentBrowser } from "./e2e-agent.ts";

export type BrowserViewport = {
	name: "mobile" | "desktop";
	width: number;
	height: number;
	mobile: boolean;
};

type ScenarioContext = {
	baseUrl: string;
	fixtureOrigin: string;
	namespace: string;
	initScript: string;
	viewport: BrowserViewport;
};

function roomIntent(flightInstanceId: string) {
	return JSON.stringify({
		flightInstanceId,
		selection: {
			kind: "public_transport",
			badges: ["recommended"],
			modes: ["bus"],
			operatorNames: ["Airport Bus Express"],
		},
	});
}

function createAgent(context: ScenarioContext, suffix: string) {
	return new AgentBrowser({
		namespace: context.namespace,
		session: `${context.viewport.name}-${suffix}`,
		initScript: context.initScript,
	});
}

async function prepareAgent(
	agent: AgentBrowser,
	context: ScenarioContext,
	path = "/",
): Promise<void> {
	await agent.open(`${context.baseUrl}${path}`);
	await agent.viewport(context.viewport.width, context.viewport.height);
}

async function setIntent(agent: AgentBrowser, flightInstanceId: string) {
	await agent.eval(
		`sessionStorage.setItem("landingos.room-intent", ${JSON.stringify(
			roomIntent(flightInstanceId),
		)})`,
	);
}

async function login(
	agent: AgentBrowser,
	context: ScenarioContext,
	email: string,
	expectedText: string,
) {
	await prepareAgent(agent, context, "/signin");
	await agent.waitForText("Zaloguj się kodem");
	await agent.assertScreen("Wyślij kod", context.viewport.mobile);
	await agent.fill("#auth-email", email);
	await agent.clickText("Wyślij kod");
	await agent.waitForText("Kod ma 6 cyfr");
	await agent.eval(`(() => {
		const consent = document.querySelector('input[type="checkbox"]');
		if (!(consent instanceof HTMLInputElement) || consent.checked) {
			throw new Error("Marketing consent was not optional and unchecked");
		}
	})()`);
	await agent.fill("#auth-otp", "246810");
	await agent.clickText("Zaloguj się");
	await agent.waitForText(expectedText);
}

async function loginAndJoin(
	agent: AgentBrowser,
	context: ScenarioContext,
	email: string,
	pseudonym: string,
	flightInstanceId: string,
) {
	await prepareAgent(agent, context);
	await setIntent(agent, flightInstanceId);
	await agent.open(`${context.baseUrl}/signin`);
	await agent.waitForText("Zaloguj się kodem");
	await agent.fill("#auth-email", email);
	await agent.clickText("Wyślij kod");
	await agent.waitForText("Kod ma 6 cyfr");
	await agent.fill("#auth-otp", "246810");
	await agent.clickText("Zaloguj się");
	await agent.waitForText("Ustaw pseudonim");
	await agent.assertScreen("Zapisz i wejdź do pokoju", context.viewport.mobile);
	await agent.fill("#room-pseudonym", pseudonym);
	await agent.clickText("Zapisz i wejdź do pokoju");
	await agent.waitForText("Pokój lotu");
	await agent.waitForText("Połączono");
	await agent.waitForText("Akceptuję zasady");
	await agent.clickText("Akceptuję zasady");
	await agent.waitForText("Zaakceptowano aktualną wersję");
}

async function assertRuntimeClean(agent: AgentBrowser) {
	await agent.eval(`(() => {
		const failures = window.__landingosE2eErrors || [];
		if (failures.length > 0) throw new Error("Runtime errors: " + failures.join(" | "));
	})()`);
	await agent.assertNoPageErrors();
}

async function plannerErrorAndRoomJourney(
	context: ScenarioContext,
	main: AgentBrowser,
	userSuffix: string,
) {
	await prepareAgent(main, context);
	await main.waitForText("Zacznij od swojego lotu");
	await main.assertScreen("Sprawdź lot", context.viewport.mobile);
	await main.eval(`(async () => {
		if (document.documentElement.lang !== "pl") throw new Error("Document language is not Polish");
		const manifestLink = document.querySelector('link[rel="manifest"]');
		if (!(manifestLink instanceof HTMLLinkElement)) throw new Error("Manifest link is missing");
		const response = await fetch(manifestLink.href);
		if (!response.ok) throw new Error("Manifest did not load");
		const manifest = await response.json();
		if (manifest.display !== "standalone" || manifest.icons.length !== 3) {
			throw new Error("Manifest metadata is invalid");
		}
		for (const icon of manifest.icons) {
			const iconResponse = await fetch(icon.src);
			if (!iconResponse.ok || iconResponse.headers.get("content-type") !== "image/png") {
				throw new Error("PWA icon did not load as PNG: " + icon.src);
			}
			const image = new Image();
			image.src = icon.src;
			await image.decode();
			const expected = Number(icon.sizes.split("x")[0]);
			if (image.naturalWidth !== expected || image.naturalHeight !== expected) {
				throw new Error("PWA icon has wrong dimensions: " + icon.src);
			}
		}
		const registrations = await navigator.serviceWorker?.getRegistrations();
		if (registrations?.length) throw new Error("Unexpected service worker registration");
		return manifest.name;
	})()`);
	await main.fill("#flight-number", "FR500");
	await main.fill("#departure-date", "2026-09-14");
	await main.clickText("Sprawdź lot");
	await main.waitForText("Nie udało się wykonać operacji");
	await main.assertScreen("Sprawdź lot", context.viewport.mobile);
	await main.clickText("Sprawdź lot");
	await main.waitForText("Lot rozpoznany");

	await main.fill("#destination-query", "błąd");
	await main.waitForText("Nie udało się znaleźć miejsca");
	await main.assertScreen("Spróbuj ponownie", context.viewport.mobile);
	await main.clickText("Spróbuj ponownie");
	await main.waitForText("Nie udało się znaleźć miejsca");

	await main.fill("#destination-query", "poza miastem");
	await main.waitForText("Poza Mediolanem");
	await main.clickContaining("Poza Mediolanem");
	await main.waitForText("Cel jeszcze nieobsługiwany");
	await main.assertScreen("Zmień wpisane miejsce", context.viewport.mobile);

	await main.fill("#destination-query", "bez trasy");
	await main.waitForText("Miejsce bez trasy");
	await main.clickContaining("Miejsce bez trasy");
	await main.waitForText("Nie udało się przygotować rekomendacji");
	await main.assertScreen("Spróbuj ponownie", context.viewport.mobile);
	await main.clickText("Spróbuj ponownie");
	await main.waitForText("Nie udało się przygotować rekomendacji");

	await main.fill("#destination-query", "Duomo");
	await main.waitForText("Duomo di Milano");
	await main.clickContaining("Duomo di Milano");
	await main.waitForText("Airport Bus Express");
	await main.assertScreen("Wybierz i przejdź do pokoju", context.viewport.mobile);
	await main.clickText("Wybierz i przejdź do pokoju");
	await main.waitForText("Zaloguj się kodem");
	await main.fill("#auth-email", `traveler-${userSuffix}@example.test`);
	await main.clickText("Wyślij kod");
	await main.waitForText("Kod ma 6 cyfr");
	await main.fill("#auth-otp", "111111");
	await main.clickText("Zaloguj się");
	await main.waitForText("Kod jest nieprawidłowy albo wygasł");
	await main.assertScreen("Zaloguj się", context.viewport.mobile);
	await main.eval(`(() => {
		const consent = document.querySelector('input[type="checkbox"]');
		if (!(consent instanceof HTMLInputElement) || consent.checked) {
			throw new Error("Marketing consent changed during OTP retry");
		}
	})()`);
	await main.fill("#auth-otp", "246810");
	await main.clickText("Zaloguj się");
	await main.waitForText("Ustaw pseudonim");
	await main.assertScreen("Zapisz i wejdź do pokoju", context.viewport.mobile);
	await main.fill("#room-pseudonym", `Sokół${userSuffix}`);
	await main.clickText("Zapisz i wejdź do pokoju");
	await main.waitForText("Pokój lotu");
	await main.waitForText("Połączono");
	await main.assertScreen("Akceptuję zasady", context.viewport.mobile);
	await main.clickText("Akceptuję zasady");
	await main.waitForText("Zaakceptowano aktualną wersję");
}

async function manualFallback(context: ScenarioContext, userSuffix: string) {
	const agent = createAgent(context, `manual-${userSuffix}`);
	try {
		await prepareAgent(agent, context);
		await agent.waitForText("Zacznij od swojego lotu");
		await agent.fill("#flight-number", "FR404");
		await agent.fill("#departure-date", "2026-09-14");
		await agent.clickText("Sprawdź lot");
		await agent.waitForText("Uzupełnij przylot ręcznie");
		await agent.assertScreen("Zapisz i kontynuuj", context.viewport.mobile);
		await agent.clickText("Zapisz i kontynuuj");
		await agent.waitForText("Lot rozpoznany");
		await agent.assertScreen("Sprawdź lot", context.viewport.mobile);
		await assertRuntimeClean(agent);
	} finally {
		await agent.close();
	}
}

async function operatorJourney(context: ScenarioContext, userSuffix: string) {
	const regular = createAgent(context, `regular-${userSuffix}`);
	const operator = createAgent(context, `operator-${userSuffix}`);
	const verificationDate = "2026-07-27T00:00";
	try {
		await login(regular, context, `regular-${userSuffix}@example.test`, "Panel podróżnego");
		await regular.open(`${context.baseUrl}/operator`);
		await regular.waitForText("Brak dostępu do katalogu");
		if (context.viewport.mobile) {
			await regular.eval(`document.querySelector('button[aria-label="Otwórz menu"]')?.click()`);
		}
		await regular.assertScreen("Start", context.viewport.mobile);

		await login(operator, context, `operator-${userSuffix}@example.test`, "Panel podróżnego");
		await operator.open(`${context.baseUrl}/operator`);
		await operator.waitForText("Katalog transferów z BGY");
		await operator.assertScreen("Zapisz szkic", context.viewport.mobile);
		const values: Array<[string, string]> = [
			["#catalog-operatorName", "Operator E2E"],
			["#catalog-serviceName", "E2E Express"],
			["#catalog-destinationStopCode", "MIL-C"],
			["#catalog-destinationStopName", "Milano Centrale"],
			["#catalog-sourceUrl", "https://www.milanbergamoairport.it/en/bus/"],
			["#catalog-purchaseUrl", "https://www.airportbusexpress.it/tickets"],
			["#catalog-durationMinutes", "50"],
			["#catalog-transferCount", "0"],
			["#catalog-walkingMinutes", "5"],
			["#catalog-walkingMeters", "300"],
			["#catalog-costMinorMin", "1200"],
			["#catalog-costMinorMax", "1200"],
			["#catalog-checkedAt", verificationDate],
		];
		for (const [selector, value] of values) await operator.fill(selector, value);
		await operator.clickText("Zapisz szkic");
		await operator.waitForText("E2E Express");
		await operator.waitForText("Opublikuj");
		await operator.assertScreen("Opublikuj", context.viewport.mobile);
		await operator.clickText("Opublikuj");
		await operator.waitForText("Wycofaj publikację");
		await operator.fill("#catalog-serviceName", "E2E Express poprawiony");
		await operator.clickText("Zapisz szkic");
		await operator.waitForText("E2E Express poprawiony");
		await assertRuntimeClean(regular);
		await assertRuntimeClean(operator);
	} finally {
		await Promise.all([regular.close(), operator.close()]);
	}
}

async function publishedRecommendation(context: ScenarioContext, userSuffix: string) {
	const agent = createAgent(context, `published-${userSuffix}`);
	try {
		await prepareAgent(agent, context);
		await agent.fill("#flight-number", "FR1234");
		await agent.fill("#departure-date", "2026-09-14");
		await agent.clickText("Sprawdź lot");
		await agent.waitForText("Lot rozpoznany");
		await agent.fill("#destination-query", "Duomo");
		await agent.waitForText("Duomo di Milano");
		await agent.clickContaining("Duomo di Milano");
		await agent.waitForText("E2E Express poprawiony");
		await agent.assertScreen("Wybierz i przejdź do pokoju", context.viewport.mobile);
		await assertRuntimeClean(agent);
	} finally {
		await agent.close();
	}
}

export async function runViewportScenarios(context: ScenarioContext) {
	const suffix = context.viewport.name === "mobile" ? "M" : "D";
	const main = createAgent(context, `main-${suffix}`);
	const peer = createAgent(context, `peer-${suffix}`);
	const otherRoom = createAgent(context, `other-room-${suffix}`);
	try {
		await manualFallback(context, suffix);
		await plannerErrorAndRoomJourney(context, main, suffix);
		await loginAndJoin(
			peer,
			context,
			`peer-${suffix}@example.test`,
			`Ryś${suffix}`,
			"flight-fr500",
		);
		await loginAndJoin(
			otherRoom,
			context,
			`other-${suffix}@example.test`,
			`Żubr${suffix}`,
			"flight-second-room",
		);
		await main.clickText("Odśwież historię");
		await main.waitForText(`Ryś${suffix}`);

		const selectionStarted = performance.now();
		await Promise.all([
			main.clickText("Dzielona taksówka"),
			peer.waitFor(`document.body.innerText.includes("Sokół${suffix}") &&
				[...document.querySelectorAll("li")].some((item) =>
					item.innerText.includes("Sokół${suffix}") && item.innerText.includes("Dzielona taksówka"))`),
		]);
		if (performance.now() - selectionStarted > 5_000) {
			throw new Error("Transport selection synchronization exceeded 5 seconds");
		}
		await main.clickText("Transport publiczny");
		await peer.waitFor(`[...document.querySelectorAll("li")].some((item) =>
			item.innerText.includes("Sokół${suffix}") && item.innerText.includes("Airport Bus Express"))`);
		await peer.assertTextCount(`Sokół${suffix}`, 1);
		await otherRoom.eval(
			`if (document.body.innerText.includes("Sokół${suffix}")) {
				throw new Error("Selection leaked across flight rooms");
			}`,
		);

		const message = `Cześć z pokoju ${suffix}`;
		await main.fill("#room-message", message);
		const messageStarted = performance.now();
		await Promise.all([
			main.clickText("Wyślij"),
			peer.waitFor(`document.body.innerText.includes(${JSON.stringify(message)})`),
		]);
		if (performance.now() - messageStarted > 5_000) {
			throw new Error("Chat synchronization exceeded 5 seconds");
		}
		await main.assertTextCount(message, 1);
		await peer.assertTextCount(message, 1);
		await otherRoom.command("wait", "1000");
		await otherRoom.eval(
			`if (document.body.innerText.includes(${JSON.stringify(message)})) {
				throw new Error("Message leaked across flight rooms");
			}`,
		);

		await main.clickText("Zablokuj");
		await main.waitForText("Ta osoba została zablokowana");
		await main.assertScreen("Odblokuj", context.viewport.mobile);
		await main.clickText("Zgłoś osobę");
		await main.waitForText("Zgłoś problem");
		await main.assertScreen("Wyślij zgłoszenie", context.viewport.mobile);
		await main.fill("#report-note", "Automatyczny test bezpieczeństwa");
		await main.clickText("Wyślij zgłoszenie");
		await main.waitForText("Zgłoszenie zostało zapisane");

		await main.clickContaining("Aktywny");
		await main.waitForText("Usuń konto");
		await main.assertScreen("Usuń konto bezpowrotnie", context.viewport.mobile);
		await main.fill("#account-delete-confirmation", "USUŃ KONTO");
		await main.clickText("Usuń konto bezpowrotnie");
		await main.waitForText("Zacznij od swojego lotu");

		await fetch(
			`${context.fixtureOrigin}/test-control/rooms/10000000-0000-4000-8000-000000000001/close`,
			{
				method: "POST",
			},
		);
		await peer.waitForText("Pokój został zamknięty");
		await peer.assertScreen("Wróć do planera", context.viewport.mobile);
		await otherRoom.waitForText("Pokój lotu");

		await operatorJourney(context, suffix);
		await publishedRecommendation(context, suffix);
		await Promise.all([
			assertRuntimeClean(main),
			assertRuntimeClean(peer),
			assertRuntimeClean(otherRoom),
		]);
	} finally {
		await Promise.all([main.close(), peer.close(), otherRoom.close()]);
	}
}
