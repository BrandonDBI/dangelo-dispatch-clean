# D’Angelo Schedule — Clean Server-Side Version

This version avoids browser-to-Supabase authentication entirely.

Browser → Vercel → Supabase

That means no Supabase CORS, no publishable browser key, and no Auth URL configuration.

## Required Vercel variables

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SESSION_SECRET`

## First login

- Email: `brandon@dangelo-brothers.com`
- Password: `ChangeMeNow2026!`

Change the password after confirming the site works.
