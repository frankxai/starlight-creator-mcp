# @starlight-intelligence/creator-provider-muapi

MuAPI provider for the creator substrate (226-model aggregated catalog).

MuAPI adapter with the bundled 226-model catalog (51 text-to-image, 57 image-to-image, 43 text-to-video, 62 image-to-video, 4 video-to-video, 9 lipsync). Regenerate the catalog with `node build-catalog.mjs`.

Part of the [Starlight creator substrate](https://github.com/frankxai/starlight-creator-mcp). BYOK and local-first: provider keys stay in the user's OS keychain and generated media stays on their machine.

Submission recovery: an HTTP 5xx response may still identify an accepted job. The
adapter uses a 16 KiB JSON-body budget and a 250 ms deadline to recover a valid `request_id` or
`id`, then polls that same job through the normal job-status path. It does not
send another generation POST after a 5xx. Missing, malformed, oversized or stalled
responses return an explicit uncertain-outcome error marked non-retryable; check
provider job history before choosing to submit again. This prevents automatic
replay by this adapter and does not establish provider-wide exactly-once billing.
HTTP 429 keeps its bounded, Retry-After-aware retry behavior.

Reference: [MuAPI's submission and polling guidance](https://muapi.ai/blog/nano-banana-2-lite-api).

MIT.
