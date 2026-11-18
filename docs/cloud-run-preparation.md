# Cloud Run transport preparation — not deployed

This branch prepares the existing Node 26 service for a container host. None of
the existing API handlers, Firebase authentication, question limits, paid-credit
transactions, annual evidence rules or PayApp callback logic is changed. No GCP
service, billing account, IAM permission or secret has been created or modified.

`server.cjs` provides the HTTP request/response helpers previously supplied by
Vercel. It dispatches only the 11 public API handlers and exposes a minimal
`GET /healthz`. It accepts JSON and URL-encoded PayApp callbacks, preserves bearer
authorization/query values, rejects invalid/oversized requests, and never logs
request bodies or credentials. The Vercel-only forwarding header is discarded.
The direct Cloud Run ingress's final forwarded IP is used for existing telemetry;
this assumption must be checked on the actual managed ingress before cutover.
Adding another proxy/load balancer requires reviewing that trust boundary.

The Dockerfile uses Node 26, the existing lockfile, a non-root runtime, and an
explicit source allowlist. Tests, `.git`, local environments and documentation
are excluded from the build context. A Docker engine is unavailable locally,
so the public repository's standard Linux CI was used instead. It passed all
148 tests on Node 26, built the image, started it without provider credentials,
and verified the health endpoint. [Successful container verification](https://github.com/ganzibit7-eng/taekilso-backend/actions/runs/44241600372).
No image was pushed to a paid registry. Real Cloud Run ingress, concurrent AI
requests and billing configuration remain release gates.

## Proposed initial service configuration, subject to cost approval

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

### Approval and live-account check — 2026-11-18

The operator explicitly approved Cloud Run usage-based billing and requested
cost notifications. The remaining blocker is account activation, not approval:
the linked billing account is closed, project `billingEnabled` is false, and
Google's console disables reopening it because it is not in good standing.
No active billing account was returned for the signed-in operator. The console
also disables creation of budgets. No Cloud Run service or billing alert has
been created, and production API URLs remain on Vercel.

After the operator resolves the account status, first create a monthly
alerts-only budget of KRW 10,000 scoped to this project across all Google Cloud
services. Notify the billing-account administrators/users at 50%, 90% and 100%
actual spend and at 100% forecast spend. Preserve any existing alert settings.
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

No production frontend endpoint has been changed to point to this preparation.
