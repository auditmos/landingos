import { Menu } from "lucide-react";
import { useState } from "react";
import { AccountDialog } from "@/components/auth/account-dialog";
import { ThemeToggle } from "@/components/theme";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { useOpenRoomCount } from "@/lib/use-my-rooms";
import { useViewerContext } from "@/lib/use-viewer";
import { cn } from "@/lib/utils";
import { visibleNavigationItems } from "./navigation-items";

interface HeaderProps {
	className?: string;
	onMobileMenuToggle?: () => void;
}

export function Header({ className, onMobileMenuToggle }: HeaderProps) {
	const { data: session } = authClient.useSession();
	const { isOperator } = useViewerContext();
	const openRoomCount = useOpenRoomCount();
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

	const user = session?.user;
	const fallbackText = user?.name
		? user.name.charAt(0).toUpperCase()
		: user?.email?.charAt(0).toUpperCase() || "U";

	return (
		<header
			className={cn(
				"relative flex h-16 items-center justify-between border-b border-border bg-background px-4 sm:px-6",
				className,
			)}
		>
			{/* Left side - mobile menu + brand (mobile), corridor (desktop) */}
			<div className="flex items-center gap-2">
				<Button
					variant="ghost"
					size="icon"
					className="lg:hidden"
					aria-label={isMobileMenuOpen ? "Zamknij menu" : "Otwórz menu"}
					aria-expanded={isMobileMenuOpen}
					onClick={() => {
						setIsMobileMenuOpen((current) => !current);
						onMobileMenuToggle?.();
					}}
				>
					<Menu className="h-5 w-5 text-foreground" />
				</Button>
				<a
					className="flex items-center gap-2 lg:hidden"
					href="/"
					aria-label="LandingOS — strona główna"
				>
					<img src="/landingos-icon.svg" alt="" className="size-7" width="28" height="28" />
					<span className="text-base font-bold text-foreground">LandingOS</span>
				</a>
				<p className="hidden text-xs font-bold uppercase text-muted-foreground lg:block">
					Polska
					<span className="px-1.5 text-primary" aria-hidden="true">
						→
					</span>
					BGY
					<span className="px-1.5 text-primary" aria-hidden="true">
						→
					</span>
					Mediolan
				</p>
			</div>
			{isMobileMenuOpen ? (
				<nav
					aria-label="Nawigacja mobilna"
					className="absolute left-4 top-14 z-50 grid min-w-56 gap-1 rounded-lg border bg-background p-2 shadow-lg lg:hidden"
				>
					{visibleNavigationItems({ isOperator, openRoomCount }).map((item) => (
						<Button
							key={item.name}
							asChild
							variant="ghost"
							className={cn("justify-start", item.indent && "pl-8")}
						>
							<a href={item.href}>
								<item.icon className="size-4 shrink-0" />
								{item.name}
								{item.badge ? (
									<span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-primary text-xs font-medium text-primary-foreground">
										{item.badge}
									</span>
								) : null}
							</a>
						</Button>
					))}
				</nav>
			) : null}

			{/* Right side - User menu */}
			<div className="flex items-center gap-2">
				<ThemeToggle />
				<AccountDialog>
					<Button variant="ghost" className="flex items-center gap-2 px-3">
						<Avatar className="h-8 w-8">
							<AvatarImage src={user?.image || undefined} alt={user?.name || "Użytkownik"} />
							<AvatarFallback className="bg-primary text-primary-foreground text-sm">
								{fallbackText}
							</AvatarFallback>
						</Avatar>
						<div className="hidden sm:flex max-w-44 flex-col items-start">
							<span className="w-full truncate text-left text-sm font-medium text-foreground">
								{user?.name || "Użytkownik"}
							</span>
							{user?.email ? (
								<span className="w-full truncate text-left text-xs text-muted-foreground">
									{user.email}
								</span>
							) : null}
						</div>
					</Button>
				</AccountDialog>
			</div>
		</header>
	);
}
