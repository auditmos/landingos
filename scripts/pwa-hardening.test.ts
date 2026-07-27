import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const STARTER_HASHES = new Set([
	"c386396ec70db3608075b5fbfaac4ab1ccaa86ba05a68ab393ec551eb66c3e00",
	"9ea4f4da7050c0cc408926f6a39c253624e9babb1d43c7977cd821445a60b461",
]);

function pngDimensions(path: string) {
	const bytes = readFileSync(path);
	expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
	return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes };
}

describe("LandingOS PWA hardening", () => {
	it("publishes the exact Polish standalone manifest contract", () => {
		const manifest = JSON.parse(
			readFileSync("apps/user-application/public/manifest.json", "utf8"),
		) as {
			name: string;
			short_name: string;
			description: string;
			lang: string;
			start_url: string;
			scope: string;
			display: string;
			theme_color: string;
			background_color: string;
			icons: Array<{ src: string; sizes: string; type: string; purpose?: string }>;
		};
		expect(manifest).toMatchObject({
			name: "LandingOS",
			short_name: "LandingOS",
			lang: "pl",
			start_url: "/",
			scope: "/",
			display: "standalone",
		});
		expect(manifest.description.length).toBeGreaterThan(0);
		expect(manifest.theme_color).toMatch(/^#[0-9a-f]{6}$/i);
		expect(manifest.background_color).toMatch(/^#[0-9a-f]{6}$/i);
		expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
		for (const icon of manifest.icons) {
			expect(icon.src).toMatch(/^\//);
			expect(["192x192", "512x512"]).toContain(icon.sizes);
			expect(icon.type).toBe("image/png");
			if (icon.purpose) expect(["any", "maskable"]).toContain(icon.purpose);
		}
		expect(manifest.icons).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ src: "/icon-192.png", sizes: "192x192" }),
				expect.objectContaining({ src: "/icon-512.png", sizes: "512x512" }),
				expect.objectContaining({
					src: "/icon-maskable-512.png",
					sizes: "512x512",
					purpose: "maskable",
				}),
			]),
		);
	});

	it("ships correctly sized non-starter PNG assets", () => {
		for (const [path, size] of [
			["apps/user-application/public/icon-192.png", 192],
			["apps/user-application/public/icon-512.png", 512],
			["apps/user-application/public/icon-maskable-512.png", 512],
		] as const) {
			const image = pngDimensions(path);
			expect([image.width, image.height]).toEqual([size, size]);
			expect(STARTER_HASHES).not.toContain(createHash("sha256").update(image.bytes).digest("hex"));
		}
		for (const starterIcon of [
			"apps/user-application/public/logo192.png",
			"apps/user-application/public/logo512.png",
			"apps/user-application/public/favicon.ico",
		]) {
			expect(existsSync(starterIcon), starterIcon).toBe(false);
		}
	});

	it("links the manifest and Polish metadata from every SSR document", () => {
		const root = readFileSync("apps/user-application/src/routes/__root.tsx", "utf8");
		expect(root).toContain('<html lang="pl">');
		expect(root).toContain('{ rel: "manifest", href: "/manifest.json" }');
		expect(root).toContain('href: "/icon-192.png"');
		expect(root).toContain("LandingOS");
		expect(root).not.toContain("TanStack Start |");
	});

	it("does not register a service worker in the MVP", () => {
		const sourceFiles = [
			"apps/user-application/src/routes/__root.tsx",
			"apps/user-application/src/router.tsx",
			"apps/user-application/src/start.tsx",
			"apps/user-application/src/server.ts",
		];
		for (const sourceFile of sourceFiles) {
			const source = readFileSync(sourceFile, "utf8");
			expect(source).not.toMatch(/serviceWorker\s*\.\s*register|navigator\s*\.\s*serviceWorker/i);
		}
	});

	it("provides non-interactive E2E and native smoke commands without secrets", () => {
		const rootPackage = JSON.parse(readFileSync("package.json", "utf8")) as {
			scripts: Record<string, string>;
		};
		expect(rootPackage.scripts["test:e2e"]).toContain("scripts/e2e-runner.ts");
		expect(rootPackage.scripts["smoke:native-api"]).toContain("scripts/native-api-smoke.ts");
		for (const path of [
			"scripts/e2e-runner.ts",
			"scripts/e2e-fixture-server.ts",
			"scripts/native-api-smoke.ts",
		]) {
			expect(existsSync(path), path).toBe(true);
		}
		const e2e = readFileSync("scripts/e2e-runner.ts", "utf8");
		expect(e2e).toContain("390");
		expect(e2e).toContain("844");
		expect(e2e).toContain("1440");
		expect(e2e).toContain("900");
		expect(e2e).toContain("5_000");
		expect(e2e).toContain("agent-browser");
		expect(e2e).not.toMatch(/\b(?:password|secret|api[_-]?key)\s*[:=]\s*["'][^"']+/i);
	});
});
