# SEL HRMS — Licensing

This deployment of SEL HRMS runs under a time-bound evaluation license. This
document explains the mechanism openly, because it is meant to be disclosed to
the operating organization — it is a standard software activation gate, not a
hidden control.

## What it does
The application requires a valid, cryptographically-signed license file to
operate. While the license is valid, the app runs normally. If the license
expires and is not renewed, the application locks and displays a message with
renewal contact details. **No data is deleted or altered** — access simply
pauses until a new license is applied.

## Why it exists
The system is provided for an agreed evaluation/engagement period. The license
window reflects that agreement. Renewal is a routine administrative step once
terms for continued use are settled.

## How renewal works
The provider issues an updated license file with a new expiry date and it is
placed on the server. This takes effect immediately — no code change, no
downtime beyond a restart.

## What is NOT collected or done
- No phone-home, no telemetry, no external network calls for licensing.
- The check is entirely local: the server verifies a signed file on disk.
- The trigger is solely the license expiry date — nothing else.

## Technical summary
- License = a small JSON payload (licensee, issue date, expiry) signed with an
  Ed25519 private key held only by the provider.
- The deployment contains only the public key, which can verify but not forge
  or extend a license.
- Verified on startup and per-request (cached). Expiry → HTTP 402 + lock screen.

Contact the system provider for renewal or licensing questions.
