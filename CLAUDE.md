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
- Always merge and push to `main` unless told to create a branch.
- Never force-push to `main`.
- Run `cd app && npm run build` to verify before pushing.

### 6. Session logs
- Follow instructions in `new_session_instructions` at the start of each session.
- Session logs go in `Session log/Session NNN/`.

---

## NEW SESSION INSTRUCTIONS (copy of /new_session_instructions)

At the beginning of each new session, follow these instructions:

1. SESSION LOG FOLDER
   - Navigate to the "Session log/" folder in the repo root.
   - Determine the next session number by checking existing session folders.
   - Create a new folder: "Session log/Session N/" (where N is the next number).

2. PROMPT HISTORY
   - Inside the new session folder, create a file called "prompt_history.txt".
   - Log EVERY prompt the user sends during the session into this file, in order.
   - Update the file after each prompt is received.
   - Format: number each prompt sequentially with a blank line between entries.
   - CRITICAL: Save prompts VERBATIM — copy the user's exact words. Do NOT
     summarize, paraphrase, or shorten them. The user's exact phrasing matters.

3. SESSION HANDOFF LOG
   - At the END of the session (when the user indicates they are done, or wraps up),
     create a file called "session_log.txt" in the session folder.
   - This file should document:
     a. All changes made during the session (files created, modified, deleted)
     b. Directional decisions discussed (architecture, tech stack, design choices)
     c. Any unresolved questions or open items
     d. Key context the next session needs to know
     e. Current state of the project
   - This serves as a handoff document from session to session.

4. READING PREVIOUS SESSION LOGS
   - At the start of each session, read the most recent session_log.txt to
     understand where things left off.
   - Review any open items or unresolved decisions from prior sessions.

5. GIT WORKFLOW
   - Always merge and push to main in this session unless told to create a branch.
   - Always commit and push session logs before ending a session.

6. GENERAL
   - Keep prompt_history.txt updated throughout the session, not just at the end.
   - These instructions may be updated by the user at any time.
