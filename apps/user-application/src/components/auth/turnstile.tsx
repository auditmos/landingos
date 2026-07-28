import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// Minimal typings for the Cloudflare Turnstile browser API. We load the script
// ourselves (explicit render) instead of pulling in a wrapper dependency.
interface TurnstileRenderOptions {
	sitekey: string;
	callback?: (token: string) => void;
	"error-callback"?: () => void;
	"expired-callback"?: () => void;
	"timeout-callback"?: () => void;
	theme?: "auto" | "light" | "dark";
	action?: string;
	appearance?: "always" | "execute" | "interaction-only";
	size?: "normal" | "flexible" | "compact";
}

interface TurnstileApi {
	render: (container: HTMLElement | string, options: TurnstileRenderOptions) => string;
	reset: (widgetId?: string) => void;
	remove: (widgetId?: string) => void;
	getResponse: (widgetId?: string) => string | undefined;
}

declare global {
	interface Window {
		turnstile?: TurnstileApi;
	}
}

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

// One shared script load per document, memoized so many widgets reuse it.
let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
	if (typeof window === "undefined" || typeof document === "undefined") {
		return Promise.reject(new Error("Turnstile is browser-only"));
	}
	if (window.turnstile) {
		return Promise.resolve(window.turnstile);
	}
	if (scriptPromise) {
		return scriptPromise;
	}
	scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
		const settle = () =>
			window.turnstile
				? resolve(window.turnstile)
				: reject(new Error("Turnstile script loaded without global"));
		const existing = document.querySelector<HTMLScriptElement>("script[data-turnstile]");
		if (existing) {
			existing.addEventListener("load", settle);
			existing.addEventListener("error", () => reject(new Error("Failed to load Turnstile")));
			if (window.turnstile) resolve(window.turnstile);
			return;
		}
		const script = document.createElement("script");
		script.src = SCRIPT_SRC;
		script.async = true;
		script.defer = true;
		script.dataset.turnstile = "true";
		script.addEventListener("load", settle);
		script.addEventListener("error", () => {
			scriptPromise = null;
			reject(new Error("Failed to load Turnstile"));
		});
		document.head.appendChild(script);
	});
	return scriptPromise;
}

export interface TurnstileHandle {
	/** Discards the current token and re-runs the challenge (tokens are single-use). */
	reset: () => void;
}

interface TurnstileProps {
	siteKey: string;
	/** Fires with a fresh token once the visitor passes the challenge. */
	onVerify: (token: string) => void;
	/** The token expired (Turnstile tokens live ~5 minutes) — clear it in the parent. */
	onExpire?: () => void;
	/** The challenge failed or the script could not load. */
	onError?: () => void;
	/** Optional Turnstile action label, surfaced in the Cloudflare dashboard. */
	action?: string;
	className?: string;
}

/**
 * Renders a Cloudflare Turnstile widget and reports its token. Purely a token
 * source — verification happens server-side (Better Auth captcha plugin for the
 * OTP flow, the data-service guard for the flight lookup).
 */
export const Turnstile = forwardRef<TurnstileHandle, TurnstileProps>(function Turnstile(
	{ siteKey, onVerify, onExpire, onError, action, className },
	ref,
) {
	const containerRef = useRef<HTMLDivElement>(null);
	const apiRef = useRef<TurnstileApi | null>(null);
	const widgetIdRef = useRef<string | null>(null);
	// Hold the latest callbacks so the widget is not re-created on every render.
	const handlersRef = useRef({ onVerify, onExpire, onError });
	handlersRef.current = { onVerify, onExpire, onError };

	useImperativeHandle(
		ref,
		() => ({
			reset: () => {
				if (apiRef.current && widgetIdRef.current) {
					apiRef.current.reset(widgetIdRef.current);
				}
			},
		}),
		[],
	);

	useEffect(() => {
		let cancelled = false;
		loadTurnstile()
			.then((api) => {
				if (cancelled || !containerRef.current || widgetIdRef.current) return;
				apiRef.current = api;
				widgetIdRef.current = api.render(containerRef.current, {
					sitekey: siteKey,
					theme: "auto",
					action,
					callback: (token) => handlersRef.current.onVerify(token),
					"expired-callback": () => handlersRef.current.onExpire?.(),
					"error-callback": () => handlersRef.current.onError?.(),
				});
			})
			.catch(() => handlersRef.current.onError?.());
		return () => {
			cancelled = true;
			if (apiRef.current && widgetIdRef.current) {
				apiRef.current.remove(widgetIdRef.current);
				widgetIdRef.current = null;
			}
		};
	}, [siteKey, action]);

	return <div ref={containerRef} className={className} />;
});
