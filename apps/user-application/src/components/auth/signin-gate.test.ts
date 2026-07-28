// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SigninGate } from "./signin-gate";

const { sendVerificationOtp, useSession } = vi.hoisted(() => ({
	sendVerificationOtp: vi.fn(),
	useSession: vi.fn(),
}));

vi.mock("@/lib/auth-client", () => ({
	authClient: {
		emailOtp: { sendVerificationOtp },
		useSession,
	},
}));

function changeInput(input: HTMLInputElement, value: string) {
	const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
	setter?.call(input, value);
	input.dispatchEvent(new Event("input", { bubbles: true }));
	input.dispatchEvent(new Event("change", { bubbles: true }));
}

describe("SigninGate", () => {
	let container: HTMLDivElement;
	let root: Root;

	beforeEach(() => {
		container = document.createElement("div");
		document.body.appendChild(container);
		root = createRoot(container);
		sendVerificationOtp.mockResolvedValue({ data: { success: true }, error: null });
	});

	afterEach(async () => {
		await act(async () => root.unmount());
		container.remove();
		vi.clearAllMocks();
	});

	it("recovers an authenticated visitor without flashing the email step", async () => {
		useSession.mockReturnValue({
			data: {
				user: { id: "user-1", email: "private@example.test" },
				session: { token: "session-token" },
			},
			isPending: false,
			error: null,
		});
		const onAuthenticated = vi.fn();

		await act(async () => root.render(createElement(SigninGate, { onAuthenticated })));

		expect(onAuthenticated).toHaveBeenCalledOnce();
		expect(container.textContent).toContain("Ładowanie sesji");
		expect(container.textContent).not.toContain("Wyślij kod");
	});

	it("shows the email step only after the client confirms there is no session", async () => {
		useSession.mockReturnValue({
			data: null,
			isPending: false,
			error: null,
		});

		await act(async () => root.render(createElement(SigninGate)));

		expect(container.textContent).toContain("Wyślij kod");
		expect(container.textContent).not.toContain("Ładowanie sesji");
	});

	it("keeps the OTP step mounted while an active tab refetches the session", async () => {
		// Assumption: after the initial null session result, returning to an active tab can
		// temporarily set isPending=true. That refresh must preserve the email and OTP form
		// state; browser process eviction is intentionally outside this regression.
		useSession.mockReturnValue({
			data: null,
			isPending: false,
			error: null,
		});

		await act(async () => root.render(createElement(SigninGate)));
		const email = container.querySelector<HTMLInputElement>("#auth-email");
		await act(async () => changeInput(email as HTMLInputElement, "traveler@example.test"));
		await act(async () => email?.form?.dispatchEvent(new Event("submit", { bubbles: true })));
		expect(container.querySelector("#auth-otp")).not.toBeNull();

		useSession.mockReturnValue({
			data: null,
			isPending: true,
			error: null,
		});
		await act(async () => root.render(createElement(SigninGate)));

		expect(container.querySelector("#auth-otp")).not.toBeNull();
		expect(container.textContent).not.toContain("Ładowanie sesji");

		useSession.mockReturnValue({
			data: null,
			isPending: false,
			error: null,
		});
		await act(async () => root.render(createElement(SigninGate)));

		expect(container.querySelector("#auth-otp")).not.toBeNull();
		expect(sendVerificationOtp).toHaveBeenCalledOnce();
	});
});
