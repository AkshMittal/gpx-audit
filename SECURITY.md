# Security

## Credentials

- **Never commit** `SUPABASE_SERVICE_ROLE_KEY` or any other secret keys. Scripts that need it read from `.env` at the repo root (see `docs/project/supabase/import-audit-supabase.md`). `.env` is gitignored.
- The **case-study** static page (`case-study.html`) embeds the Supabase **project URL** and **anon / publishable** client key in `window.CASE_STUDY_CONFIG`. That is the normal pattern for Supabase browser apps; those keys are not secret. **Access control** must rely on **Row Level Security (RLS)** and **storage policies**, not on hiding the anon key.

## Reporting

If you discover a security issue in this repository’s code or documented practices, please open a GitHub issue on the project repository (or contact the maintainers through the channel they prefer for sensitive reports).
