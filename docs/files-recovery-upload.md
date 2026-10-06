# Files upload and archive integrity foundation

This change is a local candidate. It does not provision backups, change R2 access,
run a production restore, or certify deployed configuration. Files portability
is documented separately in `files/portable-export.md`.

## Upload state transition

1. Browser uploads to the existing owner/document staging key, using the existing
   five-minute signed PUT. Browser SHA-256 is the expected checksum when present.
2. Finalization streams the staging object, validates length and SHA-256, and
   captures its ETag. Missing/incorrect bytes never become `available`.
3. The server conditionally copies the observed source to a unique same-document
   `sealed-<uuid>` key. No browser upload URL is issued for this destination.
4. The server streams and hashes that sealed object too. ETag is used only as a
   concurrency token, never as a cryptographic integrity assertion.
5. A compare-and-set changes only the matching unarchived `pending` record to
   `available`, recording its sealed path and observed SHA-256. A concurrent
   archive or another completion cannot be overwritten by this update.
6. Repeating finalization for an already available file succeeds without creating
   another copy. Archived files stay archived. Notes retries must still have the
   requested attachment association.

Legacy uploads that did not supply SHA-256 gain an observed server checksum;
this cannot establish what bytes the user originally intended to upload. Existing
available files are not rewritten or silently claimed to have been reverified.
The separate same-origin Notes-image upload route is unchanged.

## Conservative retention and costs

Staging objects and losing/error-case sealed copies are retained by this phase.
A normal new upload can therefore occupy about twice its file size in R2, with
extra reads and a copy operation during finalization. This is deliberate until
an inventory-aware cleanup policy is reviewed. It is not storage deduplication,
provider-level object lock, version retention, or protection from account-level
credentials that can overwrite/delete objects. No new lifecycle or bucket policy
is configured.

Existing pending-upload cleanup now deletes R2 bytes only if the conditional
pending metadata delete actually removed a row. This avoids deleting an available
file after a concurrent finalization. The existing one-hour stale-upload policy
is unchanged; unfinished uploads are not a committed backup.

## Archive recovery and truthful state

Archive remains metadata-only. Restore streams the original and verifies length
and any recorded SHA-256 before clearing archive state. A missing/corrupt object
stays archived; recovery requires a readable original or an independent backup.
A lost-response restore retry for an already available row succeeds.

Audit writes remain separate from mutations (no schema migration or transaction
RPC was introduced). If a confirmed write succeeds but audit insertion fails, the
UI reports a saved-with-warning result instead of pretending the file write
failed. This is not an atomic or tamper-proof audit guarantee. Uncertain archive
responses tell the user to refresh and check; they do not claim a rollback.

Workspace reads now keyset-page files, folders, links, and all archived files,
including past the previous 50-row archive cap. Errors on any page fail visibly
instead of silently presenting a partial successful list. A 20,000-row per-query
safety ceiling fails closed. The UI still renders the resulting collection;
large-library virtualized/incremental browsing remains future work.

## Verification and release gates

Synthetic tests cover chunk hashing, corruption, truncation, missing originals,
conditional-copy failure, sealed-object corruption, available/archived retry,
archive/cleanup races, saved-with-audit-warning, and capped/short API pagination.
No production file bytes or credentials are test fixtures.

Before publication is called operationally verified: review the patch; run all
checks; verify the deployed provider supports conditional copy using the existing
bucket-scoped permissions and that real browser authentication/origin/runtime
limits work with explicitly authorized synthetic files. No production original
should be deleted for testing. Independently retained, encrypted backups and a
full database/object restore remain separate requirements.
