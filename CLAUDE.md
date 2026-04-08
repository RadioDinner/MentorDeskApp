# CLAUDE.md — Permanent Rules for MentorDeskApp

## CRITICAL: DO NOT VIOLATE THESE RULES

### 1. NEVER reference, copy, or import code from RadioDinner/CourseCorrect
- CourseCorrect is a SEPARATE, DEAD project. It has NOTHING to do with MentorDeskApp.
- Do NOT clone it, read from it, or use it as a reference.
- Do NOT create files that match its structure.
- If you are tempted to "port" or "carry over" anything from CourseCorrect, STOP and ask the user first.

### 2. The codebase lives in `app/` — ONLY
- All frontend source code is in `app/src/` (TypeScript/TSX).
- The build command is `cd app && npm run build` (defined in `vercel.json`).
- Do NOT create a root-level `src/` directory. Ever.
- Do NOT create root-level `package.json`, `vite.config.*`, or `index.html` files.
- Do NOT modify `vercel.json` to build from anywhere other than `app/`.

### 3. Do NOT create files or folders the user did not ask for
- No "bonus" features, no speculative code, no extra apps.
- No `android-app/`, `super-admin-app/`, `landing-page/`, `.github/workflows/`.
- If something seems useful but wasn't requested, ASK FIRST.

### 4. Technology stack
- Framework: React 19 + TypeScript + Vite + Tailwind CSS 4
- Backend: Supabase (Postgres + Auth + RLS)
- Deployment: Vercel (auto-deploys from `main` branch)
- Package manager: npm (lockfile in `app/package-lock.json`)

### 5. Git workflow
- Default branch: `main`
- Always commit and push to `main` unless told otherwise.
- Never force-push to `main`.
- Run `cd app && npm run build` to verify before pushing.

### 6. Session logs
- Follow instructions in `new_session_instructions` at the start of each session.
- Session logs go in `Session log/Session NNN/`.
