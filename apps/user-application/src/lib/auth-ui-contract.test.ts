import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const sourceRoot = resolve(import.meta.dirname, "..");
const readSource = (path: string) => readFileSync(resolve(sourceRoot, path), "utf8");

describe("LandingOS auth UI contract", () => {
	it("uses only the Better Auth email OTP client flow", () => {
		const client = readSource("lib/auth-client.ts");
		const component = readSource("components/auth/email-auth.tsx");
		expect(client).toContain("emailOTPClient");
		expect(component).toContain("emailOtp.sendVerificationOtp");
		expect(component).toContain("signIn.emailOtp");
		expect(component).not.toContain("signUp.email");
		expect(component).not.toContain("signIn.email({");
		expect(component).not.toMatch(/password/i);
	});

	it("keeps browser tokens out of localStorage and consent unchecked by default", () => {
		const component = readSource("components/auth/email-auth.tsx");
		expect(component).toContain("useState(false)");
		expect(component).toContain('action: "marketing_consent"');
		expect(component).not.toContain("localStorage");
		expect(readSource("lib/auth-client.ts")).not.toContain("localStorage");
	});

	it("removes starter approval gates and exposes Polish login copy", () => {
		const middleware = readSource("core/middleware/auth.ts");
		const protectedRoute = readSource("routes/_auth/route.tsx");
		const component = readSource("components/auth/email-auth.tsx");
		expect(middleware).not.toMatch(/approved|approval/i);
		expect(protectedRoute).not.toMatch(/approved|approval/i);
		expect(component).toContain("Zaloguj się kodem");
		expect(component).toContain("Kod ma 6 cyfr");
		expect(component).toContain("zgodę marketingową");
	});
});
