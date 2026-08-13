import { z } from "zod";

export const APPROVED_JOURNEY_EXTERNAL_HOSTS = [
	"maps.google.com",
	"www.airportbusexpress.it",
	"www.flixbus.com",
	"www.google.com",
	"www.milanbergamoairport.it",
	"www.terravision.eu",
] as const;

const APPROVED_EXTERNAL_HOSTS = new Set<string>(APPROVED_JOURNEY_EXTERNAL_HOSTS);

const REDIRECT_PARAMETERS = new Set([
	"continue",
	"next",
	"redirect",
	"redirect_uri",
	"target",
	"url",
]);

export type JourneyExternalUrlInspection =
	| { ok: true; url: string }
	| {
			ok: false;
			reason:
				| "invalid_url"
				| "https_required"
				| "credentials_not_allowed"
				| "hostname_not_approved"
				| "unsafe_redirect";
			message: string;
			hostname?: string;
	  };

export function inspectJourneyExternalUrl(rawUrl: string, depth = 0): JourneyExternalUrlInspection {
	if (depth > 2) {
		return {
			ok: false,
			reason: "unsafe_redirect",
			message: "Adres zawiera niebezpieczne przekierowanie poza zatwierdzoną listę.",
		};
	}
	let url: URL;
	try {
		url = new URL(rawUrl);
	} catch {
		return { ok: false, reason: "invalid_url", message: "Podaj prawidłowy adres URL." };
	}
	if (url.protocol !== "https:") {
		return {
			ok: false,
			reason: "https_required",
			message: "Adres musi używać protokołu HTTPS.",
		};
	}
	if (url.username.length > 0 || url.password.length > 0) {
		return {
			ok: false,
			reason: "credentials_not_allowed",
			message: "Adres nie może zawierać nazwy użytkownika ani hasła.",
		};
	}
	const hostname = url.hostname.toLowerCase();
	if (!APPROVED_EXTERNAL_HOSTS.has(hostname)) {
		return {
			ok: false,
			reason: "hostname_not_approved",
			message: `Host „${hostname}” nie jest zatwierdzony.`,
			hostname,
		};
	}
	for (const [parameter, redirect] of url.searchParams) {
		if (
			REDIRECT_PARAMETERS.has(parameter.toLowerCase()) &&
			!inspectJourneyExternalUrl(redirect, depth + 1).ok
		) {
			return {
				ok: false,
				reason: "unsafe_redirect",
				message: "Adres zawiera niebezpieczne przekierowanie poza zatwierdzoną listę.",
			};
		}
	}
	return { ok: true, url: rawUrl };
}

export function sanitizeJourneyExternalUrl(rawUrl: string, depth = 0): string | null {
	const inspection = inspectJourneyExternalUrl(rawUrl, depth);
	return inspection.ok ? inspection.url : null;
}

export const ApprovedJourneyExternalUrlSchema = z
	.string()
	.refine(
		(value) => sanitizeJourneyExternalUrl(value) !== null,
		"Dozwolony jest wyłącznie zatwierdzony adres HTTPS.",
	);
