# Private resumable Files uploads

Release requires reviewed migrations `20261007092752_document_reading_progress.sql`
and `20261007093836_resumable_file_uploads.sql`, the existing server-only Supabase
admin configuration, and the existing private R2 configuration. No credentials,
bucket permissions, lifecycle settings, public URLs or production data are changed
by this implementation. Run the dedicated Document continuity CI gates first.

## User flow and resource limits

Files of at least 8 MiB use multipart upload; the 100 MiB single-file limit remains.
Smaller files keep the existing single PUT flow and Notes images are unchanged.
The browser hashes the entire selected file with 1 MiB incremental SHA-256 reads,
not an entire-file ArrayBuffer. Two file workers each send at most two 8 MiB Blob
parts, bounding active payloads to four parts / 32 MiB plus small hash buffers.

The server persists each session for six days and lists up to 20 unfinished
sessions. Refresh, module navigation, process exit or a network interruption does
not discard provider parts. The owner reselects the original file; its full SHA-256,
size, MIME, normalized name and original folder must match. Picker cancellation
leaves the session alone. R2's authoritative ListParts result determines missing
parts; browser ETags, paths, upload IDs, owner IDs and claimed part lists are never
accepted. Two devices selecting identical bytes/folder/name get the same session.
Successful retry after a lost final response uses the same document ID.

The Files panel provides Resume, Pause, finish confirmation and explicit Cancel.
Pause aborts browser requests while retaining confirmed parts. Cancel aborts only
that pending multipart upload. It does not delete documents or completed objects.
Byte-count progress stops short of successful final verification in the workspace.
No File handle, signed URL or private upload metadata is persisted in browser storage.

## Integrity and concurrency

Owner authentication precedes each private API operation. Input bodies are capped
at 4 KiB while streaming. The provider session table has forced RLS, no client
privileges and service-only RPCs. Backend lookups bind session, owner, document,
bucket, path, size and SHA-256. A per-owner transactional admission lock prevents
creation retries from generating duplicate documents. At most 20 unfinished,
unexpired pending documents may have active sessions; saved documents do not
consume this allowance.

Provider part URLs expire in five minutes and authorize one part number and length.
No new browser request headers or exposed ETag CORS header are required. Geometry
validation rejects duplicates, overflow, unexpected part sizes, invalid part numbers
and malformed ETags before completion. Full SHA-256 is authoritative, not ETags.

Initialization, completion and cancellation use compare-and-set operation leases.
A completion and cancellation cannot both claim a session. Expired completing or
uploaded sessions can be explicitly canceled once any live lease ends. Atomic
publication locks the document then session, requires uploaded state, and changes
the document to available and session to completed in the same transaction, so
cancellation cannot be followed by stale publication. A crashed operation can
be retried after its 330-second lease, longer than the API's 300-second runtime.
If CompleteMultipartUpload succeeded but its reply was lost, a retry verifies the
actual complete object before marking it uploaded. Proven corrupt bytes enter a
failed state that permits explicit cancellation and a fresh attempt. Transient
network failures keep the recoverable state. A provider `NoSuchUpload` alone never
proves success.

Multipart assembly is followed by streaming size/SHA-256 verification. Only then
can the existing upload finalizer perform its conditional immutable sealed copy,
verify the sealed bytes, CAS the document to available, write completion audit and
schedule the existing cached PDF cover. Single-PUT retries, stale cleanup and the
legacy delete endpoint exclude multipart rows. Audit contains status/document IDs,
never provider upload IDs or signed URLs.

## Retention, recovery and limits

Incomplete R2 uploads expire after seven days under R2's default policy; a bucket's
existing custom policy may expire them earlier. The application makes no lifecycle
change. Expired/missing provider sessions require a new upload. Canceled document
metadata is retained with terminal storage_state=cancelled and the upload session
is atomically marked aborted, with audit preserved. It is not an unresolved original
in backup verification and must never be reported as recovered bytes. Any
completed-but-unpublished staging objects are retained, consistent
with the existing conservative cleanup policy; cancellation is not object cleanup.
A SQL failure after provider initiation can leave an empty orphan multipart that
R2's existing lifecycle can eventually expire.

`file_upload_sessions` is transient provider state and must be explicitly excluded
from portable backups/restores. R2 multipart IDs/parts cannot be recreated by
restoring database rows. Only verified available documents are committed originals.
The new `documents.upload_mode` is retained as provenance, not a resumability promise
for restored originals.

## Verification and sources

Unit/API tests cover owner denial, rejected provider inputs, bounded hashing,
identity mismatch, original-root-folder resume, skipping parts, interruption,
part geometry, private signing, lost replies, corruption, cancel/complete conflicts,
idempotency and legacy finalization. Synthetic SQL covers service-only access,
foreign-folder denial, leases, retry identity and terminal-state guards. PostgreSQL
CI adds simultaneous create/init and complete/cancel races. The isolated browser
fixture covers refresh/reselect/wrong-file/picker-cancel/repeated-cancel flows with
17 MiB synthetic files and verifies successful parts are not reuploaded.

Local typecheck, changed-source lint and webpack production build pass. Full-suite
results are recorded in the implementation handoff. Local Chromium cannot launch
under this executor's socket restrictions; real-browser and separate-connection
PostgreSQL evidence must come from CI. No production R2 smoke test was run. Before production acceptance, review an
explicitly authorized synthetic staging smoke for the deployed bucket: presigned
UploadPart behavior (including SDK length/checksum headers), existing PUT CORS,
ListParts, interruption/reselect, completion and immutable sealing. The code adds
no required custom browser header or exposed-ETag dependency. No permissions or
CORS changes are part of this implementation.

Official references reviewed:
- https://developers.cloudflare.com/r2/objects/upload-objects/
- https://developers.cloudflare.com/r2/api/s3/api/
- https://developers.cloudflare.com/r2/api/error-codes/
