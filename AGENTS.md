# AllDrive Agent Instructions

These instructions apply to the entire repository. Keep changes focused, preserve existing behavior, and prefer the smallest correct implementation.

## Project overview

AllDrive is a privacy-first Google Drive viewer:

- `client/` is a React 19 + TypeScript + Vite + Tailwind CSS v4 frontend.
- `server/` is a Node.js + Express + TypeScript backend.
- MongoDB is used only for optional cross-device sync.
- IndexedDB/local browser storage is used for local accounts and local-mode drive data.
- Google OAuth and Google Drive APIs handle connected drive access.

## Repository layout

```text
client/
  public/       Static files, including favicon.svg
  src/api/      API wrappers
  src/components Shared React UI
  src/context/  React contexts and app state
  src/pages/    Route-level screens
  src/services/ Browser persistence and IndexedDB services
  src/utils/    Shared helpers
server/
  src/config/      Database and OAuth configuration
  src/controllers/ HTTP request handlers
  src/middleware/  Authentication and request middleware
  src/models/      Mongoose models
  src/routes/      Express routers
  src/services/    Google and external-service integrations
```

## Required workflow

1. Read the relevant caller, context/provider, API wrapper, and route before editing shared behavior.
2. Reuse existing components, helpers, types, styles, and error-handling patterns.
3. Make surgical changes. Do not reformat unrelated files or modify generated output.
4. Keep TypeScript strict and preserve existing public behavior unless the task explicitly changes it.
5. Add or update a focused test when behavior is non-trivial or likely to regress.
6. Run the smallest relevant checks before finishing:
   - `npm run build` from the repository root for client and server type/build validation.
   - `npm run lint --prefix client` for frontend linting.
   - Use any existing targeted test command when tests cover the changed area.
7. Report incomplete checks or environmental blockers plainly.

## Coding standards

### General

- Use TypeScript for application code. Avoid `any`, unsafe casts, and duplicated logic.
- Prefer existing platform APIs and installed dependencies over new packages.
- Use clear names and small functions. Comments should explain non-obvious decisions, not restate code.
- Do not add speculative abstractions, unrelated refactors, or new tooling.
- Handle expected errors explicitly. Never swallow errors with empty catches or silent fallbacks.
- Validate untrusted input at system boundaries and return consistent, useful error responses.
- Preserve loading, empty, error, and success states for every asynchronous UI flow.
- Keep user-facing text clear, concise, and consistent with the existing product language.

### React and frontend

- Use functional components and hooks. Keep reusable UI in `client/src/components`.
- Keep route-specific orchestration in `client/src/pages`.
- Use contexts for state that is already modeled by an existing provider; do not create parallel sources of truth.
- Keep API access in `client/src/api` or the existing service layer rather than calling Axios directly from presentational components.
- Prefer semantic HTML and existing Tailwind utility patterns.
- Do not use array indexes as keys for reorderable or user-generated collections.
- Clean up subscriptions, timers, object URLs, and event listeners in effects.
- Disable controls while an operation is in progress when duplicate submissions could cause data loss.
- Do not expose secrets in client code or `VITE_*` variables. Treat browser storage as user-accessible.

### Server

- Keep routing, controllers, middleware, models, and external-service calls in their existing layers.
- Authenticate and authorize every protected resource; never trust an ID supplied by the client.
- Validate body, query, and path parameters before using them.
- Do not log passwords, OAuth tokens, JWTs, refresh tokens, file contents, or sensitive personal data.
- Use appropriate HTTP status codes and stable JSON error shapes.
- Keep provider failures distinguishable from validation and authorization failures.
- Use environment variables for secrets and update `server/.env.example` when configuration changes.
- Preserve the local-mode privacy guarantee: local account data and local drive tokens must not be sent to the server unless the user explicitly enables sync.

## Accessibility requirements

Target WCAG 2.2 AA for all new and changed UI.

### Semantics and names

- Use real headings, landmarks (`header`, `nav`, `main`, `footer`), lists, buttons, and links.
- Every interactive control must have an accessible name. Icon-only buttons need an `aria-label` or visually hidden text.
- Associate every form control with a visible `label`; do not use placeholder text as the only label.
- Use `alt` text for meaningful images. Use `alt=""` for decorative images.
- Do not put interactive elements inside other interactive elements.
- Use `aria-*` only when native HTML semantics do not provide the behavior.

### Keyboard and focus

- All functionality must work with keyboard only.
- Preserve a logical Tab order and visible focus indicator; never remove `:focus-visible` styling without an equivalent.
- Do not trap focus except inside an active modal or dialog, and return focus to the trigger when it closes.
- Escape should close dismissible dialogs, menus, and popovers where appropriate.
- Do not make hover the only way to discover or operate a control.

### Visual and motion

- Maintain at least 4.5:1 contrast for normal text and 3:1 for large text and meaningful graphical controls.
- Do not rely on color alone to communicate status, errors, selection, or file type.
- Support zoom and narrow viewports without clipping content or requiring horizontal scrolling.
- Respect `prefers-reduced-motion`; avoid essential information conveyed only through animation.
- Keep touch targets comfortably usable, aiming for at least 44 by 44 CSS pixels for primary controls.

### Dynamic content and forms

- Announce important asynchronous status changes with an appropriate live region.
- Keep errors near the relevant field and provide a general summary for multi-field forms.
- Preserve entered values after recoverable errors.
- Mark required fields and provide clear instructions before submission.
- Use `aria-busy` or equivalent status messaging for meaningful loading regions.
- Ensure dialogs have a title, description when needed, correct role, and usable close control.

## Security and privacy

- Never commit `.env` files, credentials, client secrets, private keys, tokens, or real user data.
- Use `.env.example` placeholders only; do not place secrets in source, logs, screenshots, fixtures, or documentation.
- Treat OAuth redirect URLs, token handling, CORS, JWT verification, and sync endpoints as security-sensitive.
- Minimize scopes and stored data. Do not persist file contents when metadata is sufficient.
- Escape or safely render user-controlled names, descriptions, and error messages.
- Avoid introducing `dangerouslySetInnerHTML`, shell execution, dynamic code evaluation, or unrestricted URL navigation.
- Do not weaken authentication, authorization, TLS, cookie, or CORS protections to make development easier.
- If a change affects sensitive data flow, document the flow and test unauthorized, expired, malformed, and missing credentials.

## UI and product consistency

- Use the existing AllDrive visual language: blue for cloud/server mode, emerald for local/privacy mode, and the existing spacing, radius, and typography patterns.
- Keep responsive behavior intact for mobile, tablet, and desktop.
- Provide clear empty states for no drives, no files, no search results, and no uploads.
- Confirm destructive actions and make irreversible operations explicit.
- Show upload progress, retry/error states, and prevent accidental duplicate uploads.
- Preserve the favicon, document title, and product naming as `AllDrive`.

## Git and change hygiene

- Do not commit build artifacts, dependency directories, local databases, or environment files.
- Keep commits and pull requests focused and describe behavior changes plus validation performed.
- Do not rewrite or discard user changes.
- Update directly related documentation when commands, configuration, privacy behavior, or public APIs change.

## Definition of done

A change is complete only when:

- The requested behavior is implemented across all relevant surfaces.
- TypeScript/build and the narrowest applicable lint/test checks pass.
- Keyboard, screen-reader, responsive, loading, empty, error, and reduced-motion behavior have been considered for UI changes.
- Sensitive data remains protected and no secrets are introduced.
- Documentation and configuration examples match the implementation.
