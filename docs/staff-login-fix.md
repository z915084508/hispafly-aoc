# Staff login repair

The Staff login resolver now checks every case-insensitive Staff identity candidate instead of accepting the first database row. This protects historical accounts where PostgreSQL allowed case-only duplicate emails, for example `OPS@HISPAFLY.ES` and `ops@hispafly.es`.

Temporary password generation now verifies both the generated hash and the value persisted in `StaffCredential` before showing success.

After deployment, generate a new temporary password for the intended Staff record and sign in with its email or Staff code.
