import { createFileRoute } from "@tanstack/react-router";
import { SigninGate } from "@/components/auth/signin-gate";

export const Route = createFileRoute("/signin")({
	component: SigninPage,
});

function SigninPage() {
	return <SigninGate />;
}
