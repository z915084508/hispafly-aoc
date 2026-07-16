# TASK 4 - Hispafly Identity Service

Pilot authentication and registration are fully local. Existing `Pilot` records remain the operational profile, while `AuthUser` owns credentials, roles and sessions. No OAuth migration or external identity is used.

## Deployment

1. Configure the existing session and token secrets from `.env.example`.
2. Run `pnpm db:deploy` once against the target database. Database migration and bootstrap are intentionally separate from the Vercel build to prevent concurrent deployment lock failures.
3. Configure `AUTH_EMAIL_WEBHOOK` to deliver verification and password-reset links through the approved email service.
4. New Pilots register at `/register` and must verify their email before sign-in.
5. Staff may also create or manage a local login for an existing Pilot profile.

## REST API

- `POST /api/auth/local/login`
- `POST /api/auth/local/register`
- `POST /api/auth/local/logout`
- `GET /api/auth/local/me`
- `POST /api/auth/local/forgot-password`
- `POST /api/auth/local/reset-password`
- `POST /api/auth/local/verify-email`

Browser authentication uses a random, HttpOnly database-backed session token. Tokens are hashed at rest, revocable and expire after seven days. This is intentionally used instead of browser-stored JWTs.

VAMSYS OAuth routes have been removed. Legacy operational records may retain historical source identifiers until the separate flight-data replacement is complete, but they are never used for identity or login.
