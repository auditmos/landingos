import { CalendarDays, Clock3, Info } from "lucide-react";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
	formatPolishDateInput,
	formatPolishDateTimeInput,
	parsePolishDateInput,
	parsePolishDateTimeInput,
} from "@/lib/polish-date";
import { cn } from "@/lib/utils";

/**
 * The one disclosure pattern for field help. `<summary>` gives native Tab focus and
 * Enter/Space activation; `aria-expanded` is mirrored from the toggle so assistive
 * technology and tests can read the state. Pass `id` to associate the help text with
 * an input through `aria-describedby`.
 */
export function FieldInfo({
	label,
	id,
	children,
}: {
	label: string;
	id?: string;
	children: string;
}) {
	const [open, setOpen] = useState(false);
	return (
		<details
			className="relative inline-block"
			onToggle={(event) => setOpen(event.currentTarget.open)}
		>
			{/* biome-ignore lint/a11y/useSemanticElements: <summary> is the native disclosure toggle — a <button> cannot replace it without losing the details open/close behaviour. The explicit role only makes aria-expanded announceable. */}
			<summary
				id={id ? `${id}-summary` : undefined}
				role="button"
				className="flex size-8 cursor-pointer list-none items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 [&::-webkit-details-marker]:hidden"
				aria-label={`Informacja: ${label}`}
				aria-expanded={open}
			>
				<Info className="size-4" aria-hidden="true" />
			</summary>
			<p
				id={id}
				className="absolute left-0 top-full z-20 mt-1 w-72 max-w-[calc(100vw-3rem)] rounded-md border bg-popover p-3 text-pretty text-xs font-normal leading-5 text-popover-foreground shadow-md"
				role="note"
			>
				{children}
			</p>
		</details>
	);
}

interface PolishPickerProps {
	id: string;
	name: string;
	label: string;
	type: "date" | "datetime-local";
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
	invalid?: boolean;
	describedBy?: string;
	className?: string;
	/** Adds a typed Polish fallback field so the value can be entered without the native picker. */
	allowTyping?: boolean;
}

/**
 * The native `<input>` is the tap target: a full-size transparent overlay on top of a
 * presentational box. Mobile browsers anchor their date sheet to the input's rendered
 * box, so it must never be clipped (`sr-only`) or opened indirectly via `showPicker()`.
 * It stays in the tab order with its own accessible name; the box is decoration only.
 */
export function PolishPicker({
	id,
	name,
	label,
	type,
	value,
	onChange,
	disabled,
	invalid,
	describedBy,
	className,
	allowTyping = false,
}: PolishPickerProps) {
	const isDateTime = type === "datetime-local";
	const displayValue = isDateTime ? formatPolishDateTimeInput(value) : formatPolishDateInput(value);
	const placeholder = isDateTime ? "Wybierz datę i godzinę" : "Wybierz datę";
	const typedPlaceholder = isDateTime ? "DD.MM.RRRR, GG:MM" : "DD.MM.RRRR";
	const Icon = isDateTime ? Clock3 : CalendarDays;
	const [typed, setTyped] = useState("");

	function handleTyped(next: string) {
		setTyped(next);
		const parsed = isDateTime ? parsePolishDateTimeInput(next) : parsePolishDateInput(next);
		if (parsed) onChange(parsed);
	}

	return (
		<div className={cn("relative", className)}>
			<input
				id={`${id}-native`}
				name={name}
				type={type}
				value={value}
				disabled={disabled}
				className="peer absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
				aria-label={`${label}: ${displayValue || placeholder}`}
				aria-invalid={invalid}
				aria-describedby={describedBy}
				onChange={(event) => onChange(event.target.value)}
			/>
			<div
				id={id}
				aria-hidden="true"
				className={cn(
					"pointer-events-none flex h-12 w-full items-center justify-between rounded-md border border-input bg-background px-4 text-base tabular-nums shadow-xs transition-[color,box-shadow]",
					"peer-focus-visible:border-ring peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50",
					"peer-disabled:opacity-50",
					invalid && "border-destructive ring-[3px] ring-destructive/20",
					!displayValue && "text-muted-foreground",
				)}
			>
				<span>{displayValue || placeholder}</span>
				<Icon className="size-4 text-muted-foreground" aria-hidden="true" />
			</div>
			{allowTyping ? (
				<div className="mt-2">
					<label className="text-xs text-muted-foreground" htmlFor={`${id}-typed`}>
						Albo wpisz ręcznie ({typedPlaceholder})
					</label>
					<Input
						id={`${id}-typed`}
						className="mt-1 h-11 tabular-nums"
						value={typed}
						placeholder={typedPlaceholder}
						autoComplete="off"
						disabled={disabled}
						onChange={(event) => handleTyped(event.target.value)}
					/>
				</div>
			) : null}
		</div>
	);
}
