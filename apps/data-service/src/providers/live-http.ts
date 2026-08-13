import { type ProviderErrorSignal, readProviderErrorSignal } from "./diagnostics";
import type { ProviderResult } from "./types";

export type ProviderFetch = (input: string, init?: RequestInit) => Promise<Response>;

type ProviderHttpResult<T> = Exclude<ProviderResult<T>, { status: "ambiguous" }>;

// A documented error envelope is small; anything larger is treated as unreadable
// rather than buffered, so a hostile or oversized body can never be retained.
const MAX_ERROR_BODY_BYTES = 8_192;

function isAbortError(error: unknown): boolean {
	return (
		(typeof DOMException !== "undefined" &&
			error instanceof DOMException &&
			error.name === "AbortError") ||
		(typeof error === "object" && error !== null && "name" in error && error.name === "AbortError")
	);
}

/**
 * Extracts a documented, allowlisted provider error code. The parsed body is discarded
 * immediately: only the normalized signal survives, so no provider message, payload, or
 * credential can travel further.
 */
async function documentedErrorSignal(response: Response): Promise<ProviderErrorSignal | undefined> {
	try {
		const body = await response.clone().text();
		if (body.length === 0 || body.length > MAX_ERROR_BODY_BYTES) return undefined;
		return readProviderErrorSignal(JSON.parse(body));
	} catch {
		return undefined;
	}
}

async function failureResult<T>(response: Response): Promise<ProviderHttpResult<T>> {
	const documented = await documentedErrorSignal(response);
	if (response.status === 429) {
		return {
			status: "rate_limited",
			retryable: true,
			...(documented ? { signal: documented } : {}),
		};
	}
	// An access denial with no documented code stays explicitly unattributed.
	const signal =
		documented ??
		(response.status === 401 || response.status === 403
			? ("unrecognized_access_denied" as const)
			: undefined);
	return {
		status: "provider_error",
		httpStatus: response.status,
		retryable: response.status >= 500,
		...(signal ? { signal } : {}),
	};
}

export async function requestProviderJson<T = unknown>(
	fetchImpl: ProviderFetch,
	url: string,
	init: RequestInit = {},
	timeoutMs = 10_000,
): Promise<ProviderHttpResult<T>> {
	const abortController = new AbortController();
	const timeout = setTimeout(() => abortController.abort(), timeoutMs);
	try {
		const response = await fetchImpl(url, {
			...init,
			signal: abortController.signal,
		});
		if (!response.ok) {
			return failureResult<T>(response);
		}
		let parsed: unknown;
		try {
			parsed = await response.json();
		} catch {
			return { status: "malformed_response" };
		}
		// Aviationstack answers HTTP 200 with a documented error envelope for several
		// plan and credential failures, so a 2xx is not proof of a usable payload.
		const successBodySignal = readProviderErrorSignal(parsed);
		if (successBodySignal) {
			return {
				status: "provider_error",
				httpStatus: response.status,
				retryable: false,
				signal: successBodySignal,
			};
		}
		return { status: "success", value: parsed as T };
	} catch (error) {
		if (isAbortError(error)) {
			return { status: "timeout", retryable: true };
		}
		return {
			status: "provider_error",
			httpStatus: 0,
			retryable: true,
		};
	} finally {
		clearTimeout(timeout);
	}
}
