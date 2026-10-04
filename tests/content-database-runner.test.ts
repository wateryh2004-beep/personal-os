import { describe, expect, it } from "vitest";
import { buildDatabaseTestSql, validateLocalDatabaseEnvironment } from "../scripts/test-content-database.mjs";

const environment = { CONTENT_DB_TEST_ALLOW_LOCAL: "1", PGHOST: "127.0.0.1", PGDATABASE: "personal_os_content_test", PGUSER: "postgres", PATH: "/usr/bin" };

describe("rollback-only database runner guard", () => {
  it("requires an explicit opt-in and dedicated test database", () => {
    expect(() => validateLocalDatabaseEnvironment({ ...environment, CONTENT_DB_TEST_ALLOW_LOCAL: undefined })).toThrow();
    expect(() => validateLocalDatabaseEnvironment({ ...environment, PGDATABASE: "postgres" })).toThrow();
    expect(() => validateLocalDatabaseEnvironment({ ...environment, PGDATABASE: "postgresql://remote/db" })).toThrow();
  });
  it.each(["db.production.supabase.co", "localhost", "/var/run/postgresql", "127.0.0.1,remote", "10.0.0.1"])("rejects indirect or remote host %s", (PGHOST) => {
    expect(() => validateLocalDatabaseEnvironment({ ...environment, PGHOST })).toThrow();
  });
  it("allows literal IPv4 and IPv6 loopback only", () => {
    expect(validateLocalDatabaseEnvironment(environment).PGHOST).toBe("127.0.0.1");
    expect(validateLocalDatabaseEnvironment({ ...environment, PGHOST: "::1" }).PGHOST).toBe("::1");
  });
  it("blocks service indirection and a conflicting host address", () => {
    for (const patch of [{ PGSERVICE: "production" }, { PGSERVICEFILE: "/tmp/service" }, { DATABASE_URL: "postgresql://remote/db" }, { PGHOSTADDR: "8.8.8.8" }]) {
      expect(() => validateLocalDatabaseEnvironment({ ...environment, ...patch })).toThrow();
    }
  });
  it("removes uncontrolled inherited connection options", () => {
    const result = validateLocalDatabaseEnvironment({ ...environment, PGOPTIONS: "unexpected", PGSSLMODE: "require", PGTARGETSESSIONATTRS: "read-write" });
    expect(result).not.toHaveProperty("PGOPTIONS");
    expect(result).not.toHaveProperty("PGTARGETSESSIONATTRS");
    expect(result.PGHOSTADDR).toBe("127.0.0.1");
  });
  it("assembles a proposal and tests within one rollback transaction", () => {
    const sql = buildDatabaseTestSql(true);
    expect(sql.match(/^begin;$/gm)).toHaveLength(1);
    expect(sql.match(/^rollback;$/gm)).toHaveLength(1);
    expect(sql).not.toMatch(/^\s*commit\s*;/im);
    expect(sql).toContain("create function public.write_content(p_command jsonb)");
    expect(sql).toContain("'failed receipt rolls canonical update back'");
  });
  it("does not install the proposal in ordinary test mode", () => {
    const sql = buildDatabaseTestSql();
    expect(sql).not.toContain("create function public.write_content");
    expect(sql).toContain("set local role authenticated");
    expect(sql).toContain("set local role anon");
    expect(sql).toContain("rollback;");
  });
});
