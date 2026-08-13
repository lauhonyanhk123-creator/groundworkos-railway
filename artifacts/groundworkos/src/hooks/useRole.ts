import { useUser } from "@clerk/react";
import { type Role, ROLE_RANK, resolveRole } from "@workspace/shared-role";

export type { Role };

export function useRole(): Role {
  const { user } = useUser();
  // New users have no role set yet: default them to admin so the first
// person(s) to sign up have full access out of the box.
return resolveRole(user?.publicMetadata?.role);
}

export function isAtLeast(role: Role, min: Role): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: "Admin",
  manager: "Manager",
  foreman: "Foreman",
};
