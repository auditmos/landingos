import { CalendarDays, Clock3, Info } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatPolishDateInput, formatPolishDateTimeInput } from "@/lib/polish-date";
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
}

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
}: PolishPickerProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const isDateTime = type === "datetime-local";
	const displayValue = isDateTime ? formatPolishDateTimeInput(value) : formatPolishDateInput(value);
	const placeholder = isDateTime ? "Wybierz datę i godzinę" : "Wybierz datę";
	const Icon = isDateTime ? Clock3 : CalendarDays;

	function openPicker() {
		const input = inputRef.current;
		if (!input) return;
		try {
			if (typeof input.showPicker === "function") {
				input.showPicker();
				return;
			}
		} catch {
			// A browser may reject showPicker even during a user gesture; click is the native fallback.
		}
		input.click();
	}

	return (
		<>
			<Button
				id={id}
				type="button"
				variant="outline"
				className={cn(
					"h-12 w-full justify-between bg-background px-4 text-base font-normal tabular-nums",
					!displayValue && "text-muted-foreground",
					className,
				)}
				disabled={disabled}
				aria-label={`${label}: ${displayValue || placeholder}. Otwórz wybór.`}
				aria-haspopup="dialog"
				aria-invalid={invalid}
				aria-describedby={describedBy}
				onClick={openPicker}
			>
				<span>{displayValue || placeholder}</span>
				<Icon className="size-4 text-muted-foreground" aria-hidden="true" />
			</Button>
			<input
				ref={inputRef}
				id={`${id}-native`}
				name={name}
				type={type}
				value={value}
				disabled={disabled}
				className="sr-only"
				tabIndex={-1}
				aria-hidden="true"
				onChange={(event) => onChange(event.target.value)}
			/>
		</>
	);
}
