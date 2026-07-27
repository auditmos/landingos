import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createCloudflareOtpSender } from "./auth-email";

describe("Cloudflare OTP email sender", () => {
	it("sends Polish text and HTML through the injected binding", async () => {
		const messages: unknown[] = [];
		const sender = createCloudflareOtpSender(
			{
				send: async (message) => {
					messages.push(message);
					return { messageId: "recorded" };
				},
			},
			"logowanie@landingos.app",
		);

		await sender({
			email: "user@example.com",
			otp: "123456",
			type: "sign-in",
		});

		expect(messages).toHaveLength(1);
		expect(messages[0]).toEqual({
			from: "logowanie@landingos.app",
			to: "user@example.com",
			subject: "Kod logowania do LandingOS",
			text: expect.stringContaining("123456"),
			html: expect.stringContaining("123456"),
		});
	});

	it("fails closed for malformed codes or a missing sender address", async () => {
		const binding = { send: vi.fn(async () => ({ messageId: "recorded" })) };
		expect(() => createCloudflareOtpSender(binding, "")).toThrow();
		const sender = createCloudflareOtpSender(binding, "logowanie@landingos.app");
		await expect(
			sender({
				email: "user@example.com",
				otp: "<script>",
				type: "sign-in",
			}),
		).rejects.toThrow();
		expect(binding.send).not.toHaveBeenCalled();
	});
});

describe("Email Service configuration", () => {
	const root = resolve(import.meta.dirname, "..", "..");
	const rawConfig = readFileSync(resolve(root, "wrangler.jsonc"), "utf8");
	const config = JSON.parse(rawConfig.replace(/\/\*[\s\S]*?\*\//g, "")) as {
		send_email?: Array<Record<string, unknown>>;
		vars?: Record<string, string>;
		env: Record<
			string,
			{
				send_email?: Array<Record<string, unknown>>;
				vars?: Record<string, string>;
			}
		>;
	};

	it.each([
		"dev",
		"staging",
		"production",
	])("declares a sender and typed AUTH_EMAIL binding in %s", (environment) => {
		expect(config.env[environment]?.vars?.AUTH_EMAIL_FROM).toBe("logowanie@landingos.app");
		expect(config.env[environment]?.send_email).toEqual([
			expect.objectContaining({
				name: "AUTH_EMAIL",
				allowed_sender_addresses: ["logowanie@landingos.app"],
			}),
		]);
	});

	it("keeps local fake bindings local-only", () => {
		expect(config.send_email).toEqual([
			expect.objectContaining({ name: "AUTH_EMAIL", remote: false }),
		]);
		expect(config.env.dev?.send_email).toEqual([
			expect.objectContaining({ name: "AUTH_EMAIL", remote: false }),
		]);
	});

	it("contains generated Worker binding types", () => {
		const types = readFileSync(resolve(root, "worker-configuration.d.ts"), "utf8");
		expect(types).toContain("AUTH_EMAIL: SendEmail");
		expect(types).toContain("AUTH_EMAIL_FROM: ");
	});

	it("documents the configured sender and production onboarding gate", () => {
		const readme = readFileSync(resolve(root, "README.md"), "utf8");
		expect(readme).toContain("AUTH_EMAIL_FROM");
		expect(readme).toContain("logowanie@landingos.app");
		expect(readme).toContain("sender-domain onboarding");
	});
});
