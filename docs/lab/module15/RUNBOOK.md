# Recovery instructions

What to do when something the collection exercises goes wrong in a real session.
Each entry names the signal you will see, what it means, and the action.

## The API is not answering at all

**Signal** the client shows "Cannot reach http://localhost:3400" or the sign-in
screen reports a connection error; `curl http://127.0.0.1:3400/api/health` fails.

1. Is the backend running? `cd backend` then `npm start`. The first line must read
   `listening on 127.0.0.1:3400`.
2. Is the database up? `mysqladmin -u root ping`. Under XAMPP the server is started
   from the control panel; the collection's runs assumed `mysqld` on port 3306.
3. If the API starts but every data request fails, check `DB_NAME` in `backend/.env`
   points at `clinic_followup_lab` and that the schema was applied:
   `node --env-file=.env scripts/lab-sql.js "SHOW TABLES"`.

## The reminder queue stopped delivering

**Signal** Reminders tab shows jobs stuck in `queued`, or `needs_human` with
`TIMEOUT` / `HTTP_503`.

- `TIMEOUT` means the integration endpoint accepted the request and did not answer
  within `INTEGRATION_TIMEOUT_MS` (default 3000 ms). Check the mock gateway:
  `npm run mock`, then confirm its mode with `POST /_/mode {"mode":"ok"}`.
- `HTTP_503` means the gateway answered but refused: same check, then Retry from the
  job detail with a reason. The retry is bounded by `INTEGRATION_MAX_ATTEMPTS`.
- `needs_human` is terminal by design. Nothing retries on its own; a doctor must
  retry or close the follow-up. That is the escalation path, not a stuck queue.

## A job says `OBSOLETE`

Correct behaviour. The follow-up was rescheduled or closed after the reminder was
queued, so its version no longer matches. No action; the closing or reschedule event
is in the record history.

## Login says "Too many attempts"

The per-username limiter (10 per minute) is holding. Wait the number of seconds in
`Retry-After`, or use a different account. This is deliberate: it is the control
that stops password guessing. If it fires during a demonstration, the cause is
usually a stale password being retried in a loop.

## A page is unresponsive but still drawing

Historical symptom from Module 14 §12.9 (layout exception leaving render objects
unlaid-out, so every pointer event throws). It was fixed at the source. If it
recurs, open the browser console: a `Cannot hit test a render box that has never
been laid out` line means a widget threw during layout. The regression guard is
`flutter test test/screen_layout_test.dart`; run it before shipping.

## Secure exchange reports `PARTNER_UNREACHABLE` or `PARTNER_TIMEOUT`

The partner receiver is a separate process on `https://localhost:4443`.
1. Start it: `node --env-file=.env.receiver scripts/partner-receiver.js`.
2. Check the API can validate it: `SECURE_PARTNER_CA` must point at the certificate
   the receiver is using.
3. Retry the send. A receipt with no payload is the only evidence of acceptance; a
   `status: delivered` row in the outbox without a receipt would be a contradiction
   and should be reported as a defect.

## The database was recreated and everything is empty

`npm run seed` recreates the two lab accounts and three fictional patients. It needs
`LAB_PASSWORD` (12+ characters) in the environment. Then `npm run migrate:clinic`
applies the clinical columns and the history table. No real data is involved at any
point.

## Resetting a test run

The collection owns `clinic_followup_m15` and drops it at the start of every run.
To start clean by hand:

```powershell
mysql -u root -e "DROP DATABASE IF EXISTS clinic_followup_m15"
```

The lab database is never touched by the collection.
