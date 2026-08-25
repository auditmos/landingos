import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

/** Never carries product source — walking it would only be slow and noisy. */
const EXCLUDED_DIRECTORIES = ["node_modules", "dist", ".wrangler"] as const;

export interface ScannedFile {
	/** Repo-relative, so allowlists and failure messages name the same thing. */
	path: string;
	source: string;
}

function walk(absolute: string): string[] {
	if (!statSync(absolute).isDirectory()) return [absolute];
	return readdirSync(absolute).flatMap((entry) =>
		(EXCLUDED_DIRECTORIES as readonly string[]).includes(entry) ? [] : walk(join(absolute, entry)),
	);
}

/**
 * Reads every file under `targets` (repo-relative directories or single files).
 *
 * Boundary tests scan *directories* rather than pinned file lists so a new file
 * handling the same domain data is swept in automatically — a pinned list is
 * silently incomplete the moment someone adds a file next to the ones it names.
 * A file that legitimately carries a forbidden token earns an explicit
 * `allowlist` entry; nothing is ever dropped by accident.
 */
export function scanFiles(
	targets: readonly string[],
	options: {
		include?: (path: string) => boolean;
		allowlist?: readonly string[];
	} = {},
): ScannedFile[] {
	const allowed = new Set(options.allowlist ?? []);
	const seen = new Set<string>();
	const files: ScannedFile[] = [];
	for (const target of targets) {
		for (const absolute of walk(resolve(ROOT, target))) {
			const path = relative(ROOT, absolute);
			if (seen.has(path) || allowed.has(path)) continue;
			if (options.include && !options.include(path)) continue;
			seen.add(path);
			files.push({ path, source: readFileSync(absolute, "utf8") });
		}
	}
	return files;
}

/** Reads one repo-relative file — the single-file half of the same reader. */
export function source(path: string): string {
	return readFileSync(resolve(ROOT, path), "utf8");
}

/** Concatenated sources, for assertions that read the whole surface at once. */
export function scannedSource(files: readonly ScannedFile[]): string {
	return files.map((file) => file.source).join("\n");
}

/** Repo-relative paths whose source matches `pattern` — the leak report. */
export function matching(files: readonly ScannedFile[], pattern: RegExp): string[] {
	return files.filter((file) => pattern.test(file.source)).map((file) => file.path);
}

/** Excludes test files, which describe forbidden values in order to reject them. */
export function isRuntimeSource(path: string): boolean {
	return /\.(ts|tsx)$/.test(path) && !/\.test\.(ts|tsx)$/.test(path);
}
