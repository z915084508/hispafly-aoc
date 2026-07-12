# Staff access control

HISPAFLY AOC resolves Staff access from a database role template, adds individual `ALLOW` overrides, then removes individual `DENY` overrides. A deny always wins. The legacy `StaffRole` enum remains as a fallback when a template is missing or cannot be loaded.

## Bootstrap and deployment

Set `AOC_OWNER_EMAIL` to the email of an existing active administrator. Never put a real value in `.env.example`. Run:

```bash
npm run staff:bootstrap
```

The command upserts the fixed permission catalog and `OWNER`, `ADMIN`, `NETWORK_PLANNING`, `FLEET_MANAGER`, `VIEWER`, `LEGACY_OPS`, and `LEGACY_FINANCE` templates. It maps existing ADMIN/OPS/FINANCE/VIEWER records without creating accounts. When `AOC_OWNER_EMAIL` is absent or does not match an active Staff record, existing ADMIN fallback access is preserved and a warning is printed.

Production builds run migrations, generate Prisma, bootstrap access, and then build Next.js. After deployment, confirm the current administrator, then create `NET001` with NETWORK_PLANNING and `FLT001` with FLEET_MANAGER from Staff & permissions.

## Protection and recovery

OWNER is assigned only by the bootstrap command. The normal UI cannot promote an account to OWNER or modify an OWNER as a normal administrator. The last active OWNER cannot be disabled. Permission and role changes are audited without credentials, tokens, sessions, or authorization headers.

If administrative access is lost, set `AOC_OWNER_EMAIL` to an existing active Staff identity and rerun `npm run staff:bootstrap`. The command never creates a replacement identity.

## Adding a module

Add a known code to `src/lib/staff/access/catalog.ts`, include it in appropriate templates, use `requireStaffPermission` in every page/action/API mutation, then add one item to the central `src/lib/staff/navigation.ts` tree. Menu visibility is not authorization.

## Main menu mapping

- Overview: `DASHBOARD_VIEW`
- Operations: `FLIGHT_OFFER_VIEW`, `OFP_VIEW`, `PIREP_VIEW`, `FUEL_POLICY_VIEW`
- Network Planning: `ROUTE_VIEW`
- Fleet & Engineering: `FLEET_VIEW`, `AIRCRAFT_VIEW`, `FLEET_LOCATION_VIEW`, `AIRCRAFT_PERFORMANCE_VIEW`
- Crew: `PILOT_VIEW`
- Finance: `ECONOMY_VIEW`, `EXPENSE_VIEW`, `EXPENSE_RULE_VIEW`, `PAYROLL_VIEW`
- Administration: `STAFF_VIEW`, `AUDIT_LOG_VIEW`, `VAMSYS_CONNECTION_VIEW`, `OPERATIONS_API_VIEW`, `SYSTEM_SETTINGS_VIEW`

The legacy enum may be removed only in a future migration after all deployed Staff records have role templates and the fallback is no longer required.
