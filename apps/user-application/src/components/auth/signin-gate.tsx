import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import { completeAuthenticationNavigation } from "@/lib/auth-navigation";
import { EmailAuth } from "./email-auth";

export function SigninGate({
	onAuthenticated = completeAuthenticationNavigation,
}: {
	onAuthenticated?: () => void;
}) {
	const session = authClient.useSession();
	const [hasResolvedWithoutSession, setHasResolvedWithoutSession] = useState(false);

	useEffect(() => {
		if (session.isPending) return;
		if (session.data) onAuthenticated();
		else setHasResolvedWithoutSession(true);
	}, [onAuthenticated, session.data, session.isPending]);

	if ((!hasResolvedWithoutSession && session.isPending) || session.data) {
		return (
			<output
				className="min-h-dvh flex items-center justify-center bg-background"
				aria-label="Ładowanie sesji"
			>
				Ładowanie sesji…
			</output>
		);
	}

	return <EmailAuth onAuthenticated={onAuthenticated} />;
}
