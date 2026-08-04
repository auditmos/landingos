import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const appRoot = resolve(import.meta.dirname, "..");
const readAppFile = (path: string) => readFileSync(resolve(appRoot, path), "utf8");

describe("temporary apex holding page", () => {
	it("binds only the apex hostname", () => {
		const config = readAppFile("wrangler.jsonc");

		expect(config).toContain('"name": "landingos-holding"');
		expect(config).toContain('"pattern": "landingos.app"');
		expect(config).toContain('"custom_domain": true');
		expect(config).not.toContain("staging.landingos.app");
	});

	it("publishes Polish teaser copy without data collection or staging access", () => {
		const html = readAppFile("public/index.html");

		expect(html).toContain('<html lang="pl">');
		expect(html).toContain("Spokojniejszy start w Mediolanie");
		expect(html).toContain("Premiera wkrótce");
		expect(html).toContain('rel="canonical" href="https://landingos.app/"');
		expect(html).not.toMatch(/<form|<script|staging\.landingos\.app|analytics/);
	});

	it("ships restrictive security headers for every asset", () => {
		const headers = readAppFile("public/_headers");

		expect(headers).toContain("Content-Security-Policy: default-src 'self'");
		expect(headers).toContain("frame-ancestors 'none'");
		expect(headers).toContain("X-Content-Type-Options: nosniff");
		expect(headers).toContain("Permissions-Policy: camera=(), microphone=(), geolocation=()");
	});
});
