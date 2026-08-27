# Vercel Serverless Functions Architecture

This folder contains server-side endpoints executed on Vercel's serverless infrastructure.

## Security Rules
1. `SUPABASE_SERVICE_ROLE_KEY` must ONLY be used inside server-side code (here in `/api`), NEVER in frontend client code (`/src`).
2. Every serverless handler MUST verify the caller's JWT token using `supabase.auth.getUser(token)` and check that their profile role is `'admin'`.
3. Privileged actions handled via serverless functions:
   - Creating new employee accounts with temporary credentials (`auth.admin.createUser`)
   - Setting `must_change_password: true`
   - Admin password resets
   - Device unbinding / security resets
   - Authoritative audit log recording

