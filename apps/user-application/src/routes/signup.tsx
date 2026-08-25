import { createFileRoute, redirect } from "@tanstack/react-router";

// Legacy path kept only so bookmarks and old links land somewhere sane: /signin
// owns the single gated entry point (SigninGate), so this route never renders
// an OTP form of its own.
export const Route = createFileRoute("/signup")({
	beforeLoad: () => {
		throw redirect({ to: "/signin" });
	},
});
