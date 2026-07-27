import { Menu } from "lucide-react";
import { useState } from "react";
import { AccountDialog } from "@/components/auth/account-dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

interface HeaderProps {
	className?: string;
	onMobileMenuToggle?: () => void;
}

export function Header({ className, onMobileMenuToggle }: HeaderProps) {
	const { data: session } = authClient.useSession();
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
			{/* Left side - Mobile menu button */}
			<div className="flex items-center">
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
			</div>
			{isMobileMenuOpen ? (
				<nav
					aria-label="Nawigacja mobilna"
					className="absolute left-4 top-14 z-50 grid min-w-56 gap-1 rounded-lg border bg-background p-2 shadow-lg lg:hidden"
				>
					<Button asChild variant="ghost" className="justify-start">
						<a href="/">Start</a>
					</Button>
					<Button asChild variant="ghost" className="justify-start">
						<a href="/app">Pokój lotu</a>
					</Button>
					<Button asChild variant="ghost" className="justify-start">
						<a href="/operator">Katalog transferów</a>
					</Button>
				</nav>
			) : null}

			{/* Right side - User menu */}
			<div className="flex items-center gap-2">
				<AccountDialog>
					<Button variant="ghost" className="flex items-center gap-2 px-3">
						<Avatar className="h-8 w-8">
							<AvatarImage src={user?.image || undefined} alt={user?.name || "Użytkownik"} />
							<AvatarFallback className="bg-primary text-primary-foreground text-sm">
								{fallbackText}
							</AvatarFallback>
						</Avatar>
						<div className="hidden sm:flex flex-col items-start">
							<span className="text-sm font-medium text-foreground">
								{user?.name || "Użytkownik"}
							</span>
							<span className="text-xs text-muted-foreground">Aktywny</span>
						</div>
					</Button>
				</AccountDialog>
			</div>
		</header>
	);
}
