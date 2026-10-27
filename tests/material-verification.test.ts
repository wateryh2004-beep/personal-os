import { describe, expect, it } from "vitest";
import {
  materialObjectSnapshot,
  materialTimestampKey,
  materialObjectRevisionsMatch,
} from "@/features/career/material-verification";

describe("exact material source versions", () => {
  it("compares finite source tokens without confusing entity changes or a single microsecond", () => {
    const document = "11111111-1111-4111-8111-111111111111",
      resume = "22222222-2222-4222-8222-222222222222";
    const identity = `document:${document}:2|resume:${resume}:`;
    const current = `${identity}2026-10-27T00:00:00.123456+00:00`;
    expect(
      materialObjectRevisionsMatch(
        current,
        `${identity}2026-10-27T08:00:00.123456+08:00`,
      ),
    ).toBe(true);
    expect(
      materialObjectRevisionsMatch(
        current,
        `${identity}2026-10-27 00:00:00.123456+00`,
      ),
    ).toBe(true);
    expect(
      materialObjectRevisionsMatch(
        current,
        `${identity}2026-10-27T00:00:00.123457+00:00`,
      ),
    ).toBe(false);
    expect(
      materialObjectRevisionsMatch(
        current,
        current.replace(`document:${document}:2`, `document:${document}:3`),
      ),
    ).toBe(false);
    expect(
      materialObjectRevisionsMatch(current, current.replace(resume, document)),
    ).toBe(false);
    expect(
      materialObjectRevisionsMatch(current, current.replace(document, resume)),
    ).toBe(false);
    expect(
      materialObjectRevisionsMatch(current, `${current}|other:value`),
    ).toBe(false);
    expect(materialObjectRevisionsMatch(null, null)).toBe(false);
  });
  it("compares PostgreSQL and PostgREST timestamp forms without dropping microseconds", () => {
    const captured = materialTimestampKey("2026-10-27T00:00:00.123456+00:00");
    expect(captured).not.toBeNull();
    expect(materialTimestampKey("2026-10-27 00:00:00.123456+00")).toBe(
      captured,
    );
    expect(materialTimestampKey("2026-10-27T08:00:00.123456+08:00")).toBe(
      captured,
    );
    expect(materialTimestampKey("2026-10-27T00:00:00.123457Z")).toBe(
      captured! + BigInt(1),
    );
    expect(materialTimestampKey("2026-10-27T00:00:00.123Z")).toBe(
      captured! - BigInt(456),
    );
    expect(materialTimestampKey("unknown")).toBeNull();
  });

  it("uses the real approved resume state and retains the full captured version", () => {
    const version = "2026-10-27T00:00:00.123456+00:00";
    const resume = {
      id: "resume",
      title: "Synthetic",
      status: "approved",
      updated_at: version,
    };
    const approved = materialObjectSnapshot(null, resume.id, [], [resume]);
    expect(approved.canVerify).toBe(true);
    expect(approved.resumeUpdatedAt).toBe(version);
    expect(approved.token).toBe(`manual|resume:resume:${version}`);
    expect(
      materialObjectSnapshot(
        null,
        resume.id,
        [],
        [{ ...resume, status: "draft" }],
      ).canVerify,
    ).toBe(false);
  });
});
