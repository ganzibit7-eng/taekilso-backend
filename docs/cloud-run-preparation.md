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
are excluded from the build context. A Docker engine is unavailable locally:
the image has **not** been built or started. The transport and existing test
suite pass on local Node 24; Node 26/container verification remains a release gate.

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

Sources: [Cloud Run pricing](https://cloud.google.com/run/pricing),
[request timeout](https://docs.cloud.google.com/run/docs/configuring/request-timeout),
[container runtime contract](https://docs.cloud.google.com/run/docs/container-contract).

No production frontend endpoint has been changed to point to this preparation.
