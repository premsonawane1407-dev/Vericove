# My Health implementation

## Current behavior

- Overview, Journal, Insights and Records are available inside the existing workspace shell.
- Mira uses validated, deterministic MCQs that adapt to concern and prior selections for fatigue, headaches, pelvic discomfort, menstrual changes, sleep, digestive discomfort and an open-ended fallback. It skips the impact question after the user says an experience has stopped, and skips context when no associated changes are reported. It collects only user-reported details and never returns a diagnosis.
- The number of prompts is variable because follow-ups depend on answers; it is not randomized. Users can also finish early. The review groups reported answers, marks relevant topics not discussed, and states that duration, intensity, AI observations and clinician-reviewed safety guidance are not available in this demo.
- The main answer surface is selectable cards. “Something else?” reveals a small optional text field; speech transcription can fill it and remains editable until submitted. No large default composer is shown.
- Browser speech synthesis selects a language-matched device voice and prefers a feminine-sounding voice when the browser exposes one. Replay, pause/resume, stop, mute, voice selection and speed controls are user initiated. This is a device fallback, not a neural voice. Speech recognition is optional and reports permission or availability errors.
- Review offers “Continue with Mira” for iterative refinement and “I’m satisfied” to finish without restarting or discarding answers.
- Journal entries and unfinished answers persist in the browser preview. The existing sign-in remains simulated, so this preview warns users not to enter real health data. Authenticated Supabase sessions use `healthRepository.js` and owner-scoped tables.
- Private document upload is available only with a real Supabase Auth session. The migration creates a private 10 MB PDF/JPG/PNG bucket and per-user object policies. Download links are signed for 60 seconds.
- Mira's safety framework is explicitly unavailable for clinical use until reviewed and validated by qualified clinicians. The preview offers general immediate-danger guidance only; it does not contain red-flag rules.
- Appointment copy uses the browser print dialog. The user reviews the summary before choosing this action.

## Branch scenarios

These are manual behavior scenarios, not diagnostic pathways. After each concern selection, verify that the presented options can be selected, changed, edited, and continued, then inspect the next prompt:

| Opening answer | Expected next prompts |
| --- | --- |
| Energy change | Onset → frequency → day-to-day impact → associated changes → optional context |
| Head discomfort | Location → onset → frequency → day-to-day impact → associated changes → optional context |
| Pelvic / lower abdominal discomfort | Location → onset → frequency → day-to-day impact → associated changes → optional context |
| Menstrual change | Onset → frequency → day-to-day impact → associated changes → optional context |
| Sleep change | Onset → frequency → day-to-day impact → associated changes → optional context |
| Digestive discomfort | Location → onset → frequency → day-to-day impact → associated changes → optional context |
| Something else | Open-ended selection and optional short text → generic onset, frequency, impact, associated changes, and context prompts |

Users can choose “I’m not sure,” “Not applicable,” or “I’d rather not say” where relevant; use the secondary text option; finish early; edit earlier selections; pause; resume; and continue refining a summary. A completed summary contains only their responses.

## Supabase migration

The migration is local and has not been applied to the hosted project. After the production Supabase Auth flow is connected and the SQL is reviewed, link the intended project and apply it with:

```sh
npx supabase login
npx supabase link --project-ref <your-project-ref>
npx supabase db push
```

Do not deploy the client-side demo login as authentication. The configured project currently has no sign-in flow in this app, and no AI provider key or server-side AI endpoint is configured. The adaptive demo prompts are intentionally labeled as a local, deterministic preview.
