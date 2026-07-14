# Security notes

## What's already in place
- **Passwords** hashed with bcrypt (cost 10). Minimum 8 characters on change/reset.
- **JWT auth**, 12-hour expiry, verified on every request; role checked server-side on every admin route.
- **Login rate limiting** (20 attempts / 15 min / IP) against brute force.
- **helmet** security headers; JSON body capped at 8 MB (selfies).
- **Input validation** with zod on every mutating endpoint; parameterised SQL everywhere (no string-built queries).
- **Uploads**: only `data:image/jpeg|png` base64 accepted, size-bounded, stored under random filenames, and served **only to authenticated users** (`/api/uploads` sits behind the auth middleware).
- **Duplicate punch prevention** enforced by a DB unique constraint, not just app logic.
- **Audit trail**: sign-ins, punches, leave decisions and employee changes are logged with IP.
- Central error handler returns generic messages — stack traces never reach the client.

## Anti-spoofing: what it is and isn't
- The punch UI offers no gallery/file upload; frames come from the live camera stream.
- Liveness = motion analysis across sampled frames (blink/head movement). It defeats casual spoofing (static photo, screenshot held to camera) but a video replay on a second screen can produce motion. 
- The punch-out "face match score" is an **image-similarity heuristic** used to *flag records for human review*, not to authenticate identity.

**For production-grade verification**, replace `imageSimilarity()` in `server/src/utils/helpers.js` with a real face-embedding comparison — e.g. AWS Rekognition `CompareFaces`, Azure Face API, or a self-hosted model (InsightFace). The call site and score threshold (0.55) are the only things to change.

## Hardening checklist before real deployment
1. Set a long random `JWT_SECRET` in `server/.env` (the code falls back to a dev secret otherwise).
2. Change the seeded admin credentials; delete demo employees.
3. Serve over **HTTPS** (any reverse proxy: Caddy/nginx). Required for camera/GPS off-localhost anyway.
4. Tokens are stored in `localStorage` for simplicity; if your threat model includes XSS on shared machines, move to httpOnly cookies + CSRF tokens.
5. Restrict CORS (`cors({ origin: true })` → your exact domain) once you have one.
6. Back up `server/data/hrms.db` and `server/uploads/`; both are plain files.
7. Consider geofencing: punch coordinates are stored, so a radius check against office coordinates is a ~10-line addition in `routes/attendance.js`.
