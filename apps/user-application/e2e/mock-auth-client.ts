import { useSyncExternalStore } from "react";

const STORAGE_KEY = "landingos.e2e-session";
const API_URL = import.meta.env.VITE_DATA_SERVICE_URL || "http://127.0.0.1:8789";
const listeners = new Set<() => void>();
let cachedSessionRaw: string | null | undefined;
let cachedSession: TestSession | null = null;

type TestSession = {
	user: { id: string; email: string; name: string | null; image: null; role: string };
	session: { token: string };
};

function currentSession(): TestSession | null {
	if (typeof window === "undefined") return null;
	const value = localStorage.getItem(STORAGE_KEY);
	if (value === cachedSessionRaw) return cachedSession;
	cachedSessionRaw = value;
	cachedSession = value ? (JSON.parse(value) as TestSession) : null;
	return cachedSession;
}

function notify() {
	for (const listener of listeners) listener();
}

function useSession() {
	const data = useSyncExternalStore(
		(listener) => {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		currentSession,
		() => null,
	);
	return { data, isPending: false, error: null };
}

async function post(path: string, input: unknown) {
	return fetch(`${API_URL}${path}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		credentials: "include",
		body: JSON.stringify(input),
	});
}

export const authClient = {
	useSession,
	emailOtp: {
		sendVerificationOtp: async (input: { email: string; type: string }) => {
			const response = await post("/test-auth/request", input);
			return response.ok ? { data: { success: true }, error: null } : { data: null, error: {} };
		},
	},
	signIn: {
		emailOtp: async (input: { email: string; otp: string }) => {
			const response = await post("/test-auth/verify", input);
			if (!response.ok) return { data: null, error: {} };
			const payload = (await response.json()) as TestSession & { token: string };
			localStorage.setItem(
				STORAGE_KEY,
				JSON.stringify({ user: payload.user, session: payload.session }),
			);
			notify();
			return { data: payload, error: null };
		},
	},
	signOut: async () => {
		await post("/test-auth/signout", {});
		localStorage.removeItem(STORAGE_KEY);
		notify();
		return { data: { success: true }, error: null };
	},
};
