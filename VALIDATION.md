# Interest settings validation — 6 October 2026

- 60 database checks passed for owner-only settings, simple and compound interest, all three bases, daily/monthly/annual conversion, grace boundaries, caps, partial and backdated payments, duplicate references, duplicate-read stability, complete repayment, grandfathered loans, immutable snapshots, stale approval previews and customer access isolation. The packaged upgrade SQL was exercised against the original schema.
- The existing 47 foundation checks passed in a separate database before the upgrade, retaining coverage of the original schema and workflow.
- 60 Microsoft Edge browser checks passed with mocked Supabase responses, including owner settings saves, blocked employee settings access, offer preview requirements, invalidation after editing, and desktop/mobile pages. Screenshots were inspected.
- 185 local links, unique HTML IDs, 30 script syntax checks and local imports passed in the prepared project.

The database tests used an isolated PostgreSQL-compatible PGlite instance. Browser tests used mock responses. The live Supabase database has not been migrated or tested with these interest functions. These checks are software validation, not legal certification of a selected lending policy.

Existing local public credentials and Git staging are preserved. No Git commit or push is made.
