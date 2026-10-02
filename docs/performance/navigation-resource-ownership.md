# Workspace navigation ownership

## Bottleneck and scope

Previously Today, Tasks, Notes and Calendar awaited their entire server read model before the route could mount its client workspace loader. A memory-cache hit could not remove that wait. The loader then unconditionally seeded the cache from the RSC payload, including potentially older prefetched payloads. Notes also blocked in its layout on the complete file navigator.

The new route components own URL state only. The existing authenticated, `private, no-store` workspace APIs own data; one memory-only resource owns each workspace in the tab. Explicit shell navigation starts the read alongside RSC navigation. Hover/idle warming respects data saver, idle reads run serially, and the loader shares an in-flight read. Notes' complete navigator metadata is included in its list response, removing the second folder query and layout gate; document bodies remain on demand.

There is no database migration, provider write, security-policy change, shared data cache or persistent private read cache in this change. Existing layout and API authorization checks remain in place.

## Correctness contracts

- The authenticated layout supplies owner identity and an opaque revision. A changed owner is gated before child cache access. Same-owner session draft recovery survives a full reload; another owner cannot reuse it.
- A current API 401/403 evicts tab resources and recovery drafts. A superseded old request, including an old-owner 401, cannot publish or evict newer data.
- `mutate`, `set`, invalidation and clear detach/abort older reads. Superseded promises reject so imperative consumers cannot accidentally install their old result outside the cache.
- Existing primary-workspace Server Action invalidations use an awaited wrapper. It preserves `revalidatePath` and updates a session-only, HttpOnly, SameSite=Lax opaque revision cookie. Next's normal cookie-update rendering supplies the new revision to the persistent boundary. This does not authorize anything or contain user data.
- Revision changes detach all earlier reads, refresh subscribed workspaces, and leave inactive workspaces stale until used. Mounted editors retain their state. Resource leases stop asynchronous old-owner component callbacks from publishing.
- Note autosave patches/invalidates only tab metadata after a confirmed save, without causing RSC revalidation on each typing pause. Scope checks preserve isolation for late callbacks.
- Active calendar ranges subscribe to changes and reconcile records without remounting their draft or selected-event editor.
- Search parameters and Next navigation history continue to determine selection. No custom history/router replacement was introduced.

## Additional real query improvement

Today now overlaps the timezone-independent focus-candidate query with workspace source reads. Timezone-dependent priorities still use the resolved profile timezone. This removes avoidable serialization when candidate reads dominate; it does not eliminate the source-to-priority dependency or guarantee a whole round trip saved in every latency distribution.

## Verification and measurements

The CI browser fixture uses production builds, the real workspace loaders, the resource cache, and Next navigation. It injects 80/800 ms data delays and 100 ms RSC latency, with these distinct cases:

- Cold in-app navigation
- Workspace data cache warm, RSC route cache missing
- Both workspace data and the RSC route prefetched

A baseline fixture reproduces the former data-before-loader gate. The benchmark's JSON labels are deliberately synthetic. Route-prefetched baseline cases may already be fast. The test also exercises real Server Action revision-cookie propagation, fresh active data, preserved draft input, and Back/Forward. CI artifacts include timing JSON and warm-navigation screenshots.

These numbers are not authenticated production-user latency or real Supabase timings. Hard reload remains hydration/API-dependent and can add a client round trip compared with full SSR data. A login-gated production browser measurement is still needed to quantify that tradeoff and backend/region latency.
