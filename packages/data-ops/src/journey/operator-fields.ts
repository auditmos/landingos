import { APPROVED_JOURNEY_EXTERNAL_HOSTS } from "./external-links";
import type { TransferCatalogEditableField } from "./operator-schema";

/** Repeated verbatim in every field's help so the draft/publish contract is unmissable. */
export const OPERATOR_PUBLICATION_SENTENCE =
	"Wymagane do publikacji; szkic może pozostać niekompletny.";

const APPROVED_HOSTS = APPROVED_JOURNEY_EXTERNAL_HOSTS.join(", ");

export type OperatorCatalogFieldKind = "text" | "url" | "integer" | "datetime";

export interface OperatorCatalogFieldDefinition {
	name: TransferCatalogEditableField;
	label: string;
	kind: OperatorCatalogFieldKind;
	/** Unit or format shown to the operator; absent for plain text fields. */
	unit?: string;
	example: string;
	/** What the value means, plus a valid example. */
	meaning: string;
	/** Unit, format, or zero-value semantics; omitted where meaningless. */
	unitNote?: string;
	/** The documented consumer of this value. */
	downstreamUse: string;
	requiredForPublication: true;
	requiredMessage: string;
	/** Composed from the parts above — never written twice. */
	help: string;
}

type FieldDraft = Omit<OperatorCatalogFieldDefinition, "help" | "requiredForPublication">;

function define(draft: FieldDraft): OperatorCatalogFieldDefinition {
	return {
		...draft,
		requiredForPublication: true,
		help: [draft.meaning, draft.unitNote, draft.downstreamUse, OPERATOR_PUBLICATION_SENTENCE]
			.filter((part): part is string => Boolean(part))
			.join(" "),
	};
}

/**
 * The single definition of the 13 publication-required editable fields. Labels, help
 * copy, input format, and publication messages all come from here — the operator
 * console and the publish validator must not keep their own lists.
 */
export const OPERATOR_CATALOG_FIELDS = [
	define({
		name: "operatorName",
		label: "Nazwa operatora",
		kind: "text",
		example: "Terravision",
		meaning: 'Przewoźnik odpowiedzialny za kurs, np. "Terravision".',
		downstreamUse:
			"Podróżny widzi tę nazwę w źródłach trasy, przy alternatywie ręcznej i na przycisku zakupu; to nie jest nazwa usługi — konkretną linię wpisz w polu obok.",
		requiredMessage: "Uzupełnij nazwę operatora.",
	}),
	define({
		name: "serviceName",
		label: "Nazwa usługi",
		kind: "text",
		example: "BGY → Milano Centrale",
		meaning: 'Konkretna linia lub kurs tego przewoźnika, np. "BGY → Milano Centrale".',
		downstreamUse:
			"Trafia obok nazwy operatora do źródeł trasy podróżnego i do alternatywy ręcznej; to nie jest nazwa przewoźnika — przewoźnika wpisz w polu obok.",
		requiredMessage: "Uzupełnij nazwę usługi.",
	}),
	define({
		name: "destinationStopCode",
		label: "Kod przystanku docelowego",
		kind: "text",
		example: "milano-centrale",
		meaning: 'Stabilny identyfikator przystanku, małe litery i myślniki, np. "milano-centrale".',
		downstreamUse:
			"Służy jako klucz łączenia wpisu z trasą dostawcy i pokazuje się w alternatywie ręcznej; przy braku dopasowania kodu porównujemy znormalizowaną nazwę przystanku — samej nazwy nie wpisuj tutaj.",
		requiredMessage: "Uzupełnij kod przystanku docelowego.",
	}),
	define({
		name: "destinationStopName",
		label: "Nazwa przystanku docelowego",
		kind: "text",
		example: "Milan Centrale Piazza Luigi di Savoia",
		meaning:
			'Nazwa przystanku dokładnie tak, jak pokazuje ją dostawca tras w sekcji „Etapy trasy” podróżnego, np. "Milan Centrale Piazza Luigi di Savoia".',
		downstreamUse:
			"Jest etykietą przystanku w alternatywie ręcznej i zapasowym dopasowaniem trasy, gdy kod nie pasuje — dopasowanie jest dosłowne, więc skopiuj nazwę z etapów trasy co do znaku; stabilny identyfikator wpisz w polu obok.",
		requiredMessage: "Uzupełnij nazwę przystanku docelowego.",
	}),
	define({
		name: "durationMinutes",
		label: "Czas przejazdu (min)",
		kind: "integer",
		unit: "minut",
		example: "50",
		meaning: "Ręcznie zweryfikowany czas przejazdu z BGY do przystanku, np. 50.",
		unitNote: "Podawaj w pełnych minutach, większych od zera — zero jest tu niedozwolone.",
		downstreamUse:
			"Pokazujemy go wyłącznie w alternatywie ręcznej; nigdy nie nadpisuje czasu trasy wyliczonego przez dostawcę.",
		requiredMessage: "Uzupełnij czas trwania w minutach.",
	}),
	define({
		name: "transferCount",
		label: "Liczba przesiadek",
		kind: "integer",
		unit: "przesiadek",
		example: "0",
		meaning: "Liczba przesiadek na odcinku BGY → przystanek, np. 0 dla kursu bezpośredniego.",
		unitNote: 'Zero znaczy "bez przesiadek", a nie "brak danych".',
		downstreamUse:
			"Pokazujemy ją wyłącznie w alternatywie ręcznej; nigdy nie zastępuje liczby przesiadek z trasy dostawcy.",
		requiredMessage: "Uzupełnij liczbę przesiadek.",
	}),
	define({
		name: "walkingMinutes",
		label: "Pieszo (min)",
		kind: "integer",
		unit: "minut",
		example: "5",
		meaning: "Czas dojścia pieszo do przystanku i z przystanku, np. 5.",
		unitNote:
			'To minuty, nie metry — dystans wpisz w polu "Pieszo (m)". Zero znaczy "bez dojścia pieszo".',
		downstreamUse:
			"Widoczny tylko w alternatywie ręcznej; nigdy nie nadpisuje czasu marszu z trasy dostawcy.",
		requiredMessage: "Uzupełnij liczbę minut pieszo.",
	}),
	define({
		name: "walkingMeters",
		label: "Pieszo (m)",
		kind: "integer",
		unit: "metrów",
		example: "300",
		meaning:
			"Dystans dojścia pieszo do przystanku i z przystanku, podany w liczbie metrów, np. 300.",
		unitNote:
			'To metry, nie minuty — czas wpisz w polu "Pieszo (min)". Zero znaczy "bez dojścia pieszo".',
		downstreamUse:
			"Widoczny tylko w alternatywie ręcznej; nigdy nie nadpisuje dystansu marszu z trasy dostawcy.",
		requiredMessage: "Uzupełnij liczbę metrów pieszo.",
	}),
	define({
		name: "sourceUrl",
		label: "Adres źródła",
		kind: "url",
		example: "https://www.milanbergamoairport.it/en/bus/",
		meaning:
			"Strona, na której dane kursu zostały zweryfikowane, np. https://www.milanbergamoairport.it/en/bus/.",
		unitNote: `Wymagany HTTPS i host z listy zatwierdzonych: ${APPROVED_HOSTS}.`,
		downstreamUse:
			"Podróżny dostaje ten odnośnik w sekcji źródeł trasy i przy alternatywie ręcznej; to nie jest miejsce zakupu biletu.",
		requiredMessage: "Uzupełnij adres źródła.",
	}),
	define({
		name: "checkedAt",
		label: "Data kontroli",
		kind: "datetime",
		unit: "UTC",
		example: "2026-08-01",
		meaning: "Moment ostatniego ręcznego sprawdzenia danych, np. 2026-08-01.",
		unitNote: "Zapisujemy go w UTC; data z przyszłości jest odrzucana.",
		downstreamUse:
			"Decyduje o świeżości wpisu, o kolejności wariantów i o ostrzeżeniu, gdy dane się zestarzeją.",
		requiredMessage: "Uzupełnij datę kontroli.",
	}),
	define({
		name: "costMinorMin",
		label: "Cena minimalna (centy EUR)",
		kind: "integer",
		unit: "centów EUR",
		example: "1000",
		meaning: "Najniższa cena biletu na tym kursie, np. 1000.",
		unitNote: "Podawaj w centach euro: 1000 to 10,00 €. Zero znaczy przejazd bezpłatny.",
		downstreamUse:
			"Uzupełnia cenę wariantu, gdy dostawca jej nie zna, i pokazuje się w alternatywie ręcznej.",
		requiredMessage: "Uzupełnij cenę minimalną.",
	}),
	define({
		name: "costMinorMax",
		label: "Cena maksymalna (centy EUR)",
		kind: "integer",
		unit: "centów EUR",
		example: "1200",
		meaning: "Najwyższa cena biletu na tym kursie, np. 1200.",
		unitNote:
			"Podawaj w centach euro: 1200 to 12,00 €. Nie może być niższa od ceny minimalnej; zero znaczy przejazd bezpłatny.",
		downstreamUse: "Wyznacza górną granicę widełek ceny pokazywanych podróżnemu.",
		requiredMessage: "Uzupełnij cenę maksymalną.",
	}),
	define({
		name: "purchaseUrl",
		label: "Łącze zakupu",
		kind: "url",
		example: "https://www.terravision.eu/airport_transfer/",
		meaning:
			"Zewnętrzna strona sprzedaży biletu, np. https://www.terravision.eu/airport_transfer/.",
		unitNote: `Wymagany HTTPS i host z listy zatwierdzonych: ${APPROVED_HOSTS}.`,
		downstreamUse:
			'Zasila przycisk "Sprawdź u ..." przy wariancie i przy alternatywie ręcznej; to nie jest adres źródła weryfikacji, a LandingOS nie prowadzi sprzedaży.',
		requiredMessage: "Uzupełnij łącze zakupu.",
	}),
] as const satisfies readonly OperatorCatalogFieldDefinition[];

export const OPERATOR_CATALOG_FIELD_BY_NAME = Object.fromEntries(
	OPERATOR_CATALOG_FIELDS.map((field) => [field.name, field]),
) as Record<TransferCatalogEditableField, OperatorCatalogFieldDefinition>;
