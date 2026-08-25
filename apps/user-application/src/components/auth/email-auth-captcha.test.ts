// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The captcha gate is off by default in this project's vitest env, and the
// component reads the site key once at module load — so it has to be set
// before `./email-auth` is imported.
vi.hoisted(() => {
	process.env.VITE_TURNSTILE_SITE_KEY = "1x00000000000000000000AA";
});

const { issuedTokens } = vi.hoisted(() => ({ issuedTokens: { count: 0 } }));

// A stand-in for the Cloudflare widget: jsdom cannot run the real challenge,
// and each pass must hand out a distinct single-use token.
vi.mock("@/components/auth/turnstile", async () => {
	const { createElement: create, forwardRef } = await import("react");
	return {
		Turnstile: forwardRef(function FakeTurnstile(
			{ onVerify }: { onVerify: (token: string) => void },
			_ref,
		) {
			return create("button", {
				type: "button",
				"data-testid": "captcha",
				onClick: () => {
					issuedTokens.count += 1;
					onVerify(`captcha-token-${issuedTokens.count}`);
				},
			});
		}),
	};
});

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

const { EmailAuth } = await import("./email-auth");

function changeInput(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
	input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("EmailAuth behind the captcha gate", () => {
	let container: HTMLDivElement;
	let root: Root;

	const submitButton = () => container.querySelector<HTMLButtonElement>('button[type="submit"]');
	const captcha = () => container.querySelector<HTMLButtonElement>('[data-testid="captcha"]');
	const backButton = () =>
		Array.from(container.querySelectorAll("button")).find((button) =>
			button.textContent?.includes("Użyj innego adresu"),
		);

	beforeEach(() => {
		issuedTokens.count = 0;
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		sendVerificationOtp.mockResolvedValue({ data: { success: true }, error: null });
		signInWithOtp.mockResolvedValue({ data: null, error: { code: "INVALID_OTP" } });
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("drops the consumed token and the stale error when the traveler goes back", async () => {
		await act(async () => root.render(createElement(EmailAuth, { onAuthenticated: vi.fn() })));

		expect(submitButton()?.disabled).toBe(true);
		await act(async () => captcha()?.click());
		expect(submitButton()?.disabled).toBe(false);

		const email = container.querySelector<HTMLInputElement>("#auth-email");
		await act(async () => changeInput(email as HTMLInputElement, "user@example.test"));
		await act(async () => email?.form?.dispatchEvent(new Event("submit", { bubbles: true })));

		const otp = container.querySelector<HTMLInputElement>("#auth-otp");
		expect(otp).not.toBeNull();
		await act(async () => changeInput(otp as HTMLInputElement, "111111"));
		await act(async () => otp?.form?.dispatchEvent(new Event("submit", { bubbles: true })));
		expect(container.textContent).toContain("Kod jest nieprawidłowy");

		await act(async () => backButton()?.click());

		expect(container.textContent).not.toContain("Kod jest nieprawidłowy");
		expect(container.querySelector("#auth-email")).not.toBeNull();
		expect(submitButton()?.disabled).toBe(true);

		await act(async () => captcha()?.click());
		expect(submitButton()?.disabled).toBe(false);

		const backOnEmail = container.querySelector<HTMLInputElement>("#auth-email");
		await act(async () => backOnEmail?.form?.dispatchEvent(new Event("submit", { bubbles: true })));
		expect(sendVerificationOtp).toHaveBeenLastCalledWith(
			expect.objectContaining({
				fetchOptions: { headers: { "x-captcha-response": "captcha-token-2" } },
			}),
		);
	});
});
