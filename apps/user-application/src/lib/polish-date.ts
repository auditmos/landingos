const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const POLISH_DATE_PATTERN = /^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})\s*$/;
const LOCAL_DATE_TIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;
const POLISH_DATE_TIME_PATTERN =
	/^\s*(\d{1,2})[./-](\d{1,2})[./-](\d{4})\s*,?\s*(\d{1,2}):(\d{2})\s*$/;

function validDate(year: number, month: number, day: number): boolean {
	const candidate = new Date(Date.UTC(year, month - 1, day));
	return (
		candidate.getUTCFullYear() === year &&
		candidate.getUTCMonth() + 1 === month &&
		candidate.getUTCDate() === day
	);
}

function pad(value: number): string {
	return String(value).padStart(2, "0");
}

export function currentDateInPoland(reference = new Date()): string {
	const parts = new Intl.DateTimeFormat("en-GB", {
		timeZone: "Europe/Warsaw",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(reference);
	const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return `${values.year}-${values.month}-${values.day}`;
}

export function parsePolishDateInput(value: string): string | null {
	const match = POLISH_DATE_PATTERN.exec(value);
	if (!match) return null;
	const [, dayValue, monthValue, yearValue] = match;
	const day = Number(dayValue);
	const month = Number(monthValue);
	const year = Number(yearValue);
	if (!validDate(year, month, day)) return null;
	return `${yearValue}-${pad(month)}-${pad(day)}`;
}

export function formatPolishDateInput(value: string): string {
	const match = ISO_DATE_PATTERN.exec(value);
	if (!match) return "";
	const [, year, month, day] = match;
	if (!validDate(Number(year), Number(month), Number(day))) return "";
	return `${day}.${month}.${year}`;
}

export function parsePolishDateTimeInput(value: string): string | null {
	const match = POLISH_DATE_TIME_PATTERN.exec(value);
	if (!match) return null;
	const [, dayValue, monthValue, yearValue, hourValue, minuteValue] = match;
	const day = Number(dayValue);
	const month = Number(monthValue);
	const year = Number(yearValue);
	const hour = Number(hourValue);
	const minute = Number(minuteValue);
	if (!validDate(year, month, day) || hour > 23 || minute > 59) return null;
	return `${yearValue}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`;
}

export function formatPolishDateTimeInput(value: string): string {
	const match = LOCAL_DATE_TIME_PATTERN.exec(value);
	if (!match) return "";
	const [, year, month, day, hour, minute] = match;
	if (
		!validDate(Number(year), Number(month), Number(day)) ||
		Number(hour) > 23 ||
		Number(minute) > 59
	) {
		return "";
	}
	return `${day}.${month}.${year}, ${hour}:${minute}`;
}
