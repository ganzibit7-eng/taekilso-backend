# Cloud Run migration — staged, production cutover pending

This branch prepares the existing Node 26 service for a container host. None of
the existing API handlers, question limits, paid-credit transactions, annual
evidence rules or PayApp callback logic is changed. The new Google runtime uses
its attached identity for the same Firebase project instead of exporting a
private key from Vercel. Existing Vercel initialization is preserved.

`server.cjs` provides the HTTP request/response helpers previously supplied by
Vercel. It dispatches only the 11 public API handlers and exposes a minimal
`GET /health-check` (avoiding Cloud Run's reserved paths ending in `z`). It accepts JSON and URL-encoded PayApp callbacks, preserves bearer
authorization/query values, rejects invalid/oversized requests, and never logs
request bodies or credentials. The Vercel-only forwarding header is discarded.
The direct Cloud Run ingress's final forwarded IP is used for existing telemetry;
this assumption must be checked on the actual managed ingress before cutover.
Adding another proxy/load balancer requires reviewing that trust boundary.

`runtime-auth.cjs` initializes the default Firebase app only on Cloud Run when
the existing JSON credential is absent. It validates the configured project and
signing identity. The existing handlers reuse this app without changing their
authentication or authorization checks. No new private key is created.

The Dockerfile uses Node 26, the existing lockfile, a non-root runtime, and an
explicit source allowlist. Tests, `.git`, local environments and documentation
are excluded from the build context. A Docker engine is unavailable locally,
so the public repository's standard Linux CI was used instead. It passed all
152 tests on Node 26, built the image, started it without provider credentials,
and verified the health endpoint. [Successful container verification](https://github.com/ganzibit7-eng/taekilso-backend/actions/runs/44247020091).
The same commit was built in Cloud Build and stored in the project's Seoul
Artifact Registry. The staged Cloud Run service starts successfully and still
requires Google IAM invocation authentication. Production URLs are unchanged.

## Approved initial service configuration

- Request-based billing; minimum instances 0; initially at most 2 instances.
- Start with 1 vCPU and 512 MiB, with conservative per-instance concurrency 10.
- Request timeout 300 seconds, preserving the current long annual generation.
- Keep the current Firebase project and all user/payment data in place.
- Transfer only the existing required environment values through secure provider
  configuration. Do not publish them, commit them, or request them in chat.
- Preserve the current PayApp callback while outstanding orders may still use it.
- Do not route real users or callbacks until account isolation, credits, refund
  idempotency, annual generation and concurrent requests pass on the new service.

These are starting settings, not a measured capacity guarantee. Load-test with
stubbed AI/payment providers before selecting concurrency. Scaling and budget
notifications reduce risk but do not create a hard monetary spending cap.

## Cost boundary

Cloud Run has monthly free usage allowances and no required fixed monthly
subscription. A billing-enabled Google Cloud account is required; compute beyond
the allowance, network traffic, builds and artifact storage can incur charges.
Do not enable billing or deploy paid resources without explicit approval.

### Current account and verification state — 2026-11-18

The operator explicitly approved usage-based billing and then created an active
replacement billing account. The existing `taekilso` project is linked to it and
billing is enabled. After a separate, explicit permission approval, dedicated
`taekilso-api` and `taekilso-build` identities were created. The runtime has
Firestore data access, Firebase Authentication administration, self token-signing
and access to only the four named migration secrets. The builder has write access
to the dedicated image repository and permission to write build logs.

An alerts-only monthly budget of KRW 10,000 is saved for this project across all
Google Cloud services. It notifies the billing-account administrators/users and
project recipients at 50%, 90% and 100% actual spend and 100% forecast spend.
This budget is a notification threshold, not an automatic service shutdown or
guaranteed spending cap. External Claude API costs are outside this budget.

Retain the conservative two-instance limit and disable startup CPU boost for the
initial request-based service. Observe memory use and real request concurrency
before increasing resources. The adapter's additional overlapping-request check
covers 30 distinct synthetic tokens/profiles without provider calls; it does not
replace real Cloud Run authentication, payment and AI verification.

Sources: [Cloud Run pricing](https://cloud.google.com/run/pricing),
[request timeout](https://docs.cloud.google.com/run/docs/configuring/request-timeout),
[container runtime contract](https://docs.cloud.google.com/run/docs/container-contract).

The staged service is `taekilso-api` in `asia-northeast3`. It uses one vCPU,
512 MiB, request-based billing, zero minimum instances, at most two instances,
concurrency 10, timeout 300 seconds and no startup CPU boost. A one-off job on the
same image/identity successfully checked Firestore reads, Firebase Auth access
and custom-token signing without member or payment writes.

Vercel's existing Production Secrets cannot be read back. The operator must enter
the Claude key, PayApp LINKVAL and existing administrator deletion password into
the new named Secret Manager secrets. Their empty containers must never be
treated as configured credentials. Telemetry has a new stable secret; anonymous
network/session hash continuity across the old and new platform is not preserved,
but existing aggregate counters and member/payment records stay in the project.
Use a UTF-8 string for environment-mounted secrets, not raw random bytes.

No production frontend endpoint has been changed. Remaining release gates:
populate/verify required secret versions; test actual ingress and application
authentication; verify consultation/annual/report and payment flows; publish the
frontend endpoint change with a rollback; preserve historical PayApp callbacks.
