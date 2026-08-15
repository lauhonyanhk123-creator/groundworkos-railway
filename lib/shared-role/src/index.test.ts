import { describe, expect, it } from "vitest";
import {
  ROLE_RANK,
  hasExplicitNonAdminRole,
  isRole,
  isUnsetOrAdmin,
  resolveRole,
} from "./index";

describe("isRole", () => {
  it("accepts the three valid role strings", () => {
    expect(isRole("admin")).toBe(true);
    expect(isRole("manager")).toBe(true);
    expect(isRole("foreman")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isRole(undefined)).toBe(false);
    expect(isRole(null)).toBe(false);
    expect(isRole("")).toBe(false);
    expect(isRole("owner")).toBe(false);
    expect(isRole(42)).toBe(false);
  });
});

describe("resolveRole (no-role-defaults-to-admin)", () => {
  it("passes through a recognized role unchanged", () => {
    expect(resolveRole("admin")).toBe("admin");
    expect(resolveRole("manager")).toBe("manager");
    expect(resolveRole("foreman")).toBe("foreman");
  });

  it("defaults to admin when no role is set", () => {
    expect(resolveRole(undefined)).toBe("admin");
    expect(resolveRole(null)).toBe("admin");
  });

  it("defaults to admin for any unrecognized value", () => {
    expect(resolveRole("owner")).toBe("admin");
    expect(resolveRole(123)).toBe("admin");
    expect(resolveRole({})).toBe("admin");
  });
});

describe("ROLE_RANK", () => {
  it("orders admin above manager above foreman", () => {
    expect(ROLE_RANK.admin).toBeGreaterThan(ROLE_RANK.manager);
    expect(ROLE_RANK.manager).toBeGreaterThan(ROLE_RANK.foreman);
  });
});

describe("isUnsetOrAdmin", () => {
  it("is true for an explicit admin role and for a missing role", () => {
    expect(isUnsetOrAdmin("admin")).toBe(true);
    expect(isUnsetOrAdmin(undefined)).toBe(true);
  });

  it("is false for any other explicit role, including garbage values", () => {
    expect(isUnsetOrAdmin("manager")).toBe(false);
    expect(isUnsetOrAdmin("foreman")).toBe(false);
    expect(isUnsetOrAdmin("owner")).toBe(false);
  });
});

describe("hasExplicitNonAdminRole", () => {
  it("is true only when an explicit non-admin role is set", () => {
    expect(hasExplicitNonAdminRole("manager")).toBe(true);
    expect(hasExplicitNonAdminRole("foreman")).toBe(true);
  });

  it("is false for an explicit admin role and for a missing role", () => {
    expect(hasExplicitNonAdminRole("admin")).toBe(false);
    expect(hasExplicitNonAdminRole(undefined)).toBe(false);
    expect(hasExplicitNonAdminRole(null)).toBe(false);
  });
});
