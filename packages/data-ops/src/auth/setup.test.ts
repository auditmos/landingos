import { type MemoryDB, memoryAdapter } from "@better-auth/memory-adapter";
import { ACCOUNT_DELETE_FRESH_AGE_SECONDS, createBetterAuth } from "./setup";

type SentOtp = {
	email: string;
	otp: string;
	type: string;
};

const TEST_SECRET = "landingos-test-secret-at-least-32-characters";

function createMemoryDb(): MemoryDB {
	return {
		auth_user: [],
		auth_session: [],
		auth_account: [],
		auth_verification: [],
		auth_rate_limit: [],
	};
}

function createTestAuth(
	db: MemoryDB,
	sent: SentOtp[],
	beforeDeleteUser?: (user: { id: string; email: string }) => Promise<void>,
) {
	let nextOtp = 100_000;
	return createBetterAuth({
		database: memoryAdapter(db),
		secret: TEST_SECRET,
		baseURL: "http://localhost:3000",
		sendVerificationOTP: async (message) => {
			sent.push(message);
		},
		generateOTP: () => String(nextOtp++),
		beforeDeleteUser,
	});
}

function authRequest(
	auth: ReturnType<typeof createTestAuth>,
	path: string,
	options: {
		body?: Record<string, unknown>;
		headers?: Record<string, string>;
		ip?: string;
		method?: "GET" | "POST";
	} = {},
) {
	const headers = new Headers(options.headers);
	if (options.body) {
		headers.set("content-type", "application/json");
	}
	headers.set("x-forwarded-for", options.ip ?? "203.0.113.1");
	return auth.handler(
		new Request(`http://localhost:3000/api/auth${path}`, {
			method: options.method ?? (options.body ? "POST" : "GET"),
			headers,
			body: options.body ? JSON.stringify(options.body) : undefined,
		}),
	);
}

async function sendOtp(auth: ReturnType<typeof createTestAuth>, email: string, ip?: string) {
	return authRequest(auth, "/email-otp/send-verification-otp", {
		body: { email, type: "sign-in" },
		ip,
	});
}

async function signIn(
	auth: ReturnType<typeof createTestAuth>,
	email: string,
	otp: string,
	ip?: string,
) {
	return authRequest(auth, "/sign-in/email-otp", {
		body: { email, otp },
		ip,
	});
}

describe("LandingOS Better Auth email OTP", () => {
	it("uses enumeration-safe sends for new and normalized existing emails", async () => {
		const db = createMemoryDb();
		const sent: SentOtp[] = [];
		const auth = createTestAuth(db, sent);

		const newResponse = await sendOtp(auth, "NOWY@Example.com");
		expect(newResponse.status).toBe(200);
		expect(await newResponse.json()).toEqual({ success: true });
		expect(sent).toHaveLength(1);
		expect(sent[0]).toMatchObject({
			email: "nowy@example.com",
			type: "sign-in",
		});
		expect(sent[0]?.otp).toMatch(/^\d{6}$/);

		const firstSignIn = await signIn(auth, "nowy@example.com", sent[0]?.otp ?? "");
		expect(firstSignIn.status).toBe(200);
		expect(db.auth_user?.[0]).toMatchObject({
			email: "nowy@example.com",
			marketingConsentGranted: false,
			role: "user",
		});

		const existingResponse = await sendOtp(auth, "NoWy@EXAMPLE.COM", "203.0.113.2");
		expect(existingResponse.status).toBe(200);
		expect(await existingResponse.json()).toEqual({ success: true });
		expect(sent).toHaveLength(2);
		expect(sent[1]?.email).toBe("nowy@example.com");
		expect(sent[1]?.otp).toMatch(/^\d{6}$/);
	});

	it("accepts only the latest unexpired code", async () => {
		const db = createMemoryDb();
		const sent: SentOtp[] = [];
		const auth = createTestAuth(db, sent);

		await sendOtp(auth, "latest@example.com");
		await sendOtp(auth, "latest@example.com", "203.0.113.2");
		const [superseded, latest] = sent;

		const oldResponse = await signIn(
			auth,
			"latest@example.com",
			superseded?.otp ?? "",
			"203.0.113.3",
		);
		expect(oldResponse.status).toBe(400);
		expect(db.auth_session).toHaveLength(0);

		const latestResponse = await signIn(
			auth,
			"latest@example.com",
			latest?.otp ?? "",
			"203.0.113.4",
		);
		expect(latestResponse.status).toBe(200);
		expect(db.auth_session).toHaveLength(1);
	});

	it("rejects wrong and expired codes without creating a session", async () => {
		const wrongDb = createMemoryDb();
		const wrongSent: SentOtp[] = [];
		const wrongAuth = createTestAuth(wrongDb, wrongSent);
		await sendOtp(wrongAuth, "wrong@example.com");
		expect((await signIn(wrongAuth, "wrong@example.com", "000000", "203.0.113.2")).status).toBe(
			400,
		);
		expect(wrongDb.auth_session).toHaveLength(0);

		const expiredDb = createMemoryDb();
		const expiredSent: SentOtp[] = [];
		const expiredAuth = createTestAuth(expiredDb, expiredSent);
		await sendOtp(expiredAuth, "expired@example.com");
		const verification = expiredDb.auth_verification?.[0];
		if (!verification) {
			throw new Error("Expected an OTP verification record");
		}
		verification.expiresAt = new Date(Date.now() - 1);
		expect(
			(await signIn(expiredAuth, "expired@example.com", expiredSent[0]?.otp ?? "", "203.0.113.3"))
				.status,
		).toBe(400);
		expect(expiredDb.auth_session).toHaveLength(0);
	});

	it("sets each OTP to expire after exactly five minutes", async () => {
		const db = createMemoryDb();
		const sent: SentOtp[] = [];
		const auth = createTestAuth(db, sent);
		const beforeSend = Date.now();
		await sendOtp(auth, "expiry-bound@example.com");
		const afterSend = Date.now();
		const verification = db.auth_verification?.[0];
		if (!verification) {
			throw new Error("Expected an OTP verification record");
		}
		expect(verification.expiresAt.getTime()).toBeGreaterThanOrEqual(beforeSend + 5 * 60 * 1000);
		expect(verification.expiresAt.getTime()).toBeLessThanOrEqual(afterSend + 5 * 60 * 1000);
	});

	it("invalidates a code after three failed attempts", async () => {
		const db = createMemoryDb();
		const sent: SentOtp[] = [];
		const auth = createTestAuth(db, sent);
		await sendOtp(auth, "attempts@example.com");

		for (const [index, ip] of ["203.0.113.2", "203.0.113.3", "203.0.113.4"].entries()) {
			const response = await signIn(auth, "attempts@example.com", `00000${index}`, ip);
			expect(response.status).toBe(400);
		}
		const fourth = await signIn(auth, "attempts@example.com", sent[0]?.otp ?? "", "203.0.113.5");
		expect(fourth.status).toBe(403);
		expect(db.auth_session).toHaveLength(0);
	});

	it("stores no plaintext OTP and writes no OTP to logs", async () => {
		const db = createMemoryDb();
		const sent: SentOtp[] = [];
		const logged: unknown[][] = [];
		const spies = (["debug", "error", "info", "log", "warn"] as const).map((method) =>
			vi.spyOn(console, method).mockImplementation((...args) => {
				logged.push(args);
			}),
		);
		try {
			const auth = createTestAuth(db, sent);
			await sendOtp(auth, "privacy@example.com");
			const otp = sent[0]?.otp ?? "";
			expect(otp).toMatch(/^\d{6}$/);
			expect(JSON.stringify(db.auth_verification)).not.toContain(otp);
			expect(JSON.stringify(logged)).not.toContain(otp);
		} finally {
			for (const spy of spies) {
				spy.mockRestore();
			}
		}
	});

	it("retrieves the same session with its cookie and returned bearer token", async () => {
		const db = createMemoryDb();
		const sent: SentOtp[] = [];
		const auth = createTestAuth(db, sent);
		await sendOtp(auth, "session@example.com");
		const response = await signIn(auth, "session@example.com", sent[0]?.otp ?? "");
		expect(response.status).toBe(200);
		const body = (await response.json()) as { token: string };
		const cookie = response.headers.get("set-cookie")?.split(";")[0];
		expect(cookie).toBeTruthy();
		expect(body.token).toBeTruthy();

		const cookieSession = await authRequest(auth, "/get-session", {
			headers: { cookie: cookie ?? "" },
		});
		const bearerSession = await authRequest(auth, "/get-session", {
			headers: { authorization: `Bearer ${body.token}` },
		});
		expect(cookieSession.status).toBe(200);
		expect(bearerSession.status).toBe(200);
		expect(await bearerSession.json()).toEqual(await cookieSession.json());
	});

	it("requires a session newer than five minutes and revokes cookie and Bearer access on deletion", async () => {
		const db = createMemoryDb();
		const sent: SentOtp[] = [];
		const beforeDeleteUser = vi.fn(async () => undefined);
		const auth = createTestAuth(db, sent, beforeDeleteUser);
		expect(ACCOUNT_DELETE_FRESH_AGE_SECONDS).toBe(5 * 60);
		await sendOtp(auth, "delete@example.com");
		const signedIn = await signIn(auth, "delete@example.com", sent[0]?.otp ?? "");
		const body = (await signedIn.json()) as { token: string; user: { id: string } };
		const cookie = signedIn.headers.get("set-cookie")?.split(";")[0] ?? "";

		const deleted = await authRequest(auth, "/delete-user", {
			body: {},
			headers: { cookie },
			ip: "203.0.113.2",
		});
		expect(deleted.status).toBe(200);
		expect(beforeDeleteUser).toHaveBeenCalledWith(
			expect.objectContaining({ id: body.user.id, email: "delete@example.com" }),
			expect.anything(),
		);
		expect(db.auth_user).toHaveLength(0);
		expect(db.auth_session).toHaveLength(0);
		const revokedCookie = await authRequest(auth, "/get-session", {
			headers: { cookie },
			ip: "203.0.113.3",
		});
		expect(revokedCookie.status).toBe(200);
		expect(await revokedCookie.json()).toBeNull();
		expect(
			await (
				await authRequest(auth, "/get-session", {
					headers: { authorization: `Bearer ${body.token}` },
					ip: "203.0.113.4",
				})
			).json(),
		).toBeNull();
	});

	it("fails closed at the exact freshness boundary without invoking deletion hooks", async () => {
		const db = createMemoryDb();
		const sent: SentOtp[] = [];
		const beforeDeleteUser = vi.fn(async () => undefined);
		const auth = createTestAuth(db, sent, beforeDeleteUser);
		await sendOtp(auth, "stale-delete@example.com");
		const signedIn = await signIn(auth, "stale-delete@example.com", sent[0]?.otp ?? "");
		const cookie = signedIn.headers.get("set-cookie")?.split(";")[0] ?? "";
		const session = db.auth_session?.[0];
		if (!session) throw new Error("Expected an authenticated session.");
		session.createdAt = new Date(Date.now() - ACCOUNT_DELETE_FRESH_AGE_SECONDS * 1_000);

		const rejected = await authRequest(auth, "/delete-user", {
			body: {},
			headers: { cookie },
			ip: "203.0.113.2",
		});
		expect(rejected.status).toBe(400);
		expect(beforeDeleteUser).not.toHaveBeenCalled();
		expect(db.auth_user).toHaveLength(1);
		expect(db.auth_session).toHaveLength(1);
	});

	it("enforces send and verify rate limits across fresh auth instances", async () => {
		const sendDb = createMemoryDb();
		const sendMessages: SentOtp[] = [];
		const firstSendAuth = createTestAuth(sendDb, sendMessages);
		for (let index = 0; index < 3; index += 1) {
			expect((await sendOtp(firstSendAuth, `rate-${index}@example.com`)).status).toBe(200);
		}
		const freshSendAuth = createTestAuth(sendDb, sendMessages);
		expect((await sendOtp(freshSendAuth, "rate-four@example.com")).status).toBe(429);
		expect(sendDb.auth_rate_limit?.length ?? 0).toBeGreaterThan(0);

		const verifyDb = createMemoryDb();
		const verifyMessages: SentOtp[] = [];
		const firstVerifyAuth = createTestAuth(verifyDb, verifyMessages);
		await sendOtp(firstVerifyAuth, "verify-rate@example.com", "203.0.113.20");
		for (let index = 0; index < 3; index += 1) {
			expect(
				(await signIn(firstVerifyAuth, "verify-rate@example.com", "000000", "203.0.113.21")).status,
			).toBe(400);
		}
		const freshVerifyAuth = createTestAuth(verifyDb, verifyMessages);
		expect(
			(
				await signIn(
					freshVerifyAuth,
					"verify-rate@example.com",
					verifyMessages[0]?.otp ?? "",
					"203.0.113.21",
				)
			).status,
		).toBe(429);
		expect(verifyDb.auth_session).toHaveLength(0);
	});

	it("disables password auth and does not expose role internals", async () => {
		const db = createMemoryDb();
		const sent: SentOtp[] = [];
		const auth = createTestAuth(db, sent);
		expect(
			(
				await authRequest(auth, "/sign-up/email", {
					body: {
						email: "password@example.com",
						name: "Password",
						password: "password",
					},
				})
			).status,
		).toBe(400);
		expect(db.auth_user).toHaveLength(0);
		expect(
			(
				await authRequest(auth, "/sign-in/email", {
					body: {
						email: "password@example.com",
						password: "password",
					},
				})
			).status,
		).toBe(400);
		expect(db.auth_session).toHaveLength(0);
		await sendOtp(auth, "public@example.com");
		const response = await signIn(auth, "public@example.com", sent[0]?.otp ?? "");
		const body = (await response.json()) as { user: Record<string, unknown> };
		expect(body.user).not.toHaveProperty("role");
		expect(body.user).not.toHaveProperty("pseudonym");
		expect(body.user).not.toHaveProperty("marketingConsentGranted");
		expect(body.user).not.toHaveProperty("marketingConsentPolicyVersion");
		expect(body.user).not.toHaveProperty("marketingConsentUpdatedAt");
	});
});
