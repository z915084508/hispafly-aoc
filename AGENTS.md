# HISPAFLY AOC Portal - Codex Instructions

This project is the HISPAFLY AOC Portal.

HISPAFLY already has an EFB. Do not rebuild EFB features in this project.

## Main purpose

- Staff operations portal
- Pilot management
- vAMSYS PIREP synchronization
- Virtual payroll calculation
- Pilot wallet system
- Monthly reports and rankings

## Data source

- PEGASUS ACARS submits flights to vAMSYS.
- vAMSYS PIREPs are the source of truth.
- HISPAFLY AOC must only calculate payroll from accepted PIREPs.

## Tech stack

- Next.js
- TypeScript
- Prisma
- PostgreSQL
- Tailwind CSS

## Security rules

- Never expose vAMSYS client secrets in frontend code.
- Never commit `.env` files.
- Store API tokens server-side only.
- Payroll records must not be duplicated.
- Use the vAMSYS PIREP ID as a unique key.
- Add audit logs for staff actions.

## Useful commands

```bash
npm install
npm run dev
npm run lint
npx prisma migrate dev
```
