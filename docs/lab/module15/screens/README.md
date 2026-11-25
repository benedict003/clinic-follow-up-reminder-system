# Interface captures — Module 15

Eight captures, taken from the release build served by the backend at
`http://localhost:3400/app/`, at the two widths the module asks for.

They were produced by `docs/lab/module15/capture-screens.js`, which drives Chrome
over the DevTools protocol. Two reasons for a script rather than hand-taking:

- **Exact widths.** Flutter reads `window.innerWidth`, so a narrow capture has to be
  a real 380 px viewport (`Emulation.setDeviceMetricsOverride`), not a scaled-down
  desktop window.
- **Reproducibility.** A reviewer can re-run it and get the same states, and the
  script logs what it verified at each step (for example `nurse sees the close
  action: false`).

```powershell
cd backend && npm start                                  # in one terminal
node docs/lab/module15/capture-screens.js                # in another
```

Prerequisite: the bundle must be built with `--no-web-resources-cdn`. The app's
CSP is `default-src 'self'`, so a bundle that fetches CanvasKit or Roboto from
`gstatic.com` renders a blank page behind that policy. This was found the hard way
while capturing and is the reason the flag is in the command below.

```powershell
flutter build web --release --base-href=/app/ --no-web-resources-cdn
```

| File | State | Width | Provenance |
| --- | --- | --- | --- |
| `15-01-board.png` | Success: the board, chip counts, overdue badges | 1280 | `--only=a` |
| `15-02-board-narrow.png` | The same board at narrow width, FAB and nav intact | 380 | `--only=a` |
| `15-03-detail.png` | Record detail: overdue state, three actions, one audit event | 1280 | `--only=a`, after logging a contact |
| `15-04-validation.png` | Validation: "Record why the patient is coming back" with the patient already chosen | 380 | `--only=a`, message presence asserted by the script |
| `15-05-forbidden.png` | Authorization: nurse view, no close action, explanation in its place | 1280 | `--only=bcd` |
| `15-06-empty.png` | Empty: nothing due today | 1280 | `--only=a` |
| `15-07-failure.png` | Failure: backend stopped, actionable banner and Try again | 1280 | `--only=bcd`, API stopped and restarted by the script |
| `15-08-rate-limited.png` | Hardening: "Too many attempts. Try again in a moment." | 1280 | `--only=bcd`, limiter exhausted then the form submitted |

Notes for a reviewer:

- `15-03` shows a real audit row rather than an empty history: the script logs a
  contact attempt first, because a history panel with "Nothing recorded yet" does
  not evidence an append-only trail.
- `15-05` is the counterpart of case Z1 in the collection: the UI hides the close
  action **and** the API refuses it. Hiding a control is not a control.
- `15-07` and `15-08` are the adverse states. `15-07` also evidences D-09: the
  banner says what to do and no longer prints a Dart exception.
- Only seeded fictional data appears. No credential, token or real record is
  visible in any capture; the password field is masked.
