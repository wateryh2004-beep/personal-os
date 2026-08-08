import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260808181945_agent_layer_v1.sql",
  "utf8",
);
const completionMigration = readFileSync(
  "supabase/migrations/20260808181955_agent_layer_completion.sql",
  "utf8",
);

describe("Agent Layer migration security assumptions", () => {
  it("enables RLS and scopes every agent table to auth.uid()", () => {
    for (const table of ["agent_runs", "agent_messages", "agent_steps", "agent_actions"]) {
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
    expect(migration.match(/\(select auth\.uid\(\)\) = user_id/g)?.length).toBeGreaterThanOrEqual(9);
    expect(migration).toContain("revoke all on public.agent_runs");
    expect(migration).not.toContain("service_role");
  });

  it("keeps raw reasoning out of the schema and freezes action payloads", () => {
    expect(migration).not.toContain("chain_of_thought");
    expect(migration).not.toContain("private_reasoning");
    expect(migration).toContain("payload_json jsonb not null");
    expect(migration).toContain("status in ('proposed', 'approved', 'rejected'");
    expect(migration).toContain("supersede_personal_memory_from_agent");
    expect(migration).toContain("old_row.updated_at <> p_expected_updated_at");
    expect(migration).toContain("'assistant_proposal'");
  });

  it("publishes only RLS-protected Agent state for multi-device Realtime", () => {
    expect(completionMigration).toContain("alter publication supabase_realtime add table");
    for (const table of ["agent_runs", "agent_messages", "agent_steps", "agent_actions"])
      expect(completionMigration).toContain(`'${table}'`);
    expect(completionMigration).not.toContain("replica identity full");
  });
});
