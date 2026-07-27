import type { ProviderResult } from "./types";

export type ProviderFetch = (input: string, init?: RequestInit) => Promise<Response>;

type ProviderHttpResult<T> = Exclude<ProviderResult<T>, { status: "ambiguous" }>;

function isAbortError(error: unknown): boolean {
	return (
		(typeof DOMException !== "undefined" &&
			error instanceof DOMException &&
			error.name === "AbortError") ||
		(typeof error === "object" && error !== null && "name" in error && error.name === "AbortError")
	);
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
		if (response.status === 429) {
			return { status: "rate_limited", retryable: true };
		}
		if (!response.ok) {
			return {
				status: "provider_error",
				httpStatus: response.status,
				retryable: response.status >= 500,
			};
		}
		try {
			return {
				status: "success",
				value: (await response.json()) as T,
			};
		} catch {
			return { status: "malformed_response" };
		}
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
