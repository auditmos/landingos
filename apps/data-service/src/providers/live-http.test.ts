import { describe, expect, it } from "vitest";
import { requestProviderJson } from "./live-http";

describe("live provider HTTP boundary", () => {
	it("normalizes timeout, 429, 500, and malformed JSON without throwing", async () => {
		const rateLimited = await requestProviderJson(
			async () => new Response("", { status: 429 }),
			"https://provider.invalid/rate-limit",
		);
		const providerError = await requestProviderJson(
			async () => new Response("", { status: 500 }),
			"https://provider.invalid/error",
		);
		const malformed = await requestProviderJson(
			async () =>
				new Response("{", {
					status: 200,
					headers: { "content-type": "application/json" },
				}),
			"https://provider.invalid/malformed",
		);
		const timeoutStartedAt = performance.now();
		const timeout = await requestProviderJson(
			(_input, init) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () => {
						reject(new DOMException("aborted", "AbortError"));
					});
				}),
			"https://provider.invalid/timeout",
			{},
			1,
		);
		const timeoutElapsedMs = performance.now() - timeoutStartedAt;

		expect(rateLimited).toEqual({
			status: "rate_limited",
			retryable: true,
		});
		expect(providerError).toEqual({
			status: "provider_error",
			httpStatus: 500,
			retryable: true,
		});
		expect(malformed).toEqual({ status: "malformed_response" });
		expect(timeout).toEqual({ status: "timeout", retryable: true });
		expect(timeoutElapsedMs).toBeLessThan(100);
	});
});
