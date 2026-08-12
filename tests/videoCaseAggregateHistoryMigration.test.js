import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationSource = readFileSync(
  new URL(
    "../supabase/migrations/20260728170000_video_case_aggregate_requester_snapshot.sql",
    import.meta.url,
  ),
  "utf8",
);

test("adds immutable aggregate requester snapshots", () => {
  assert.match(migrationSource, /requested_by_name text null/i);
  assert.match(migrationSource, /requested_by_employee_number text null/i);
  assert.match(
    migrationSource,
    /create trigger trg_snapshot_video_case_aggregate_requester/i,
  );
  assert.match(
    migrationSource,
    /before insert\s+on public\.video_case_aggregates/i,
  );
});

test("backfills historical aggregate requester identity", () => {
  assert.match(
    migrationSource,
    /update public\.video_case_aggregates aggregate/i,
  );
  assert.match(
    migrationSource,
    /from public\.user_information profile/i,
  );
});

test("allows case leaders and system admins to delete aggregates", () => {
  assert.match(
    migrationSource,
    /create policy video_case_aggregates_delete_leader/i,
  );
  assert.match(
    migrationSource,
    /current_video_case_role\(video_case_id\) = 'leader'/i,
  );
  assert.match(
    migrationSource,
    /role_at_least\('admin'::public\.app_role\)/i,
  );
});
