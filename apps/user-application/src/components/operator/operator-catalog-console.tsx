import {
	DEFAULT_TRANSFER_CATALOG_FRESHNESS_DAYS,
	OPERATOR_CATALOG_FIELDS,
	type OperatorCatalogFieldDefinition,
	type TransferCatalogDraftInput,
	type TransferCatalogEditableField,
	type TransferCatalogRecord,
} from "@repo/data-ops/journey";
import { useForm, useStore } from "@tanstack/react-form";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Bus, Plus, Save, Send, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FieldInfo } from "@/components/ui/field-controls";
import { Input } from "@/components/ui/input";
import {
	CatalogApiError,
	createCatalogDraft,
	deleteCatalogEntry,
	getCatalogPublishFieldErrors,
	listCatalogEntries,
	saveAndPublishCatalogEntry,
	unpublishCatalogEntry,
	updateCatalogDraft,
} from "@/lib/operator-catalog-api";

const catalogQueryKey = ["operator", "transfer-catalog"] as const;

type FormValues = Record<TransferCatalogEditableField, string>;
type CatalogFieldErrors = Partial<Record<TransferCatalogEditableField, string>>;

function toFormValue(
	definition: OperatorCatalogFieldDefinition,
	entry: TransferCatalogRecord | null,
): string {
	const current = entry?.[definition.name];
	if (current === null || current === undefined) return "";
	// A datetime-local input takes exactly "YYYY-MM-DDTHH:mm".
	return definition.kind === "datetime" ? String(current).slice(0, 16) : String(current);
}

function toDraftValue(
	definition: OperatorCatalogFieldDefinition,
	raw: string,
): string | number | null {
	if (raw === "") return null;
	if (definition.kind === "integer") return Number(raw);
	if (definition.kind !== "datetime") return raw;
	const parsed = new Date(raw);
	// An unparsable moment travels untouched: the verdict on it is the server's.
	return Number.isNaN(parsed.getTime()) ? raw : parsed.toISOString();
}

/*
 * Both directions are driven by the field registry in data-ops, which owns the
 * field list. A field added there renders, validates, and serializes here with
 * no second list to keep in step — and none of its values can be dropped.
 */
function formValues(entry: TransferCatalogRecord | null): FormValues {
	return Object.fromEntries(
		OPERATOR_CATALOG_FIELDS.map((definition) => [definition.name, toFormValue(definition, entry)]),
	) as FormValues;
}

function draftInput(values: FormValues): TransferCatalogDraftInput {
	return Object.fromEntries(
		OPERATOR_CATALOG_FIELDS.map((definition) => [
			definition.name,
			toDraftValue(definition, values[definition.name]),
		]),
	) as TransferCatalogDraftInput;
}

/** Everything the editor can ask of the catalog, as one dispatchable value. */
type CatalogCommand =
	| { kind: "save"; input: TransferCatalogDraftInput }
	| { kind: "publish"; input: TransferCatalogDraftInput }
	| { kind: "unpublish"; id: string }
	| { kind: "delete"; id: string };

/**
 * The outcome of the last command, as one value: a success banner, a refusal
 * from the server, and a publication blocked before it left the browser are
 * variants of the same state, so two of them can never render at once.
 */
type CatalogFeedback =
	| { kind: "idle" }
	| { kind: "success"; message: string }
	| { kind: "failure"; message: string; fieldErrors: CatalogFieldErrors }
	| { kind: "invalid"; fieldErrors: CatalogFieldErrors };

const SUCCESS_MESSAGE = {
	save: "Szkic został zapisany.",
	publish: "Wpis został opublikowany.",
	unpublish: "Wpis został wycofany do szkicu.",
	// Deleting takes the editor with it — there is nothing left to report in.
	delete: null,
} as const satisfies Record<CatalogCommand["kind"], string | null>;

function fieldErrorsOf(feedback: CatalogFeedback): CatalogFieldErrors {
	return feedback.kind === "failure" || feedback.kind === "invalid" ? feedback.fieldErrors : {};
}

/** Marks the fields that keep a publication in the browser, or nothing. */
function publicationBlock(input: TransferCatalogDraftInput): CatalogFeedback | null {
	const fieldErrors = getCatalogPublishFieldErrors(
		input,
		new Date(),
		DEFAULT_TRANSFER_CATALOG_FRESHNESS_DAYS,
	);
	return Object.keys(fieldErrors).length > 0 ? { kind: "invalid", fieldErrors } : null;
}

function statusLabel(entry: TransferCatalogRecord) {
	const publication = entry.publicationStatus === "published" ? "Opublikowany" : "Szkic";
	const freshness = {
		fresh: "świeże",
		stale: "nieaktualne",
		incomplete: "niekompletne",
	}[entry.freshness];
	return `${publication} · ${freshness}`;
}

const inputTypeByKind = {
	text: "text",
	url: "url",
	integer: "number",
	datetime: "datetime-local",
} as const;

/**
 * One rendering for all 13 fields: label, the shared "i" disclosure carrying the
 * field's help, the input, and the publication error — all driven by the single
 * field-definition map.
 */
function CatalogField({
	definition,
	value,
	error,
	onChange,
}: {
	definition: OperatorCatalogFieldDefinition;
	value: string;
	error?: string;
	onChange(next: string): void;
}) {
	const inputId = `catalog-${definition.name}`;
	const helpId = `${inputId}-info`;
	const errorId = `${inputId}-error`;
	return (
		<div className="space-y-1.5">
			<div className="flex items-center gap-1">
				<label className="text-sm font-medium" htmlFor={inputId}>
					{definition.label}
				</label>
				<FieldInfo label={definition.label} id={helpId}>
					{definition.help}
				</FieldInfo>
			</div>
			<Input
				id={inputId}
				type={inputTypeByKind[definition.kind]}
				{...(definition.kind === "integer" ? { step: "1" } : {})}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				aria-invalid={Boolean(error)}
				aria-describedby={error ? `${helpId} ${errorId}` : helpId}
			/>
			{error && (
				<p id={errorId} className="text-sm text-destructive">
					{error}
				</p>
			)}
		</div>
	);
}

interface CatalogEditorProps {
	entry: TransferCatalogRecord | null;
	onDirtyChange(isDirty: boolean): void;
	onSaved(entry: TransferCatalogRecord): void;
	onDeleted(): void;
}

function CatalogEditor({ entry, onDirtyChange, onSaved, onDeleted }: CatalogEditorProps) {
	const queryClient = useQueryClient();
	const [feedback, setFeedback] = useState<CatalogFeedback>({ kind: "idle" });

	const commandMutation = useMutation({
		mutationFn: (command: CatalogCommand): Promise<TransferCatalogRecord | null> => {
			switch (command.kind) {
				case "save":
					return entry
						? updateCatalogDraft(entry.id, command.input)
						: createCatalogDraft(command.input);
				case "publish":
					return saveAndPublishCatalogEntry(command.input, entry?.id);
				case "unpublish":
					return unpublishCatalogEntry(command.id);
				case "delete":
					return deleteCatalogEntry(command.id).then(() => null);
			}
		},
		onSuccess: async (saved, command) => {
			const message = SUCCESS_MESSAGE[command.kind];
			setFeedback(message ? { kind: "success", message } : { kind: "idle" });
			if (command.kind === "delete") {
				onDeleted();
			} else if (saved) {
				if (command.kind !== "unpublish") form.reset(formValues(saved));
				onSaved(saved);
			}
			await queryClient.invalidateQueries({ queryKey: catalogQueryKey });
		},
		onError: (error) => {
			setFeedback({
				kind: "failure",
				message: error instanceof Error ? error.message : "Spróbuj ponownie.",
				fieldErrors: error instanceof CatalogApiError ? error.fieldErrors : {},
			});
		},
	});

	/** The one entry point: every command replaces the previous outcome. */
	const dispatch = (command: CatalogCommand) => {
		const blocked = command.kind === "publish" ? publicationBlock(command.input) : null;
		setFeedback(blocked ?? { kind: "idle" });
		if (!blocked) commandMutation.mutate(command);
	};

	const form = useForm({
		defaultValues: formValues(entry),
		onSubmit: ({ value }) => dispatch({ kind: "save", input: draftInput(value) }),
	});
	const isDirty = useStore(form.store, (state) => state.isDirty);

	useEffect(() => {
		onDirtyChange(isDirty);
		if (!isDirty) return;
		const preventSilentLeave = (event: BeforeUnloadEvent) => {
			event.preventDefault();
			event.returnValue = "";
		};
		window.addEventListener("beforeunload", preventSilentLeave);
		return () => window.removeEventListener("beforeunload", preventSilentLeave);
	}, [isDirty, onDirtyChange]);

	const fieldErrors = fieldErrorsOf(feedback);
	const isPending = commandMutation.isPending;

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<CardTitle>{entry ? "Edytuj wpis" : "Nowy szkic"}</CardTitle>
					{isDirty && <Badge variant="warning">Niezapisane zmiany</Badge>}
				</div>
				<CardDescription className="text-pretty">
					Szkic może być niekompletny. Wszystkie pola są sprawdzane przed publikacją.
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-5">
				{entry?.freshness === "stale" && (
					<Alert variant="warning">
						<AlertTitle>Dane są nieaktualne</AlertTitle>
						<AlertDescription>
							Wpis nie trafi do rekomendacji, dopóki data kontroli nie zostanie odświeżona.
						</AlertDescription>
					</Alert>
				)}
				{feedback.kind === "success" && (
					<Alert variant="success">
						<AlertDescription>{feedback.message}</AlertDescription>
					</Alert>
				)}
				{feedback.kind === "failure" && (
					<Alert variant="destructive">
						<AlertTitle>Nie udało się zapisać zmiany</AlertTitle>
						<AlertDescription>{feedback.message}</AlertDescription>
					</Alert>
				)}
				<form
					className="space-y-5"
					onSubmit={(event) => {
						event.preventDefault();
						form.handleSubmit();
					}}
				>
					<div className="grid gap-4 sm:grid-cols-2">
						{OPERATOR_CATALOG_FIELDS.map((definition) => (
							<form.Field key={definition.name} name={definition.name}>
								{(field) => (
									<CatalogField
										definition={definition}
										value={field.state.value}
										error={fieldErrors[definition.name]}
										onChange={field.handleChange}
									/>
								)}
							</form.Field>
						))}
					</div>
					<div className="flex flex-wrap gap-2">
						<Button type="submit" disabled={isPending}>
							<Save className="size-4" />
							Zapisz szkic
						</Button>
						{entry?.publicationStatus !== "published" && (
							<Button
								type="button"
								variant="secondary"
								disabled={isPending}
								onClick={() => dispatch({ kind: "publish", input: draftInput(form.state.values) })}
							>
								<Send className="size-4" />
								Zapisz i opublikuj
							</Button>
						)}
						{entry?.publicationStatus === "published" && (
							<Button
								type="button"
								variant="secondary"
								disabled={isPending || isDirty}
								onClick={() => dispatch({ kind: "unpublish", id: entry.id })}
							>
								<Archive className="size-4" />
								Wycofaj publikację
							</Button>
						)}
						{entry && (
							<Button
								type="button"
								variant="destructive"
								disabled={isPending || isDirty}
								onClick={() => dispatch({ kind: "delete", id: entry.id })}
							>
								<Trash2 className="size-4" />
								Usuń
							</Button>
						)}
					</div>
				</form>
			</CardContent>
		</Card>
	);
}

export function OperatorCatalogConsole() {
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [editorDirty, setEditorDirty] = useState(false);
	const [editorRevision, setEditorRevision] = useState(0);
	const entriesQuery = useQuery({ queryKey: catalogQueryKey, queryFn: listCatalogEntries });
	const selected = entriesQuery.data?.find((entry) => entry.id === selectedId) ?? null;
	const changeSelection = (id: string | null, resetCurrent = false) => {
		if (!resetCurrent && id === selectedId) return;
		if (editorDirty && !window.confirm("Masz niezapisane zmiany. Czy chcesz je odrzucić?")) {
			return;
		}
		setEditorDirty(false);
		setSelectedId(id);
		setEditorRevision((current) => current + 1);
	};

	if (entriesQuery.isLoading) return <output>Ładowanie katalogu…</output>;
	if (entriesQuery.error) {
		return (
			<Alert variant="destructive">
				<AlertTitle>Brak dostępu do katalogu</AlertTitle>
				<AlertDescription>
					{entriesQuery.error instanceof Error
						? entriesQuery.error.message
						: "Nie udało się pobrać katalogu."}
				</AlertDescription>
			</Alert>
		);
	}

	return (
		<section className="space-y-6" aria-labelledby="operator-catalog-title">
			<div className="flex flex-wrap items-start justify-between gap-4">
				<div>
					<h1
						id="operator-catalog-title"
						className="text-3xl font-semibold tracking-tight text-balance"
					>
						Katalog transferów
					</h1>
					<p className="mt-2 max-w-2xl text-muted-foreground text-pretty">
						Zarządzaj zweryfikowanymi połączeniami z lotniska do Mediolanu.
					</p>
				</div>
				<Button type="button" variant="outline" onClick={() => changeSelection(null, true)}>
					<Plus className="size-4" />
					Nowy szkic
				</Button>
			</div>
			<div className="grid gap-6 lg:grid-cols-[minmax(15rem,0.7fr)_minmax(0,1.3fr)]">
				<Card>
					<CardHeader>
						<CardTitle>Wpisy</CardTitle>
						<CardDescription>{entriesQuery.data?.length ?? 0} w katalogu</CardDescription>
					</CardHeader>
					<CardContent className="space-y-2">
						{entriesQuery.data?.length === 0 && (
							<p className="text-sm text-muted-foreground">Katalog nie zawiera jeszcze wpisów.</p>
						)}
						{entriesQuery.data?.map((entry) => (
							<button
								key={entry.id}
								type="button"
								aria-pressed={selectedId === entry.id}
								className="flex min-h-11 w-full items-start gap-3 rounded-lg border p-3 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
								onClick={() => changeSelection(entry.id)}
							>
								<Bus className="mt-0.5 size-4 shrink-0" />
								<span className="min-w-0 flex-1">
									<span className="block truncate font-medium">
										{entry.serviceName || "Szkic bez nazwy"}
									</span>
									<span className="mt-1 block text-xs text-muted-foreground">
										{statusLabel(entry)}
									</span>
								</span>
								{entry.freshness === "stale" && <Badge variant="warning">Nieaktualne</Badge>}
							</button>
						))}
					</CardContent>
				</Card>
				<CatalogEditor
					key={`${selected?.id ?? "new"}:${editorRevision}`}
					entry={selected}
					onDirtyChange={setEditorDirty}
					onSaved={(saved) => setSelectedId(saved.id)}
					onDeleted={() => {
						setEditorDirty(false);
						setSelectedId(null);
						setEditorRevision((current) => current + 1);
					}}
				/>
			</div>
		</section>
	);
}
