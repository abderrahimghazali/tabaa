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

## Sending invoices by email

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| GET | `/invoices/:id/send-preview?kind=` | | `SendInvoicePreview` | Default recipient (the customer's email, if any), subject and message for `INVOICE` or `REMINDER`, in the invoice's language |
| POST | `/invoices/:id/send` | `SendInvoiceInput` | `Invoice` | Issued invoices and credit notes only (409 for drafts). Requires the stored PDF: 409 `PDF_NOT_GENERATED` if none (the web server generates it first). `REMINDER` only when something remains due |

- The email carries the stored PDF, and the UBL file when `attachUbl` is true. `From` is the platform address with the company name as display name; `Reply-To` is the company's email when set. French, with Arabic beneath when the invoice language includes Arabic. No tracking pixel, no remote images.
- Each send is recorded (`Invoice.deliveries`, `InvoiceSummary.lastSentAt`) and audited as `invoice.sent` or `invoice.reminder_sent`.
- Limits per workspace: 200 emails per day and 20 per hour (429 `SEND_LIMIT`), so an account cannot be used to send bulk mail. Recipients beyond 5 are rejected by the schema.
- Allowed roles: OWNER, ADMIN, MEMBER.

## Team, roles and workspaces

A user can belong to several workspaces (an accountant with several clients). The session has one active workspace.

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| GET | `/team` | | `Team` | Members and pending invitations. OWNER and ADMIN see invitations; others get `invitations: []` |
| POST | `/team/invitations` | `InviteInput` | `Invitation` | OWNER, ADMIN. Only an OWNER may invite an OWNER. Emails a link `WEB_URL/invitation?token=…` valid 7 days, single use. 409 `ALREADY_MEMBER`, 409 `ALREADY_INVITED` (resend instead), 429 `INVITE_LIMIT` (30 invitations per workspace per day) |
| POST | `/team/invitations/:id/resend` | | `Invitation` | New token and expiry; the previous link stops working |
| DELETE | `/team/invitations/:id` | | 204 | |
| PATCH | `/team/members/:userId` | `ChangeRoleInput` | `TeamMember` | OWNER, ADMIN. Only an OWNER may grant or remove OWNER. The last OWNER cannot be demoted (409 `LAST_OWNER`). An ADMIN cannot change an OWNER |
| DELETE | `/team/members/:userId` | | 204 | Removes the membership and revokes that user's sessions on this workspace. The last OWNER cannot be removed. A member may remove themself (leave) |
| GET | `/auth/invitations/:token` | | `InvitationPreview` | Public. 404 `INVALID_TOKEN` when unknown, used or expired |
| POST | `/auth/invitations/accept` | `AcceptInvitationInput` | `Me` + cookie | No account for that email: `name` and `password` required, the account is created (email counts as verified) and signed in. Account exists: the caller must be signed in as that email (401 `SIGN_IN_REQUIRED` otherwise); the membership is added and the session switches to the new workspace |
| POST | `/auth/switch-tenant` | `SwitchTenantInput` | `Me` | Switches the active workspace of the current session. 403 if not a member |

Permissions:

| | OWNER | ADMIN | MEMBER | ACCOUNTANT | VIEWER |
|---|---|---|---|---|---|
| Read everything, PDF, UBL | yes | yes | yes | yes | yes |
| Create, edit, issue invoices; record payments; customers and items | yes | yes | yes | no | no |
| Send invoices by email | yes | yes | yes | no | no |
| Void payments, delete records, company settings | yes | yes | no | no | no |
| Activity log | yes | yes | no | yes | no |
| Data export | yes | no | no | yes | no |
| Manage team | yes | yes (not owners) | no | no | no |
| Close workspace | yes | no | no | no | no |

- `Me.memberships` lists every workspace of the user; `Me.tenant` and `Me.role` are the active one.
- Closing a workspace deletes only the user accounts that belong to no other workspace; other members just lose that membership.
- Team changes are audited (`team.invited`, `team.invitation_revoked`, `team.joined`, `team.role_changed`, `team.member_removed`) and the person concerned receives an email (invited, role changed, removed).

## Bank import and reconciliation

The browser parses the bank's file (CSV, any column layout) and posts normalised lines; the API never receives the file. Amounts are signed: positive is money received.

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| POST | `/bank/imports` | `BankImportInput` | `BankImport` | Lines identical (date, amount, label, reference) to an existing line of the workspace are skipped and counted in `duplicateCount`; duplicates inside the same file are kept (two identical transfers on one day are real) |
| GET | `/bank/imports` | | `BankImport[]` | Newest first |
| DELETE | `/bank/imports/:id` | | 204 | Removes the import and its lines. 409 `HAS_MATCHES` if any line is matched |
| GET | `/bank/transactions?status=&q=&importId=&page=&pageSize=` | | `BankTransactionList` | Newest first; `q` searches label and reference; `pageSize` max 100, default 50. `suggestions` only on UNMATCHED lines with a positive amount |
| POST | `/bank/transactions/:id/match` | `BankMatchInput` | `BankTransaction` | Records one payment per allocation, dated the line's date, with the line's reference (or label, truncated) as payment reference. Rules below |
| POST | `/bank/transactions/:id/unmatch` | | `BankTransaction` | Voids the payments recorded from this line (same rules and roles as voiding a payment) and returns the line to UNMATCHED |
| POST | `/bank/transactions/:id/ignore` | | `BankTransaction` | UNMATCHED only (bank fees, transfers between own accounts, outgoing payments) |
| POST | `/bank/transactions/:id/unignore` | | `BankTransaction` | |

- Match rules: the line must be UNMATCHED with a positive amount (409 `NOT_MATCHABLE`); each invoice must be issued and not a credit note; each allocation > 0 and ≤ that invoice's amount due (409 `OVERPAYMENT`); the allocations' sum ≤ the line's amount (422). A line may be partly allocated: it is MATCHED all the same, the rest being the user's business (fees, rounding).
- Suggestions, best first, at most 5: the invoice number appears in the label or reference (ignoring case, spaces and dashes); the amount due equals the line's amount; the customer's name appears in the label. Only open issued invoices.
- Everything is one transaction per call; an invoice's payment status and the dashboard follow as with a manual payment. Payments recorded from a line show the bank line in the invoice's activity.
- Roles: import, match, ignore: OWNER, ADMIN, MEMBER. Unmatch and delete import: OWNER, ADMIN. Read: every role.
- Audited: `bank.imported`, `bank.matched`, `bank.unmatched`, `bank.ignored`, `bank.import_deleted`. Bank lines are deleted on workspace closure with the rest of the workspace's working data; payments recorded from them stay with their invoices.

## Purchase invoices

Suppliers are parties with `kind` SUPPLIER or BOTH (existing `/parties` routes).

| Method | Path | Body | Returns | Notes |
|---|---|---|---|---|
| GET | `/purchases?state=&paymentStatus=&overdue=&supplierId=&q=&from=&to=&page=&pageSize=` | | `PurchaseList` | Newest issue date first; `q` searches number, supplier name and description; `from`/`to` on issue date; `pageSize` max 100, default 50 |
| POST | `/purchases` | `PurchaseInput` | `Purchase` | State TO_APPROVE. 409 `DUPLICATE` when this supplier already has an invoice with this number (compared ignoring case and spaces). 422 when the party is not a supplier |
| GET | `/purchases/:id` | | `Purchase` | |
| PUT | `/purchases/:id` | `PurchaseInput` | `Purchase` | TO_APPROVE or REJECTED only (409 `NOT_EDITABLE`); editing a rejected invoice returns it to TO_APPROVE |
| DELETE | `/purchases/:id` | | 204 | TO_APPROVE or REJECTED only |
| POST | `/purchases/:id/approve` | | `Purchase` | Freezes the supplier snapshot |
| POST | `/purchases/:id/reject` | `RejectPurchaseInput` | `Purchase` | From TO_APPROVE |
| POST | `/purchases/:id/reopen` | | `Purchase` | APPROVED → TO_APPROVE, only without active payments (409 `HAS_PAYMENTS`) |
| POST | `/purchases/:id/dispute` | `DisputePurchaseInput` | `Purchase` | APPROVED only |
| POST | `/purchases/:id/payments` | `PurchasePaymentInput` | `Purchase` | APPROVED only (409 `NOT_APPROVED`). `amount` > 0 or a withholding > 0; `amount + vatWithheld + taxWithheld` ≤ amount due (409 `OVERPAYMENT`); `vatWithheld` ≤ the invoice's VAT not yet withheld; `paidOn` not before the issue date |
| DELETE | `/purchases/:id/payments/:paymentId` | | `Purchase` | Voids the payment (kept, like sales payments) |

- Amounts: each `vatLines[].vat` must be within 1.00 MAD of `net × vatRate / 100` (suppliers round differently), and `vatRate` must be a rate of the active rule package; totals are the sums. All amounts ≥ 0; the gross total > 0. `dueDate` ≥ `issueDate`.
- `overdue`: APPROVED, something due, due date passed, not disputed.
- `warnings` never block. `CASH_LIMIT` uses the rule package's `cashLimitPerDay` / `cashLimitPerMonth` over the active CASH payments made to the same supplier on the same day / in the same calendar month, across all its invoices. `TERM_TOO_LONG` uses `maxPaymentTermDays`.
- Roles: create, edit, record payments, dispute: OWNER, ADMIN, MEMBER. Approve, reject, reopen, delete, void a payment: OWNER, ADMIN. Read: every role. A MEMBER may not approve, including their own entries.
- Audited: `purchase.created`, `purchase.updated`, `purchase.deleted`, `purchase.approved`, `purchase.rejected`, `purchase.reopened`, `purchase.disputed`, `purchase.payment_recorded`, `purchase.payment_voided`.
- Kept for the retention period like sales invoices: workspace closure keeps approved purchase invoices and their payments (pseudonymising user names) and deletes the unapproved ones; the retention purge removes them with the rest.
- Included in the data export.

## Withholding on sales payments

`PaymentInput` (and `BankMatchInput` allocations stay cash-only) accepts `vatWithheld` and `taxWithheld`, default 0. A payment settles `amount + vatWithheld + taxWithheld`: that sum must be ≤ the amount due, `vatWithheld` ≤ the invoice's VAT not yet withheld, and at least one of the three > 0. Everywhere an invoice's paid amount, amount due and payment status are computed, the settled sum counts. "Collected" figures on the dashboard remain cash (`amount`) only.

## Reports

All three are working papers computed on demand; nothing is stored and nothing is filed. `period` is a month (`2026-11`) or a quarter (`2026-Q4`). Every role can read them.

| Method | Path | Returns | Notes |
|---|---|---|---|
| GET | `/reports/vat?period=&previousCredit=` | `VatStatement` | `previousCredit` (Decimal ≥ 0, default 0) is the credit carried from the previous return |
| GET | `/reports/withholdings?period=` | `WithholdingStatement` | |
| GET | `/reports/payment-terms?period=&keyRate=` | `PaymentTermsStatement` | `keyRate` (percent) replaces the rule package's key-rate history for the whole computation |

**VAT statement.** Rounding to 2 decimals at the end of each aggregate, decimal arithmetic throughout.
- Collected, basis CASH (`Company.vatBasis`): each active payment received in the period on an issued invoice counts for `settled / invoice gross excluding stamp duty` of each of the invoice's per-rate bases and VAT (stamp duty is not turnover; withheld VAT is still collected VAT, it reappears in `withheldByCustomers`). Basis ACCRUAL: invoices issued in the period count in full at their issue date.
- Credit notes count negatively at their issue date in both bases.
- 0 % bases go to `exemptBase`, not `byRate`.
- Deductible: each active payment made in the period on an APPROVED purchase with `vatDeductible` counts for `settled / purchase gross` of each VAT line, into `services`, `goods` or `fixedAssets` by category, and produces the matching `deductions` rows. Payment-based whatever the basis (the right to deduct arises with payment).
- `vatDue` / `creditCarriedForward` per the schema comment.
- `filingDeadline`: last day of the month after the period.
- Notices: `NOT_SUBJECT` (company not subject to VAT: figures still computed), `PERIOD_MISMATCH` (monthly regime asked a quarter or the reverse), `PERIOD_NOT_OVER`, `PURCHASES_TO_APPROVE` (purchases issued up to the period's end still to approve), `CASH_LIMIT` (a deduction row comes from a purchase carrying that warning).

**Withholding statement.** Rows are active payments of the period with a non-zero withholding: on purchases (`onSuppliers`, to remit) and on sales (`byCustomers`, credits). `remittanceDeadline`: last day of the month after the period's last month.

**Payment terms statement (law 69-21).** Approved, non-disputed purchases only.
- `legalDueDate` = the earlier of the invoice's due date and issue date + `maxPaymentTermDays`.
- A row exists when part of the invoice was settled after `legalDueDate` by a payment dated in the period (`PAID_LATE`, one row per such payment, `lateAmount` = its settled sum), or is still unpaid at the period's end with `legalDueDate` before it (`UNPAID`, `lateAmount` = amount due at the period's end).
- `monthsLate`: calendar months started between `legalDueDate` and `settledOn` (or the period's end), minimum 1.
- `ratePercent` = key rate in force on the last day of the first month of delay + `latePaymentMonthlyIncrement` × (`monthsLate` − 1). `fine` = `lateAmount` × `ratePercent` / 100.
- `filingDeadline`: last day of the month after the quarter. Notices: `PERIOD_NOT_QUARTER` (a month was asked: figures still computed), `PERIOD_NOT_OVER`, `PURCHASES_TO_APPROVE`, `KEY_RATE_OVERRIDDEN`.
- The fine is recomputed in full each time: it does not subtract what an earlier declaration already covered.

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
