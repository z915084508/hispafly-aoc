# HISPAFLY AOC Portal - Codex Instructions

This project is the HISPAFLY AOC Portal.

HISPAFLY already has an EFB. Do not rebuild EFB features in this project.

## Main purpose

- Staff operations portal
- Pilot management
- HispaFly ACARS PIREP ingestion
- Virtual payroll calculation
- Pilot wallet system
- Monthly reports and rankings

## Data source

- HispaFly ACARS submits flights directly to HispaFly AOC.
- Native AOC PIREPs are the operational source of truth.
- Imported vAMSYS records are historical evidence only and must never trigger an external request.

## Tech stack

- Next.js
- TypeScript
- Prisma
- PostgreSQL
- Tailwind CSS

## Security rules

- Never re-enable retired vAMSYS OAuth or API requests.
- Never commit `.env` files.
- Store API tokens server-side only.
- Payroll records must not be duplicated.
- Use internal PIREP identity for new reports; retain legacy IDs only for historical uniqueness.
- Add audit logs for staff actions.

## Useful commands

```bash
npm install
npm run dev
npm run lint
npx prisma migrate dev
```
