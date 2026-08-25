// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmailAuth } from "./email-auth";

const { sendVerificationOtp, signInWithOtp } = vi.hoisted(() => ({
	sendVerificationOtp: vi.fn(),
	signInWithOtp: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		emailOtp: { sendVerificationOtp },
		signIn: { emailOtp: signInWithOtp },
	},
}));

function changeInput(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
	input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("EmailAuth", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		sendVerificationOtp.mockResolvedValue({ data: { success: true }, error: null });
		signInWithOtp.mockResolvedValue({ data: { token: "session-token" }, error: null });
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		vi.clearAllMocks();
		vi.unstubAllGlobals();
	});

	async function signInWithConsent(onAuthenticated: () => void) {
		await act(async () => root.render(createElement(EmailAuth, { onAuthenticated })));
		const email = container.querySelector<HTMLInputElement>("#auth-email");
		await act(async () => changeInput(email as HTMLInputElement, "user@example.test"));
		await act(async () => email?.form?.dispatchEvent(new Event("submit", { bubbles: true })));
		const consent = container.querySelector<HTMLInputElement>('input[type="checkbox"]');
		await act(async () => {
			(consent as HTMLInputElement).click();
		});
		const otp = container.querySelector<HTMLInputElement>("#auth-otp");
		await act(async () => changeInput(otp as HTMLInputElement, "246810"));
		await act(async () => otp?.form?.dispatchEvent(new Event("submit", { bubbles: true })));
	}

	it("hands successful OTP completion to the full-document navigation boundary", async () => {
		const onAuthenticated = vi.fn();
		await act(async () => root.render(createElement(EmailAuth, { onAuthenticated })));

		const email = container.querySelector<HTMLInputElement>("#auth-email");
		expect(email).not.toBeNull();
		await act(async () => changeInput(email as HTMLInputElement, "NOWY@example.test"));
		await act(async () => email?.form?.dispatchEvent(new Event("submit", { bubbles: true })));

		const otp = container.querySelector<HTMLInputElement>("#auth-otp");
		expect(otp).not.toBeNull();
		await act(async () => changeInput(otp as HTMLInputElement, "246810"));
		await act(async () => otp?.form?.dispatchEvent(new Event("submit", { bubbles: true })));

		expect(signInWithOtp).toHaveBeenCalledWith({
			email: "nowy@example.test",
			otp: "246810",
		});
		expect(sendVerificationOtp).toHaveBeenCalledOnce();
		expect(onAuthenticated).toHaveBeenCalledOnce();
		expect(container.textContent).toContain("Kod ma 6 cyfr");
		expect(container.textContent).not.toContain("Wyślij kod");
	});

	it("keeps an invalid OTP on the code step with a Polish error and no session handoff", async () => {
		signInWithOtp.mockResolvedValueOnce({ data: null, error: { code: "INVALID_OTP" } });
		const onAuthenticated = vi.fn();
		await act(async () => root.render(createElement(EmailAuth, { onAuthenticated })));

		const email = container.querySelector<HTMLInputElement>("#auth-email");
		await act(async () => changeInput(email as HTMLInputElement, "user@example.test"));
		await act(async () => email?.form?.dispatchEvent(new Event("submit", { bubbles: true })));
		const otp = container.querySelector<HTMLInputElement>("#auth-otp");
		await act(async () => changeInput(otp as HTMLInputElement, "111111"));
		await act(async () => otp?.form?.dispatchEvent(new Event("submit", { bubbles: true })));

		expect(onAuthenticated).not.toHaveBeenCalled();
		expect(container.textContent).toContain(
			"Kod jest nieprawidłowy albo wygasł. Poproś o nowy kod.",
		);
		expect(container.querySelector("#auth-otp")).not.toBeNull();
	});
	it("completes sign-in when the marketing consent request fails on the network", async () => {
		const consentFetch = vi.fn().mockRejectedValue(new Error("network"));
		vi.stubGlobal("fetch", consentFetch);
		const onAuthenticated = vi.fn();
		await signInWithConsent(onAuthenticated);

		expect(consentFetch).toHaveBeenCalledOnce();
		expect(onAuthenticated).toHaveBeenCalledOnce();
		expect(container.textContent).not.toContain("Kod jest nieprawidłowy");
	});

	it("completes sign-in when the server rejects the marketing consent request", async () => {
		const consentFetch = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));
		vi.stubGlobal("fetch", consentFetch);
		const onAuthenticated = vi.fn();
		await signInWithConsent(onAuthenticated);

		expect(consentFetch).toHaveBeenCalledOnce();
		expect(onAuthenticated).toHaveBeenCalledOnce();
		expect(container.textContent).not.toContain("Kod jest nieprawidłowy");
	});
});
