// When an evaluation got stuck, the submitter (or an admin) resubmitted the same
// video case, which created a second evaluation row. Users should see one entry per
// case: a ready copy replaces every unfinished copy of the same user and case, and
// without a ready copy only the newest unfinished one is shown.

const groupKey = (row) => (row?.user_id && row?.video_case_id ? `${row.user_id}\u0000${row.video_case_id}` : null);
const createdMs = (row) => {
  const value = Date.parse(row?.created_at);
  return Number.isFinite(value) ? value : 0;
};
const newestFirst = (a, b) => createdMs(b) - createdMs(a) || Number(b.id) - Number(a.id);

export function collapseSupersededEvaluations(rows) {
  const groups = new Map();
  for (const row of rows ?? []) {
    const key = groupKey(row);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const visible = new Set();
  for (const group of groups.values()) {
    const ready = group.filter((row) => row.document_status === "ready");
    if (ready.length > 0) ready.forEach((row) => visible.add(row));
    else visible.add([...group].sort(newestFirst)[0]);
  }
  return (rows ?? []).filter((row) => !groupKey(row) || visible.has(row));
}

// The ready copy that replaces an unfinished evaluation, or null.
export function findSupersedingEvaluation(record, siblings) {
  const key = groupKey(record);
  if (!key || record.document_status === "ready") return null;
  const ready = (siblings ?? []).filter((row) => row.id !== record.id && groupKey(row) === key && row.document_status === "ready");
  return ready.sort(newestFirst)[0] ?? null;
}

// Ids of the rows that collapseSupersededEvaluations would hide.
export function findSupersededIds(rows) {
  const visible = new Set(collapseSupersededEvaluations(rows).map((row) => row.id));
  return new Set((rows ?? []).filter((row) => !visible.has(row.id)).map((row) => row.id));
}
