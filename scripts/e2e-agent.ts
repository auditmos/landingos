import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type AgentBrowserOptions = {
	namespace: string;
	session: string;
	initScript?: string;
};

function compact(value: string) {
	return value.replace(/\s+/g, " ").trim();
}

export class AgentBrowser {
	private readonly env: NodeJS.ProcessEnv;

	constructor(options: AgentBrowserOptions) {
		this.env = {
			...process.env,
			AGENT_BROWSER_NAMESPACE: options.namespace,
			AGENT_BROWSER_SESSION: options.session,
			AGENT_BROWSER_TIMEOUT: "12000",
			...(options.initScript ? { AGENT_BROWSER_INIT_SCRIPTS: options.initScript } : {}),
		};
	}

	async command(...args: string[]) {
		try {
			return await execFileAsync("agent-browser", args, {
				env: this.env,
				maxBuffer: 4 * 1024 * 1024,
			});
		} catch (error) {
			const failure = error as Error & { stdout?: string; stderr?: string };
			throw new Error(
				`agent-browser ${args[0] ?? ""} failed: ${compact(
					failure.stderr || failure.stdout || failure.message,
				)}`,
			);
		}
	}

	async open(url: string) {
		await this.command("open", url);
	}

	async viewport(width: number, height: number) {
		await this.command("set", "viewport", String(width), String(height));
	}

	async waitForText(text: string) {
		try {
			await this.command("wait", "--text", text);
		} catch (error) {
			const diagnostic = await this.eval(`({
				url: location.href,
				title: document.title,
				text: document.body?.innerText.slice(0, 3000),
				html: document.body?.innerHTML.slice(0, 3000),
				errors: window.__landingosE2eErrors,
			})`).catch(() => ({ stdout: "page diagnostic unavailable" }));
			throw new Error(
				`${error instanceof Error ? error.message : String(error)}; page=${compact(
					diagnostic.stdout,
				)}`,
			);
		}
	}

	async waitFor(expression: string) {
		await this.command("wait", "--fn", expression);
	}

	async eval(expression: string) {
		const encoded = Buffer.from(expression).toString("base64");
		return this.command("eval", "-b", encoded);
	}

	async fill(selector: string, value: string) {
		await this.eval(`(() => {
			const element = document.querySelector(${JSON.stringify(selector)});
			if (!(element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement)) {
				throw new Error("Missing form control: " + ${JSON.stringify(selector)});
			}
			const prototype = element instanceof HTMLTextAreaElement
				? HTMLTextAreaElement.prototype
				: HTMLInputElement.prototype;
			const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
			setter?.call(element, ${JSON.stringify(value)});
			element.dispatchEvent(new Event("input", { bubbles: true }));
			element.dispatchEvent(new Event("change", { bubbles: true }));
		})()`);
	}

	async clickText(text: string, occurrence = 0) {
		await this.eval(`(() => {
			const normalize = (value) => value.replace(/\\s+/g, " ").trim();
			const candidates = [...document.querySelectorAll("button, a, [role=button]")]
				.filter((element) =>
					normalize(element.textContent || "") === ${JSON.stringify(text)} ||
					normalize(element.getAttribute("aria-label") || "") === ${JSON.stringify(text)});
			const element = candidates[${occurrence}];
			if (!(element instanceof HTMLElement)) {
				throw new Error("Missing action: " + ${JSON.stringify(text)});
			}
			element.scrollIntoView({ block: "center" });
			element.click();
		})()`);
	}

	async clickContaining(text: string, occurrence = 0) {
		await this.eval(`(() => {
			const normalize = (value) => value.replace(/\\s+/g, " ").trim();
			const candidates = [...document.querySelectorAll("button, a, [role=button]")]
				.filter((element) => normalize(element.textContent || "").includes(${JSON.stringify(text)}));
			const element = candidates[${occurrence}];
			if (!(element instanceof HTMLElement)) {
				throw new Error("Missing action containing: " + ${JSON.stringify(text)});
			}
			element.scrollIntoView({ block: "center" });
			element.click();
		})()`);
	}

	async assertScreen(primaryAction: string, mobile: boolean) {
		await this.eval(`(() => {
			const normalize = (value) => value.replace(/\\s+/g, " ").trim();
			if (document.documentElement.scrollWidth > document.documentElement.clientWidth + 1) {
				throw new Error("Horizontal overflow: " + document.documentElement.scrollWidth);
			}
			const element = [...document.querySelectorAll("button, a, [role=button]")]
				.find((candidate) => {
					const rect = candidate.getBoundingClientRect();
					const name = normalize(candidate.textContent || "") ||
						normalize(candidate.getAttribute("aria-label") || "");
					return name === ${JSON.stringify(primaryAction)} &&
						rect.width > 0 && rect.height > 0;
				});
			if (!(element instanceof HTMLElement)) throw new Error("Missing primary action");
			element.scrollIntoView({ block: "center" });
			const rect = element.getBoundingClientRect();
			const style = getComputedStyle(element);
			if (rect.width <= 0 || rect.height <= 0 || style.visibility === "hidden" || style.display === "none") {
				throw new Error("Primary action is not visible");
			}
			if (rect.top < -1 || rect.bottom > innerHeight + 1) throw new Error("Primary action unreachable");
			const cssWidth = Number.parseFloat(style.width);
			const cssHeight = Number.parseFloat(style.height);
			if (${mobile} && (Math.max(rect.width, cssWidth) < 44 || Math.max(rect.height, cssHeight) < 44)) {
				throw new Error("Primary action smaller than 44 CSS pixels: " + rect.width + "x" + rect.height +
					" class=" + element.className + " computed=" + style.height);
			}
			if (${mobile} && navigator.maxTouchPoints < 1) throw new Error("Touch is not enabled");
			return { width: innerWidth, height: innerHeight, action: ${JSON.stringify(primaryAction)} };
		})()`);
	}

	async assertTextCount(text: string, expected: number) {
		await this.eval(`(() => {
			const body = document.body.innerText;
			const count = body.split(${JSON.stringify(text)}).length - 1;
			if (count !== ${expected}) throw new Error("Expected ${expected} occurrences, saw " + count);
		})()`);
	}

	async assertNoPageErrors() {
		const result = await this.command("errors", "--json");
		const payload = JSON.parse(result.stdout) as {
			data?: { errors?: Array<{ text?: string }> };
		};
		const errors = payload.data?.errors ?? [];
		if (errors.length > 0) {
			throw new Error(`Chromium page errors: ${errors.map((error) => error.text).join(" | ")}`);
		}
	}

	async close() {
		await this.command("close").catch(() => undefined);
	}
}
