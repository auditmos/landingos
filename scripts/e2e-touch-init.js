Object.defineProperty(Navigator.prototype, "maxTouchPoints", {
	configurable: true,
	get: () => 1,
});
Object.defineProperty(window, "ontouchstart", {
	configurable: true,
	value: null,
});
window.__landingosE2eErrors = [];
window.addEventListener("error", (event) => {
	window.__landingosE2eErrors.push(event.message || "resource_error");
});
window.addEventListener("unhandledrejection", (event) => {
	window.__landingosE2eErrors.push(String(event.reason));
});
const originalConsoleError = console.error;
console.error = (...values) => {
	window.__landingosE2eErrors.push(values.map(String).join(" "));
	originalConsoleError(...values);
};

function observeOtpEmailStep() {
	if (
		sessionStorage.getItem("landingos.e2e.observe-otp-completion") === "true" &&
		document.querySelector("#auth-email")
	) {
		sessionStorage.setItem("landingos.e2e.otp-email-step-flashed", "true");
	}
	requestAnimationFrame(observeOtpEmailStep);
}
requestAnimationFrame(observeOtpEmailStep);
