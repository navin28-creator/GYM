# Gym Member Management Software — Requirements

## 1. Purpose

Build a web application that helps one gym location manage members, memberships,
payments, renewal reminders, and basic business reports. The first release is
for the gym owner and front-desk staff; members will not sign in.

## 2. Users and permissions

- **Owner/admin:** Can manage staff access, member records, plans, memberships,
  payments, reminders, and reports.
- **Staff:** Can perform day-to-day member and membership tasks and record
  payments. Staff cannot manage owner access or change administrative settings.

Every user must sign in. The application must enforce permissions on the server,
not only hide controls in the interface.

## 3. Functional requirements

### Member records

- Create, view, edit, search, and deactivate member records.
- Store at least a member's name and phone number; email and notes are optional.
- Make member name and phone number the required first section of the add-member
  form. Membership and initial payment sections are optional.
- Allow the add-member form to create at most one membership plan for the new
  member. Staff can add a payment in that form only when they also add a
  membership; otherwise they can add a membership or payment later.
- Show the member's current membership status and relevant payment history on
  their profile.
- Prevent accidental duplicate enrollment where a matching phone number already
  exists; let authorized staff review the existing record.

### Membership plans and renewals

- Let the owner create and edit plans with a name, duration, and price.
- Let staff enroll a member in a plan with a start date and end date.
- Show active, expiring, expired, and inactive membership states.
- Allow staff to renew a membership and retain its prior membership history.
- Make the membership end-date calculation consistent and visible before saving.

### Payments

- Keep a payment history associated with each member and membership.
- A payment record should include amount, date, method, and the staff user who
  recorded it; allow an optional reference or note.
- Show the amount paid and any remaining balance when a membership has a price.
- Do not store card or bank credentials.

**Proposed MVP approach:** record payments that happen outside the application
(including cash, card, bank transfer, or UPI); do not process online payments in
the first release. This avoids choosing a payment provider before one is needed.
Confirm this before implementation.

### Renewal reminders

- Show staff which memberships are approaching expiry and which have expired.
- Support sending reminders by SMS and WhatsApp, as selected for the product.
- Keep a record of reminder status and delivery errors; do not mark a failed
  message as sent.
- Use an approved provider and respect member consent and applicable messaging
  requirements.

The reminder schedule, message wording, provider, and whether reminders are sent
automatically or manually remain to be decided.

### Reports

- Provide a membership report with active, expiring, and expired members.
- Provide revenue totals for a selected date range, based on recorded payments.
- Allow staff to filter reports by date range and export them in a common format
  such as CSV.

Payment-due and attendance reports are not part of the confirmed first-release
scope.

## 4. Non-functional requirements

- Work in a modern web browser on desktop and mobile-sized screens.
- Protect member contact and payment records through authenticated access and
  role-based authorization.
- Validate user input and show clear success or error feedback.
- Use backups and a documented recovery process before the application is used
  with real member data.
- Store and display monetary values in Indian rupees (INR) and use India as the
  initial locale. Confirm timezone and date-format expectations.
- Keep a record of key administrative and financial changes, including who made
  them and when.

## 5. Out of scope for the first release

- Member self-service accounts or a member mobile app.
- Multiple gym locations.
- Online payment processing.
- Class schedules, bookings, and attendance check-in.
- Trainer management and payroll.

## 6. MVP acceptance criteria

1. An owner can sign in, create plans, and manage staff access.
2. Authorized staff can create and find member profiles without creating
   unintended duplicates.
3. Staff can save a member using only basic details, or optionally include one
   membership and its initial payment in the same save. A failed optional
   detail must not leave a partial member record behind.
4. Staff can enroll a member, view their membership dates and status, and renew
   them while preserving history.
5. Staff can record a payment and see it reflected in the member's history and
   revenue report.
6. The dashboard identifies memberships approaching expiry and already expired.
7. Staff can send a reminder through the configured SMS or WhatsApp provider and
   see whether it succeeded or failed.
8. The membership and revenue reports can be filtered by date and exported.
9. A staff account cannot perform owner-only operations, including by calling
   application endpoints directly.

## 7. Decisions to confirm before implementation

- Confirm manual payment recording for MVP, with online payment processing
  deferred.
- Set the expiry reminder schedule and choose manual sending or automatic
  sending.
- Select SMS/WhatsApp providers and approve the reminder wording and consent
  process.
- Confirm timezone and date format for the Indian locale.
- Decide whether staff need member deactivation, payment corrections, or refunds
  and what approval/audit rules those actions require.
