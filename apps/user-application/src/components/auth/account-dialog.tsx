import { useNavigate } from "@tanstack/react-router";
import { LogOut, Palette, Trash2 } from "lucide-react";
import { useState } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ACCOUNT_DELETE_CONFIRMATION } from "@/lib/account-deletion-api";
import { clearAnalyticsFunnel } from "@/lib/analytics-funnel";
import { authClient } from "@/lib/auth-client";
import { clearPrivateDropOff } from "@/lib/private-drop-off";
import { clearRoomIntent } from "@/lib/room-intent";

interface AccountDialogProps {
	children: React.ReactNode;
}

export function AccountDialog({ children }: AccountDialogProps) {
	const { data: session } = authClient.useSession();
	const navigate = useNavigate();
	const [confirmation, setConfirmation] = useState("");
	const [deleting, setDeleting] = useState(false);
	const [deleteError, setDeleteError] = useState("");

	const signOut = async () => {
		await authClient.signOut();
		navigate({ to: "/" });
	};

	const deleteAccount = async () => {
		setDeleting(true);
		setDeleteError("");
		try {
			const response = await fetch("/api/account", {
				method: "DELETE",
				headers: { "content-type": "application/json" },
				credentials: "include",
				body: JSON.stringify({ confirmation }),
			});
			if (!response.ok) {
				const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
				throw new Error(
					typeof body?.message === "string"
						? body.message
						: "Nie udało się usunąć konta. Spróbuj ponownie.",
				);
			}
			clearRoomIntent();
			clearPrivateDropOff();
			clearAnalyticsFunnel();
			navigate({ to: "/" });
		} catch (error) {
			setDeleteError(error instanceof Error ? error.message : "Nie udało się usunąć konta.");
		} finally {
			setDeleting(false);
		}
	};

	if (!session) {
		return null;
	}

	const user = session.user;
	const fallbackText = user.name
		? user.name.charAt(0).toUpperCase()
		: user.email?.charAt(0).toUpperCase() || "U";

	return (
		<Dialog>
			<DialogTrigger asChild>{children}</DialogTrigger>
			<DialogContent className="sm:max-w-md text-foreground">
				<DialogHeader className="text-center pb-4">
					<DialogTitle>Konto</DialogTitle>
				</DialogHeader>
				<div className="flex flex-col items-center space-y-6 py-6">
					<Avatar className="h-20 w-20">
						<AvatarImage src={user.image || undefined} alt={user.name || "Użytkownik"} />
						<AvatarFallback className="text-2xl font-semibold">{fallbackText}</AvatarFallback>
					</Avatar>
					<div className="text-center space-y-1">
						{user.name && <div className="text-lg font-semibold">{user.name}</div>}
						{user.email && <div className="text-sm text-muted-foreground">{user.email}</div>}
					</div>
					<div className="flex flex-col gap-4 w-full mt-6">
						<div className="flex items-center justify-between w-full py-3 px-4 rounded-lg border bg-card">
							<span className="text-sm font-medium flex items-center gap-2">
								<Palette className="h-4 w-4" />
								Motyw
							</span>
							<ThemeToggle />
						</div>
						<Button onClick={signOut} variant="outline" size="lg" className="w-full gap-2">
							<LogOut className="h-5 w-5" />
							Wyloguj się
						</Button>
						<div className="space-y-3 rounded-lg border border-destructive/40 p-4">
							<div>
								<p className="text-sm font-semibold text-destructive">Usuń konto</p>
								<p className="mt-1 text-xs text-muted-foreground">
									Ta operacja usuwa profil, zgody i prywatne dane. Wymaga logowania z ostatnich 5
									minut.
								</p>
							</div>
							<label className="block text-sm font-medium" htmlFor="account-delete-confirmation">
								Wpisz „{ACCOUNT_DELETE_CONFIRMATION}”
							</label>
							<Input
								id="account-delete-confirmation"
								value={confirmation}
								onChange={(event) => setConfirmation(event.target.value)}
								autoComplete="off"
							/>
							{deleteError ? (
								<p className="text-sm text-destructive" role="alert">
									{deleteError}
								</p>
							) : null}
							<Button
								type="button"
								variant="destructive"
								className="w-full gap-2"
								disabled={confirmation !== ACCOUNT_DELETE_CONFIRMATION || deleting}
								onClick={deleteAccount}
							>
								<Trash2 className="h-4 w-4" />
								{deleting ? "Usuwanie konta…" : "Usuń konto bezpowrotnie"}
							</Button>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
