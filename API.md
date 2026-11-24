# API contract (milestone 1)

Base URL `http://localhost:4100/v1`. JSON. All shapes are the zod schemas in `packages/core/src/contracts.ts`.
Every `/v1` route except `/v1/auth/*` requires a session (see Authentication); the tenant comes from the session.

## Authentication

Session cookie `tabaa_session`: httpOnly, SameSite=Lax, Secure in production, 30-day rolling expiry. No bearer tokens yet.

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| POST | `/auth/sign-up` | `SignUpInput` | 201 `Me` + cookie | Creates the user, a tenant named `companyName`, and an OWNER membership. 409 `EMAIL_TAKEN` |
| POST | `/auth/sign-in` | `SignInInput` | `Me` + cookie | 401 `INVALID_CREDENTIALS` (same answer for unknown email and wrong password); 429 `TOO_MANY_ATTEMPTS` |
| POST | `/auth/sign-out` | | 204 | Revokes the session, clears the cookie |
| POST | `/auth/password/forgot` | `ForgotPasswordInput` | 204 | Always 204. In development the reset link is written to the API log |
| POST | `/auth/password/reset` | `ResetPasswordInput` | 204 | Single-use token, 1 hour. Revokes the user's other sessions. 422 `INVALID_TOKEN` |
| GET | `/me` | | `Me` | 401 `UNAUTHENTICATED` without a valid session |

Roles: `OWNER`, `ADMIN`, `MEMBER` may read and write; `VIEWER` may only read (403 `FORBIDDEN` on writes). Any `/v1` route without a session answers 401 `UNAUTHENTICATED`.

Errors: non-2xx responses carry `ApiError` (`{ code, message, issues? }`).
`404 NOT_FOUND`, `409 CONFLICT` (state does not allow the action), `422 VALIDATION` (with `issues`).

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| GET | `/company` | | `Company` or `null` | The tenant's company |
| PUT | `/company` | `CompanyInput` | `Company` | Create or replace |
| GET | `/parties?kind=&q=` | | `Party[]` | `q` searches name and ICE |
| POST | `/parties` | `PartyInput` | `Party` | |
| GET | `/parties/:id` | | `Party` | |
| PATCH | `/parties/:id` | partial `PartyInput` | `Party` | |
| DELETE | `/parties/:id` | | 204 | 409 if referenced by an invoice |
| GET | `/items?q=` | | `Item[]` | |
| POST | `/items` | `ItemInput` | `Item` | |
| PATCH | `/items/:id` | partial `ItemInput` | `Item` | |
| DELETE | `/items/:id` | | 204 | |
| GET | `/invoices?state=&status=&q=&customerId=` | | `InvoiceSummary[]` | `status` = `UNPAID`, `PARTIALLY_PAID`, `PAID`, `OVERDUE`; newest first |
| POST | `/invoices` | `InvoiceInput` | `Invoice` | Creates a draft. `dueDate` defaults from the legal-term calculator |
| GET | `/invoices/:id` | | `Invoice` | |
| PATCH | `/invoices/:id` | `InvoiceInput` | `Invoice` | Drafts only, else 409 |
| DELETE | `/invoices/:id` | | 204 | Drafts only, else 409 |
| POST | `/invoices/:id/issue` | | `Invoice` | Runs `validateForIssue`; 422 with issues if blocking. Allocates the number, freezes the invoice |
| POST | `/invoices/:id/credit-note` | | `Invoice` | Issued invoices only. Creates a draft credit note copying the lines, `originalInvoiceId` set |
| GET | `/invoices/:id/ubl` | | `application/xml` | Issued invoices only |
| POST | `/invoices/:id/payments` | `PaymentInput` | `Invoice` | Issued invoices only; 422 if amount exceeds what is due |
| DELETE | `/payments/:id` | | `Invoice` | Returns the updated invoice |
| GET | `/dashboard` | | `Dashboard` | Includes 6-month series, aging buckets, top customers, last 8 invoices |

## Security additions

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| POST | `/auth/sign-out-all` | | 204 | Revokes every session of the current user, including this one |
| GET | `/audit-events?limit=&before=` | | `AuditEvent[]` | OWNER and ADMIN only. Newest first, `limit` max 100, `before` is an ISO timestamp cursor |
| GET | `/export` | | JSON | OWNER only. The tenant's company, parties, items, invoices and payments |

- Sessions: 8 hours idle, 14 days absolute.
- `Invoice.seller` is the company frozen at issuance (legal identifiers, address, bank details). Issued invoices, their UBL and their rendering never read the live company. For drafts it is the live company.
- Input bounds are enforced by the shared schemas (line count, text lengths, decimal digits).
- `DELETE /payments/:id` no longer deletes: it marks the payment void (kept in the database, excluded from totals and from `Invoice.payments`). OWNER and ADMIN only.
- OWNER and ADMIN only (403 `FORBIDDEN` otherwise): `PUT /company`, `DELETE /payments/:id`, `DELETE /parties/:id`, `DELETE /items/:id`, `DELETE /invoices/:id`.
- Every state-changing request and every authentication event writes an append-only audit event.
- The web server identifies itself with `X-Internal-Token` (`INTERNAL_API_TOKEN`) and passes the browser's address in `X-Client-IP`; the API uses that address for rate limiting and audit only when the token matches.

Rules:

- Numbering: one unbroken sequence per company, document type and year, formatted `FA-2026-00001` (invoice and deposit) and `AV-2026-00001` (credit note). The number is allocated inside the issuing transaction with a row lock.
- An issued invoice is immutable; the database rejects updates to it.
- `totals`, `amountInWords`, `paidAmount`, `paymentStatus`, `overdue` are always computed by the server with `@facture/core`.
- Every table has `tenant_id` with row-level security.
