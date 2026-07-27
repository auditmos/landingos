import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { getDb } from "../database/setup";
import { auth_user } from "../drizzle/auth-schema";

type RoleDatabase = Pick<ReturnType<typeof getDb>, "select" | "update">;
export type LandingOsRole = "operator" | "user";
export type OperatorRoleAction = "grant" | "revoke";

export type OperatorRoleChangeResult = {
	status: "changed" | "unchanged";
	userId: string;
	role: LandingOsRole;
};

const NormalizedEmailSchema = z.string().trim().toLowerCase().email("Nieprawidłowy adres e-mail.");

export async function getUserRoleById(
	db: RoleDatabase,
	userId: string,
): Promise<LandingOsRole | null> {
	const [user] = await db
		.select({ role: auth_user.role })
		.from(auth_user)
		.where(eq(auth_user.id, userId))
		.limit(1);
	if (!user) return null;
	return user.role === "operator" ? "operator" : "user";
}

export async function setOperatorRole(
	db: RoleDatabase,
	email: string,
	action: OperatorRoleAction,
): Promise<OperatorRoleChangeResult> {
	const normalizedEmail = NormalizedEmailSchema.parse(email);
	const users = await db
		.select({ id: auth_user.id, role: auth_user.role })
		.from(auth_user)
		.where(sql`lower(${auth_user.email}) = ${normalizedEmail}`)
		.limit(2);
	if (users.length === 0) {
		throw new Error("Nie znaleziono użytkownika o podanym adresie e-mail.");
	}
	if (users.length > 1) {
		throw new Error("Niejednoznaczny adres e-mail. Nie zmieniono roli.");
	}
	const user = users[0];
	if (!user) throw new Error("Nie znaleziono użytkownika o podanym adresie e-mail.");
	const role: LandingOsRole = action === "grant" ? "operator" : "user";
	if (user.role === role) return { status: "unchanged", userId: user.id, role };
	await db.update(auth_user).set({ role }).where(eq(auth_user.id, user.id));
	return { status: "changed", userId: user.id, role };
}
