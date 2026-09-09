# Community end-to-end tests

These tests are intentionally fail-closed. They must run through the disposable environment launcher; running Playwright against the normal development environment is rejected before the web server starts.

The launcher must provision and migrate a new PostgreSQL database, seed three distinct users, create a run-specific storage directory, export the variables below, and clean both resources in a `finally` block.

Required variables:

- `COMMUNITY_E2E_ALLOW=1`
- `E2E_DISPOSABLE_DATABASE=1`
- `E2E_DISPOSABLE_STORAGE=1`
- `DATABASE_URL` whose database name contains a standalone `e2e` segment
- `E2E_STORAGE_ROOT` whose absolute path contains a standalone `e2e` segment
- `E2E_BASE_URL` using `http://localhost:<isolated-port>` or `http://127.0.0.1:<isolated-port>`
- `NEXTAUTH_SECRET`, generated for the test run
- `E2E_USER_A_EMAIL` and `E2E_USER_A_PASSWORD`
- `E2E_USER_B_EMAIL` and `E2E_USER_B_PASSWORD`
- `E2E_USER_C_EMAIL` and `E2E_USER_C_PASSWORD`

`E2E_WEB_SERVER_COMMAND` is optional. When absent, Playwright starts Next.js directly on the host and port from `E2E_BASE_URL`. Existing servers are never reused.

The package manifest must provide `@playwright/test` as a development dependency. CI must install Chromium before executing the suite. Authentication cookies, traces, screenshots and videos stay under ignored `test-results/` and `playwright-report/` directories.
