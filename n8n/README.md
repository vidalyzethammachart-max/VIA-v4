# VIA V4 n8n Code node patch — applied and read back

These are replacement **Code node bodies**, not a complete importable workflow.
All three have been applied to the active workflow through the public API. Do not upload these files as
a workflow JSON, change credentials, or replace workflow connections.

The user approved applying these three replacements on 2026-09-20 ("แก้ได้เลย").
No repeated approval was needed for this scope. The user supplied an API key in
gitignored `.env.local`. The key and complete workflow snapshots are not committed.
Browser control has been restored. Real individual executions `2981` and `2982`
completed against the patched active version, with successful callbacks to
evaluations `235` and `236`. See the current acceptance report for aggregate and
permissions results.

Applied sequentially and verified from fresh API readbacks:

| Step | Active version | Contract tests |
| --- | --- | --- |
| Transform | `6035b7f6-0282-47e9-9d9b-3553aa0fcefc` | 3 passed / 0 failed |
| Assemble context | `87a2b682-2dc7-4b3f-ad42-2d3fc345c383` | 5 passed / 0 failed |
| Build final body | `1ed79df7-93de-41db-be08-763b7fcc2962` | 9 passed / 0 failed |

Each readback verified exact expected nodes, activeVersionId matching versionId,
and published node bodies matching the saved node bodies. Connections, settings,
credentials, pinData, staticData, metadata, tags, shares and description were unchanged.
These are offline contract tests of the live code, not real n8n executions.

The initial PUT returned HTTP 400 because the n8n 1.123.80 API settings schema
rejects `timeSavedMode`. Exact-version official source confirms that updates merge
settings with stored values. Omitting this unsupported request property preserved
its stored value, as verified in every readback. An automatic approval rejection
on this concern was resolved by that exact-version evidence before retrying.

Baseline inspected on 2026-09-20:

- Workflow: `VIA-v4`, ID `nl38M3CrQPQXpg0G`, Active, 17 nodes.
- Exported version ID: `c2bfc1ec-80a2-4a55-98ad-90245c211433`.
- The exported workflow JSON stays outside the repository. It can contain
  credentials/header values and pinned data; never commit or print it wholesale.

## Three targeted replacements

| Existing node | Replacement file | Change |
| --- | --- | --- |
| Transform VIA Payload | [transform-via-payload.js.txt](nodes/transform-via-payload.js.txt) | Preserve fractional summary scores instead of rounding them to integers; keep individual normalization unchanged. |
| Assemble Final Evaluation Context | [assemble-final-evaluation-context.js.txt](nodes/assemble-final-evaluation-context.js.txt) | Carry document type, the appropriate primary ID, source provenance, averages and callback context. Summary output omits `evaluation_id`. |
| Build Final AppScript Body | [build-final-appscript-body.js.txt](nodes/build-final-appscript-body.js.txt) | Preserve fractional summary rubric scores in the document request; keep individual normalization unchanged. |

The `.js.txt` extension is intentional: n8n Code nodes use top-level `return`
and n8n-provided input accessors. Paste the complete file into the existing
node's JavaScript editor after approval. The tests execute these same files.

## Reproduce and verify

Candidate tests, without network calls or database writes:

```powershell
node --test tests/n8nVideoCaseContract.test.js
npm.cmd test
npm.cmd run build
git diff --check
git status --short
```

To audit a freshly downloaded workflow instead of the candidate scripts, set
the export path for the test process:

```powershell
$env:VIA_N8N_WORKFLOW_EXPORT = 'C:\Users\phira\Downloads\VIA-v4.json'
node --test tests/n8nVideoCaseContract.test.js
Remove-Item Env:VIA_N8N_WORKFLOW_EXPORT
```

The baseline reproduces three failures: fractional scores are rounded in
Transform and Build Final, and Assemble drops summary metadata. The score 1/5
case itself produces 3.00 even on the baseline, so it cannot detect rounding of
fractional averages. Tests include 1.5, 2.5, 3.25 and 4.5 as separate inputs.

The final-body recovery test also demonstrates an existing working behavior:
Build Final reads the primary ID from Normalize/Transform using n8n node
references, even when the AI/report parser output contains no IDs. Do not claim
that missing intermediate IDs alone proves that the final callback targets the
wrong record. Real individual callbacks now verify the correct target; aggregate
callback evidence is tracked separately in the acceptance report.

## Approval and rollout boundary

1. Approval to edit these three nodes in the active workflow has been received.
   Keep the edit within this approved scope.
2. Re-export and check that the workflow version and the three original code
   bodies still match this baseline before applying. If they changed, compare
   and adapt the patch rather than overwriting newer work.
3. Replace only these code bodies; preserve node IDs, credentials, prompts,
   URLs, connections and active status. Save through the workflow UI or public API.
4. Export the saved version and rerun the export audit against that file.
5. Run the approved synthetic individual/aggregate flow and capture actual
   execution IDs, source snapshots, callback results and document downloads.
   Local tests are not acceptance evidence for the cloud execution or Apps Script.

Original code SHA-256 (exact `jsCode` strings from the baseline export):

| Node | SHA-256 |
| --- | --- |
| Transform VIA Payload | `8b71ce1b55cc7521faa9818de79436fe9da9f7823f5ca83d0f4561de706b9583` |
| Assemble Final Evaluation Context | `c2bcbfbcf3659657d0f3e0dbc5eec9a7c051470697360c5db7aec707bd8288b0` |
| Build Final AppScript Body | `5c79c599f4c363a16b31b8d09419a4c5964e124f71d8713760faf7735112420e` |
