# Video Case Aggregate History Design

## Objective

Show a durable audit history of combined evaluation summaries on
`/video-cases/:videoCaseId`, including who created each aggregate and which
evaluations were used.

The history is visible to every member of the Video Case. Only a case leader or
system admin can create or delete aggregates.

## Scope

This feature adds:

- Creator identity snapshots to `public.video_case_aggregates`.
- Snapshot capture when VIA V4 creates an aggregate.
- A compact aggregate-history table on the Video Case detail page.
- A link from each history row to its existing summary page.
- Compatibility behavior for aggregates created before the snapshot columns
  exist.

This feature does not change evaluation submission, summary calculation, n8n,
document generation, or the distinction between `evaluation_id` and
`aggregate_id`.

## Data Model

Add these nullable columns to `public.video_case_aggregates`:

| Column | Type | Purpose |
| --- | --- | --- |
| `requested_by_employee_number` | `text` | Employee number at the time the aggregate was created |
| `requested_by_name` | `text` | Display name at the time the aggregate was created |

`requested_by` remains the authoritative creator UUID and continues to reference
`auth.users(id)`. The new fields are immutable audit snapshots, not foreign
keys.

The migration is additive and idempotent. It must not drop, rename, or change
existing columns because VIA V2, VIA V3, and VIA V4 share the Supabase project.

## Snapshot Creation

When a leader or admin creates an aggregate, a database `BEFORE INSERT` trigger
looks up `public.user_information` by `NEW.requested_by` and fills:

- `requested_by`: authenticated user UUID.
- `requested_by_employee_number`: current employee number.
- `requested_by_name`: current profile display name.

The trigger only fills null snapshot values. The snapshot is never updated when
the user later edits their profile. Keeping this logic in the database makes
snapshot creation atomic and prevents frontend profile RLS from affecting it.

Aggregate creation must still succeed when an optional display name is absent.
The UI displays a neutral fallback such as `Unknown user`. Employee number uses
`-` when unavailable.

## Existing Aggregate Compatibility

Historical aggregate rows may have null snapshot values.

The migration backfills snapshot fields from current `user_information` rows
where UUIDs match. Backfill is best effort and must not overwrite non-null
snapshot values. If the profile cannot be read or no longer exists, the
snapshot remains null and the UI uses the neutral fallbacks.

## Read Model

`getVideoCaseAggregates(videoCaseId)` continues to return aggregates ordered by
`created_at` descending and exposes:

- `requested_by`
- `requested_by_employee_number`
- `requested_by_name`
- `source_evaluation_ids`
- `source_count`
- aggregate and document statuses
- `created_at`

Every Video Case member can read all aggregate-history rows for that case under
the existing aggregate select policy.

## User Interface

Add an `Aggregate history` section below the evaluations section on
`/video-cases/:videoCaseId`.

The desktop layout is a table with:

| Column | Value |
| --- | --- |
| Aggregate | Shortened `aggregate_id` with the full value available in the row |
| Created | Local date and time |
| Created by | Snapshot display name |
| Employee no. | Snapshot employee number |
| Sources | Source count and source `evaluation_id` values |
| Analysis | Aggregate status |
| Document | Document status |
| Action | `View summary` and a leader/admin-only delete action |

Rows are ordered newest first. `View summary` navigates to:

```text
/video-cases/:videoCaseId/summaries/:aggregateId
```

On narrow screens, the table remains horizontally scrollable instead of hiding
audit fields.

Empty state copy explains that no evaluation summaries have been combined for
this Video Case yet.

The section is an audit list only. It does not restore the old large
`Combined summaries` cards or duplicate the summary content on the Video Case
detail page.

## Permissions

- Case members can view all aggregate-history rows in their Video Case.
- Case leaders can create and delete aggregates.
- System admins are treated as leaders for aggregate creation and deletion.
- Editors and other members cannot delete aggregates.
- The frontend hides delete controls for unauthorized users.
- The migration adds a `FOR DELETE` RLS policy because the current schema grants
  `DELETE` but has no aggregate delete policy.
- The delete policy permits any current case leader or system admin; deletion
  is not restricted to the original `requested_by` user.
- Database RLS remains the security boundary and rejects unauthorized deletes
  even if the client is manipulated.

## Delete Behavior

The existing aggregate delete confirmation flow is reused.

Deleting an aggregate removes the aggregate and its relational source links
through the existing cascade behavior. It does not delete source evaluations.
After deletion, the history list refreshes and the newest remaining aggregate
becomes the latest aggregate shown in the case header.

## Error Handling

- Aggregate history load failures use the existing Video Case page error state.
- Missing creator profiles do not fail the history list.
- Missing snapshot values render fallbacks rather than blank cells.
- A failed delete leaves the row visible and shows the returned error.
- Navigation to a missing aggregate uses the existing summary-page not-found
  handling.

## Testing

### Database

- The migration succeeds when the snapshot columns are absent.
- Re-running the migration succeeds when the columns already exist.
- Backfill sets null snapshot values from matching `user_information` rows.
- Backfill does not overwrite an existing snapshot.
- Existing aggregate select, insert, and update policies remain unchanged.
- The new aggregate delete policy permits case leaders and system admins and
  rejects ordinary members.

### Service

- The insert trigger writes UUID, employee number, and full-name snapshot.
- Missing optional profile name does not block aggregate creation.
- Aggregate reads preserve stored snapshots.
- Aggregate rows with missing snapshots return null identity fields.

### UI

- All case members see aggregate history.
- Rows show aggregate ID, creator, employee number, sources, statuses, and
  created time.
- `View summary` opens the correct aggregate route.
- Delete is visible only to leaders and system admins.
- Deleting refreshes the list.
- The empty state appears when no aggregates exist.
- The table remains usable on narrow screens.

### Regression

- Individual evaluations still use `evaluation_id`.
- Combined summaries still use `aggregate_id`.
- Summary calculation and n8n payloads are unchanged.
- `npm.cmd test` passes.
- `npm.cmd run build` passes.

## Deployment Order

1. Apply the additive snapshot migration.
2. Verify snapshot columns and best-effort historical backfill.
3. Deploy VIA V4 service snapshot writes and fallback reads.
4. Deploy the Video Case aggregate-history table.
5. Create one new aggregate and verify the creator snapshot.
6. Open an older aggregate and verify fallback identity behavior.

## Out of Scope

- A separate audit-event table.
- Editing creator snapshots after creation.
- Changing system roles or case roles.
- Showing aggregate history on `/my-forms`.
- Re-running n8n from the history table.
- Deleting source evaluations when an aggregate is deleted.
