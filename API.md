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

## Accounts, email and two-factor

Outgoing email goes through SMTP (`SMTP_URL`, `MAIL_FROM`). In development it lands in the local mail catcher: inbox at http://localhost:8125, API at http://localhost:8125/api/v1/messages.

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| POST | `/auth/sign-up` | `SignUpInput` | 202 `SignUpAccepted` | **Changed.** Always the same answer, no cookie. New email: stores a pending sign-up and emails a verification link (`WEB_URL/verification?token=…`, 24 h, single use). Existing email: emails a notice that an account already exists, with links to sign in and reset. Nothing is created until verification |
| POST | `/auth/verify-email` | `VerifyEmailInput` | 201 `Me` + cookie | Creates the user, tenant and OWNER membership, signs in. 422 `INVALID_TOKEN` |
| POST | `/auth/sign-in` | `SignInInput` | `SignInResult` | **Changed.** Without two-factor: `Me` + session cookie. With two-factor: `{ "mfaRequired": true }` and a short-lived httpOnly cookie `tabaa_mfa` (5 min) instead of a session |
| POST | `/auth/mfa/verify` | `MfaVerifyInput` | `Me` + cookie | Needs `tabaa_mfa`. A TOTP code or one recovery code (single use). 401 `INVALID_CODE`; 5 failures invalidate the challenge |
| POST | `/auth/mfa/setup` | | `MfaSetup` | Signed in. Starts enrolment; nothing is active yet |
| POST | `/auth/mfa/enable` | `MfaEnableInput` | `RecoveryCodes` | Confirms enrolment with a code. Returns 10 recovery codes, shown once |
| POST | `/auth/mfa/disable` | `Reauth` | 204 | Password and a current code |
| POST | `/auth/mfa/recovery-codes` | `Reauth` | `RecoveryCodes` | Regenerates; old codes stop working |
| POST | `/auth/password/forgot` | | 204 | Unchanged contract; the link is now emailed |
| POST | `/tenant/close` | `CloseTenantInput` | 204 | OWNER only. `confirmName` must equal the tenant name. See retention below |

- `Me.mfaEnabled` tells the interface whether two-factor is on.
- Emails are sent for: verification, account-already-exists, password reset, password changed, two-factor enabled or disabled, workspace closed. French, with an Arabic version beneath.
- **Closing a workspace.** Immediately: all sessions revoked, access blocked, user accounts of that workspace deleted (name, email, credentials, two-factor), drafts, catalogue and customers that appear on no issued invoice deleted. Kept, locked and unreachable through the API: issued invoices with their frozen seller and customer data, their payments, and the audit log with actor names replaced by a pseudonym. These are purged automatically once the legal retention period has passed (10 years after the end of the invoice's calendar year; value in the rule package). A daily job performs the purge.
- Rate-limit counters use Redis when `REDIS_URL` is set (required when `NODE_ENV=production`), otherwise process memory.
- Demo accounts created by the seed, all with the demo password: `demo@tabaa.ma` (OWNER), `membre@tabaa.ma` (MEMBER), `lecteur@tabaa.ma` (VIEWER).

## Invoice PDF

The web server renders the PDF from the same invoice sheet users see (headless Chromium), then stores the file of an issued invoice through the API so it never changes afterwards.

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| GET | `/invoices/:id/pdf` | | `application/pdf` | The stored file of an issued invoice, with `ETag` set to its SHA-256. 404 `PDF_NOT_GENERATED` when none is stored yet. 409 for drafts |
| PUT | `/invoices/:id/pdf` | raw `application/pdf`, max 5 MB | 204 | Requires the session AND a valid `X-Internal-Token` (only the web server may store). Issued invoices only (409 for drafts). Must start with `%PDF-`. 409 `PDF_ALREADY_STORED` if one exists: the first stored file wins |

- Stored in table `invoice_pdfs` (invoice id, bytes, SHA-256, size, created at, created by), tenant-isolated, append-only: the database rejects UPDATE and DELETE.
- The stored PDF shows the invoice as issued (stamp "ÉMISE" or "AVOIR" with the issue date), whatever its later payment status. Drafts are rendered on demand with the "BROUILLON" stamp and never stored.
- Storing writes the audit event `invoice.pdf_stored`.

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
