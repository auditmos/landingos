import { Check, Monitor, Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { useTheme } from "./theme-provider";

interface ThemeToggleProps {
	variant?: "default" | "outline" | "ghost";
	size?: "sm" | "default" | "lg";
	showLabel?: boolean;
	align?: "start" | "center" | "end";
}

const themeOptions = [
	{
		value: "light",
		label: "Jasny",
		icon: Sun,
		description: "Użyj jasnego motywu",
	},
	{
		value: "dark",
		label: "Ciemny",
		icon: Moon,
		description: "Użyj ciemnego motywu",
	},
	{
		value: "system",
		label: "Systemowy",
		icon: Monitor,
		description: "Użyj motywu systemowego",
	},
] as const;

export function ThemeToggle({
	variant = "ghost",
	size = "default",
	showLabel = false,
	align = "end",
}: ThemeToggleProps) {
	const { theme, setTheme, resolvedTheme } = useTheme();

	// Polish label for the currently resolved appearance ("light" | "dark").
	const resolvedThemeLabel = resolvedTheme === "dark" ? "ciemny" : "jasny";
	const CurrentIcon = theme === "system" ? Monitor : resolvedTheme === "dark" ? Moon : Sun;
	const currentLabel = themeOptions.find((option) => option.value === theme)?.label;

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant={variant}
					size={size}
					className={showLabel ? "gap-2" : "aspect-square"}
					aria-label="Przełącz motyw"
				>
					<CurrentIcon className="size-4 text-foreground" aria-hidden="true" />
					{showLabel && <span className="text-sm font-medium">{currentLabel}</span>}
					<span className="sr-only">
						Aktualny motyw:{" "}
						{theme === "system" ? `Systemowy (${resolvedThemeLabel})` : currentLabel}
					</span>
				</Button>
			</DropdownMenuTrigger>

			<DropdownMenuContent align={align} className="w-56 p-2">
				<div className="grid gap-1">
					{themeOptions.map((option) => {
						const Icon = option.icon;
						const isSelected = theme === option.value;

						return (
							<DropdownMenuItem
								key={option.value}
								onClick={() => setTheme(option.value)}
								className={cn(
									"flex cursor-pointer items-center gap-3 px-3 py-2.5",
									isSelected && "bg-accent text-accent-foreground",
								)}
							>
								<Icon
									className={cn(
										"size-4",
										isSelected ? "text-accent-foreground" : "text-muted-foreground",
									)}
									aria-hidden="true"
								/>
								<div className="flex min-w-0 flex-1 flex-col">
									<span className="text-sm font-medium leading-none">{option.label}</span>
									<span className="mt-0.5 text-xs leading-none text-muted-foreground">
										{option.description}
									</span>
								</div>
								{isSelected && <Check className="size-4" aria-hidden="true" />}
							</DropdownMenuItem>
						);
					})}
				</div>

				{resolvedTheme && (
					<div className="mt-2 border-t border-border pt-2">
						<p className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
							<span className="size-2 rounded-full bg-primary" aria-hidden="true" />
							Aktualnie używany motyw: {resolvedThemeLabel}
						</p>
					</div>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
