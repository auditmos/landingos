import { rmSync } from "node:fs";
import { resolve } from "node:path";

const serverBuildDirectory = resolve(import.meta.dirname, "../dist/server");

for (const fileName of [".dev.vars", ".env", ".env.production", ".env.staging"]) {
	rmSync(resolve(serverBuildDirectory, fileName), { force: true });
}
