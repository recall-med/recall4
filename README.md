# Recall (previously Dept. Q. Bank)

A professional, offline-first medical question bank for ZNU Med students.
Built with plain HTML, CSS, and JavaScript, with no build step. It works fully as a guest in the browser. Optional accounts and cloud sync run on Cloudflare Pages Functions, a Cloudflare D1 database and Firebase sign-in (see [Cloud Sync and Accounts](#cloud-sync-and-accounts)).

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Live Demo](#live-demo)
- [Installation](#installation)
- [Deployment](#deployment-to-github-pages)
- [Cloud Sync and Accounts](#cloud-sync-and-accounts)
- [Repository Structure](#repository-structure)
- [Adding Questions](#adding-questions)
- [Crediting a Professor](#crediting-a-professor)
- [Marking a Module as Ongoing](#marking-a-module-as-ongoing)
- [Adding Redline Data Links](#adding-redline-data-links)
- [JSON Question Format](#json-question-format)
- [Adding a New Module](#adding-a-new-module)
- [Adding a New Subject](#adding-a-new-subject)
- [Customisation](#customisation)
- [Interface Standards](#interface-standards)
- [Admin Dashboard](#admin-dashboard)
- [LocalStorage Data](#localstorage-data)
- [Troubleshooting](#troubleshooting)
- [Roadmap](#roadmap)
- [Licence](#licence)

---

## Overview

Recall is a self-hosted medical question bank platform for practising multiple-choice questions across five medical modules:

| Module | Full Title |
|--------|-----------|
| CPM | Cardio-Pulmonary Medicine |
| GIT | Gastrointestinal Tract |
| CNS | Central Nervous System |
| ENDO & REPRO | Endocrinology & Reproductive |
| Urinary | Urinary System |

Each module contains two exam types (End Module Exam and Final Exam), each with four subjects (Anatomy, Physiology, Biochemistry, Histology).

All question content lives in plain JSON files. Adding or updating questions requires only editing JSON files — no coding knowledge needed.

---

## Features

- Professional medical Q-bank interface, in the style of UWorld or AMBOSS
- Full exam engine with immediate feedback or end-of-exam review mode
- Question number box: green once answered correctly, red once answered wrongly, a gold ring on saved questions; it scrolls inside the sidebar and keeps its place from question to question
- Save questions (star) for later review
- Incorrect questions automatically saved to a review bank
- Dashboard analytics: questions solved, accuracy, and total study time
- Per-module progress rings with completion count and average score
- Resume card under "Progress" on the dashboard: one tap anywhere on the card continues the exam (the small X abandons it)
- Interface that scales itself to the screen: the same proportions on a phone, a laptop and a 1920px monitor, with nothing to zoom
- Admin dashboard (`admin.html`) for owners and admins: overview, question editor, students, retention, system
- Results page with full question review and explanations
- Retry incorrect questions only
- Search functionality
- Light and dark themes
- Mobile-first responsive design
- Works without an account (guest mode); progress is saved in browser LocalStorage
- Optional accounts (Google or email) with cloud sync of progress, incorrect questions, saved questions and exam history across devices
- Guest progress can be added to an account when signing in; Reset progress and Delete account are in the account window

---

## Live Demo

After deploying to GitHub Pages, your URL will be:

```
https://<your-username>.github.io/<repository-name>/
```

---

## Installation

### Option 1 — Run Locally

```bash
# 1. Clone the repository
git clone https://github.com/<your-username>/<your-repo>.git
cd <your-repo>

# 2. Serve locally (required — the file:// protocol blocks fetch() calls)
# Python 3:
python -m http.server 8000

# Node.js (npx):
npx serve .

# Then open: http://localhost:8000
```

Note: do not open `index.html` directly from the file system (`file://`). Browsers block `fetch()` on `file://` URLs. Always use a local server.

### Option 2 — Deploy to GitHub Pages (recommended)

See [Deployment to GitHub Pages](#deployment-to-github-pages).

---

## Deployment to GitHub Pages

The question bank itself runs on any static host, including GitHub Pages. **Accounts and cloud sync need Cloudflare Pages** (the `functions/` folder only runs there). The live site is `https://recall-med.pages.dev`, deployed automatically from the `main` branch of `recall-med/recall4`. Cloudflare Pages needs no build step for this project.

1. Fork or push this repository to your GitHub account.

2. Go to your repository on GitHub, then Settings, then Pages.

3. Under Source, select Deploy from a branch.

4. Select the main branch and the / (root) folder, then click Save.

5. After a minute, your site will be live at:
   ```
   https://<your-username>.github.io/<repository-name>/
   ```

6. To update questions, edit the JSON files and push. GitHub Pages will deploy the changes automatically.

---

## Repository Structure

```
/
├── index.html              Single-page app entry point
├── admin.html              Admin dashboard (owners and admins only)
├── _headers                Safe response headers for Cloudflare Pages
├── README.md
│
├── assets/
│   ├── css/
│   │   ├── styles.css      All styles of the app (colours, fonts, the one scale value). Every length is rem
│   │   ├── account.css     Account window, loading cover and notification colours
│   │   └── console.css     Admin dashboard only (class names start with rc-)
│   └── js/
│       ├── app.js          Main application controller and navigation
│       ├── sync.js         Cloud sync engine and account window (loads after exam.js)
│       ├── layers.js       Pop-up windows: open/close motion, Back-button support, the confirmation window
│       ├── auth.js         Firebase sign-in (loaded on demand by sync.js)
│       ├── storage.js      LocalStorage persistence layer
│       ├── exam.js         Exam engine (loading, scoring, state)
│       ├── ui.js           UI rendering functions
│       └── ui-skeletons.js Loading skeletons (adds to UI; loads after ui.js)
│
├── config/
│   ├── modules.json        Site configuration, modules, subjects
│   └── sync-config.json    Cloud sync on/off switch (cloudEnabled)
│
├── functions/              Cloudflare Pages Functions (the /api backend)
├── db/schema.sql           Database tables for Cloudflare D1
├── backend-tests/          Automated tests for the backend and the sync front end
├── BACKEND_GUIDE.md        How the backend works, how to extend it, project status
│
└── data/
    └── <MODULE>/                       e.g. CPM, GIT, CNS, ENDO_REPRO, URINARY
        └── <exam_type>/                end_module or final_exam
            └── <subject>/              anatomy, physiology, biochemistry, histology
                └── <topic>.json        one file per topic (sub-subject)
```

---

## Adding Questions

Questions are organised as **module → exam type → subject → topic**. Each topic has its own JSON file and its own entry in `config/modules.json`. A topic only appears in the app once it has at least one question.

### Step-by-step: adding a new topic

1. Create the data file at:
   ```
   data/<MODULE>/<exam_type>/<subject>/<topic_id>.json
   ```
   For example: `data/CNS/end_module/anatomy/spinal_cord.json`

2. Put the questions in it (see [JSON Question Format](#json-question-format)):
   ```json
   {
     "meta": {
       "module": "CNS",
       "examType": "end_module",
       "subject": "anatomy",
       "subSubject": "spinal_cord",
       "totalQuestions": 23
     },
     "questions": [ ... ]
   }
   ```

3. Register the topic in `config/modules.json`. Find the module, then `subSubjects` → exam type → subject, and add an entry:
   ```json
   {
     "id": "spinal_cord",
     "label": "Spinal Cord",
     "icon": "brain",
     "professor": "Prof. Samaa"
   }
   ```
   - `id` must match the JSON file name (without `.json`).
   - `label` is the name shown in the app.
   - `professor` is optional, see [Crediting a Professor](#crediting-a-professor).

4. Push to GitHub.

### Step-by-step: adding questions to an existing topic

1. Open the topic's JSON file, e.g. `data/CPM/final_exam/anatomy/larynx.json`.
2. Add the new question objects at the end of the `"questions"` array.
3. Give each one a unique `"id"` (continue from the last question's id; ids are permanent, so never renumber existing questions).
4. Update `meta.totalQuestions` to the new total.
5. Save and push.

### Single question template

```json
{
  "id": 4,
  "question": "Which structure forms the floor of the fourth ventricle?",
  "options": [
    "Cerebral aqueduct",
    "Rhomboid fossa",
    "Choroid plexus",
    "Tectum"
  ],
  "answer": 1,
  "explanation": "The rhomboid fossa is the diamond-shaped floor of the fourth ventricle, formed by the posterior surfaces of the pons and medulla oblongata. The choroid plexus forms part of the roof."
}
```

### Multiple questions at once

Simply add multiple objects to the array, separated by commas:

```json
{
  "questions": [
    {
      "id": 1,
      "question": "First question?",
      "options": ["A", "B", "C", "D"],
      "answer": 0,
      "explanation": "Explanation for first question."
    },
    {
      "id": 2,
      "question": "Second question?",
      "options": ["A", "B", "C", "D"],
      "answer": 2,
      "explanation": "Explanation for second question."
    }
  ]
}
```

---

## JSON Question Format

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `id` | integer | Yes | Unique identifier within this file. **Permanent:** never renumber or reuse an id, and never move a question to another file, because signed-in students' flags and incorrect answers refer to questions by this id |
| `question` | string | Yes | The question text |
| `options` | string[] | Yes | Exactly 4 answer options (A, B, C, D) |
| `answer` | integer | Yes | Index of the correct option: `0`=A, `1`=B, `2`=C, `3`=D |
| `explanation` | string | Yes | Detailed explanation shown after answering |

Each file is an object with a `meta` block and a `questions` array (the `meta` block records the module, exam type, subject, topic id and `totalQuestions`; keep it up to date when you add or remove questions).

If the source material gives no explanation for a question, use `"Correct answer: C. <option text>"` as the explanation.

## Crediting a Professor

Every question in this bank comes from a professor's exam guide. To show who wrote a topic's questions, add a `professor` field to the topic's entry in `config/modules.json`:

```json
{ "id": "ventricles", "label": "Ventricles", "icon": "brain", "professor": "Prof. Samaa" }
```

- The text is displayed exactly as written, so include the title yourself (`Prof. Samaa`, `Dr. Hala`).
- It appears as a badge on the topic's card in the topic list and on the topic's start page.
- If the field is missing or empty, no badge is shown.
- Going forward, use this field instead of adding the name to `label`.

---

## Marking a Module as Ongoing

To highlight the module the class is currently studying, add `"ongoing": true` to that module in `config/modules.json`:

```json
{ "id": "CNS", "title": "CNS", "ongoing": true, ... }
```

- The module card shows an **Ongoing** badge.
- An ongoing module is always listed first on the dashboard (the large card on desktop, the first card on phones).
- If the student studies a different module, that module takes the first spot for 1 hour after its last activity, then the ongoing module returns to first. Studying the ongoing module again puts it straight back on top.
- To stop highlighting a module, remove the field or set it to `false`.

---

## Adding Redline Data Links

Each exam section on a module page (End Module Exam, Final Exam) can show a **Redline Data** link that opens the matching data guide in a new tab. Add a `redlineLinks` field to the module in `config/modules.json`, keyed by exam type id:

```json
{
  "id": "CNS",
  "title": "CNS",
  "redlineLinks": {
    "end_module": "https://redlineeducation.pages.dev/guide?id=p7pOoxivzDrBhpoTTq0r",
    "final_exam": "https://redlineeducation.pages.dev/guide?id=XXXXXXXX"
  },
  ...
}
```

- The two keys are `end_module` (End Module Exam) and `final_exam` (Final Exam).
- Each link appears at the right end of that section's title line, on every screen size.
- Use the full URL, including `https://`.
- If a key is missing or empty, no link is shown for that section. A module with no `redlineLinks` field shows none at all.
- No code changes are needed, and the link is picked up the next time the page loads.

---

## Hiding a Module or Topic

Add `"hidden": true` to a module or to a topic entry in `config/modules.json` and students no longer see it; admins still do, with a Hidden badge. Remove the field to show it again. The admin dashboard (Content) does this with switches, and creates new topics as hidden. This hides items in the app only: the JSON data files remain public web addresses.

---

## Adding a New Module

1. Open `config/modules.json`.

2. Copy one of the existing module objects in the `"modules"` array and add it to the end.

3. Update `id`, `title`, `fullTitle`, `shortTitle`, `description`, `color` and `dataPath`.

4. Create the matching data folder structure:
   ```bash
   mkdir -p data/NEW_MODULE/end_module data/NEW_MODULE/final_exam
   ```

5. Create empty question files for each subject in each exam folder:
   ```json
   { "questions": [] }
   ```

6. Push to GitHub. The new module card will appear automatically on the dashboard.

**Example module object:**
```json
{
  "id": "MSK",
  "title": "MSK",
  "fullTitle": "Musculoskeletal System",
  "shortTitle": "MSK",
  "description": "Musculoskeletal anatomy and pathology questions",
  "color": "#7c3aed",
  "dataPath": "MSK"
}
```

Note: there is no `icon` field. Icons are drawn by the app from the module or subject `id` (`UI.moduleIcon()` and `UI.subjectIcon()` in `assets/js/ui.js`). A new module shows a neutral person icon until you add an SVG for its id to the `moduleIcon` list in `ui.js`. Emoji are not used anywhere on the site.

---

## Adding a New Subject

1. Open `config/modules.json`.

2. Add a new object to the `"subjects"` array:
   ```json
   { "id": "pathology", "label": "Pathology", "color": "#be185d" }
   ```
   (its icon comes from `UI.subjectIcon()` by id, as for modules; until you add one it shows the neutral icon)

3. Add the subject to each module's `subSubjects` list in `config/modules.json` (for every exam type), then add topic files under `data/<MODULE>/<exam_type>/pathology/` as described in [Adding Questions](#adding-questions).

---

## Customisation

### Change the site title

Edit `config/modules.json`:
```json
"siteTitle": "My Q. Bank",
"siteSubtitle": "My Custom Subtitle"
```

Also update `<title>` in `index.html`.

### Change colours

Edit the CSS variables at the top of `assets/css/styles.css`:
```css
:root {
  --primary:       #1d4ed8;  /* main brand colour */
  --success:       #059669;  /* correct answers */
  --danger:        #dc2626;  /* incorrect answers */
  /* ... */
}
```

The same file holds two more colours worth knowing:
```css
--saved:    #A8842C;  /* saved questions: star button, badge, ring in the number box. Dark theme: #D8C58A */
--bar-from: #1B3A6B;  /* every progress bar is one gradient from --bar-from to --bar-to. Dark theme: #203B63 to #3B5B86 (calmer) */
--bar-to:   #3f6dbb;
```

### Interface size

One line near the top of `styles.css` sets the size of the whole interface:
```css
html { font-size: clamp(100%, calc(33.333% + 0.8333vw), 150%); }
```
It is 100% (16px) up to 1280px wide, grows smoothly to 133% at 1920px and stops at 150%. Because every length in the stylesheet is in `rem`, everything (text, spacing, widths) scales together, so a big monitor looks like a phone with the same proportions. The value is a percentage, so a person's own browser text-size setting still applies. To make the interface bigger or smaller everywhere, change the two numbers (`33.333%` is the base, `0.8333vw` the growth).

### Change fonts

Replace the `@import` line at the top of `styles.css` and update the `--font-body` and `--font-mono` variables to your chosen font family names.

### Enable immediate feedback by default

In `config/modules.json`:
```json
"examSettings": {
  "defaultImmediateFeedback": true
}
```

### Enable question randomisation by default

```json
"examSettings": {
  "defaultRandomize": true
}
```

---

## LocalStorage Data

All user progress is stored in the browser's LocalStorage under these keys:

| Key | Contents |
|-----|----------|
| `dqb_stats` | Global statistics (attempted, correct, etc.) |
| `dqb_progress` | Per-subject completion records |
| `dqb_incorrect` | Incorrect questions review bank |
| `dqb_flagged` | Saved questions (the Flag button became Save; the stored name is unchanged) |
| `dqb_exam_history` | Last 100 exam results |
| `dqb_current_exam` | In-progress exam state |
| `dqb_last_page` | Last visited page (for session restore) |
| `dqb_settings` | User preferences |
| `dqb_count_cache` | Remembered question counts per topic, so pages open instantly (not cleared by Reset Progress) |

When cloud sync is on, more keys appear:

| Key | Contents |
|-----|----------|
| `dqb_sync` | Sync bookkeeping for the signed-in account (change versions, queued uploads) |
| `dqb_device_id` | Random id for this browser, used so the server can tell devices apart |
| `dqb_cloud_preview` | Set by opening the site with `?cloud=1`; shows the sign-in button on this device only |
| `dqb_backup_guest` | Copy of progress made before signing in, kept until it is added to an account |
| `dqb_backup_guest_prev` | The previous guest copy, kept as a safety net |
| `dqb_backup_guest_imported` | The guest copy after it was added to an account (never deleted automatically) |
| `dqb_backup_account_<id>` | Leftovers of a different account that was signed in on this device |

Cloud sync is controlled by `config/sync-config.json`. While `cloudEnabled` is `false`, nobody sees a Sign in button. To try it on one device first, open the site once with `?cloud=1` added to the address (`?cloud=0` turns that off again).

To **reset all data** (for development), open the browser console and run:
```javascript
Storage.resetAll(); location.reload();
```

---

## Interface Standards

Rules the interface follows. Keep them when you change anything.

- **No emoji anywhere.** Icons are inline SVG (`UI.examIcon()`, `UI.moduleIcon()`, `UI.subjectIcon()` in `ui.js`). A test fails if an emoji appears in any file the site serves.
- **Sizes are in `rem`, never `px`** (except 1 to 2px borders and the two `@container` thresholds). That is what lets the one root value above scale everything. Media-query breakpoints stay in px (600, 768, 840, 1024).
- **Page height uses `dvh`**, not `vh`, so phones and tablets get no false scroll space under the address bar.
- **Pressing:** rows, cards and chips do not shrink when pressed. A soft tint fades in over exactly the element and follows its own corner radius (the `Pressing` block at the end of `styles.css`). Only stand-alone buttons keep a small press.
- **One progress bar.** The exam sidebar, module cards and subject rows all use the same 0.375rem track and the same navy gradient.
- **Saved is sand gold, not green.** Green means correct and red means wrong, and nothing else uses them. That includes the Saved page (header, icon, stripe) and the phone dashboard badge; the count badges on the two phone dashboard buttons (Incorrect and Saved) are the same blue `--quick-badge` #2a5298 with a white number in both themes.
- **Topic rows:** a topic with a professor reads `14 Qs · Prof. Samaa` (plain text, one grey, no badge; the professor is cut with an ellipsis if the row is narrow). A topic without one keeps the full `14 Questions`. The short form exists only to save space.
- **No "Done" badge** on subject rows in the module page; the full bar and `N/N topics` already say it.
- **Header buttons** (Sign in, bin, theme) are all 2.25rem tall with the same border, fill and corner.
- **Number box** with fewer than 6 questions must stay one normal row of square cells (grid columns are `minmax(0,1fr)`, rows never stretch).
- **Motion is short and quiet:** moving between questions slides the new question in from the side you are heading to (220ms, never from fully transparent); an explanation grows open inside its own wrapper (360ms); pop-ups fade and rise.
- **Admin page** classes start with `rc-`. Never use `ad-` or words like banner or sponsor in class names: ad blockers hide them.
- **Dark mode** must keep working after every change: colours come from the variables, never hard-coded.

---

## Admin Dashboard

`admin.html` is for owners (`ADMIN_UIDS`) and admins made by an owner. Tabs: Overview, Content (modules, exam types, subjects, topics and questions, with Edit and Add and Remove, visibility switches and the Ongoing switch), Students (search, Remove, Unblock, make admin), Retention and System. Editing a question commits to GitHub through `/api/admin/question`; it needs the encrypted Cloudflare variable `GITHUB_TOKEN`. The full setup, the D1 `ALTER TABLE` lines to run before uploading, the roles and the limits are in [BACKEND_GUIDE.md](BACKEND_GUIDE.md).

---

## Troubleshooting

**Questions don't load / "No questions available"**
- Make sure the JSON file exists at the correct path.
- Check the JSON is valid (use [jsonlint.com](https://jsonlint.com)).
- Ensure you're running via a local server, not opening the file directly.

**New questions don't show up straight away**
- Question counts are remembered in the browser so pages open instantly. After you add questions, the next visit shows the old count for a moment, then the page refreshes by itself once it notices the change. A hard-refresh is not needed.

**Changes don't appear after pushing to GitHub Pages**
- GitHub Pages can take 1–2 minutes to rebuild. Hard-refresh the page (`Ctrl+Shift+R`).

**Progress was lost**
- Check that browser LocalStorage is enabled (not blocked by private mode or extensions).
- If you were signed in, sign in again: your progress is stored in your account.

**Sign in says it cannot reach the account, or sync is paused**
- Your progress is safe on the device and uploads automatically when the connection or the daily service limit recovers. Use Sync now in the account window to retry.
- Google sign-in can fail inside in-app browsers (Telegram, Instagram). Open the site in Chrome or Safari, or use email sign-in.

---

## Cloud Sync and Accounts

Accounts are optional. Guests keep using the app exactly as before, with progress in the browser.

- **Sign in:** Google or email and password, from the header. No approval step and no university-email restriction.
- **What syncs:** per-topic progress, incorrect questions, flagged questions and exam history. Statistics are calculated from exam history on the server, so a resent exam is never counted twice.
- **Guest progress:** signing in to a brand-new account adds the progress made as a guest. Signing in to an account that already has data keeps the account's data and offers "Add it to this account" in the account window. Nothing is overwritten.
- **Reset progress:** once signed in it moves from the header to the account window and clears scores, progress and incorrect questions on all devices (flagged questions are kept).
- **Delete account:** in the account window. It asks for your password (or Google), then permanently deletes your cloud data and your sign-in.
- **Privacy:** the server stores question ids, exam results, the display name and the email address from the verified sign-in (so admins can list students and remove an account). Admins see per-student exam counts and accuracy in the dashboard; the questions a student saved are their own review list and are shown to admins only as a combined count.
- **Switch:** while `cloudEnabled` in `config/sync-config.json` is `false`, nobody sees a Sign in button. Open the site once with `?cloud=1` to try it on one device (`?cloud=0` turns that off).

How it works, the API, the database, how to add features and the project status are in [BACKEND_GUIDE.md](BACKEND_GUIDE.md).

---

## Roadmap

Recently added:

- Optional accounts and cloud sync (Google or email), guest progress import, Reset progress and Delete account in the account window
- Admin dashboard: Overview, Content editor, Students, Retention, System
- Interface refresh: one fluid scale for every screen, one-tap resume card, correct/wrong colours in the number box, gold Saved, unified progress bars, directional question transitions, no emoji
- Navy notifications that match the app in light and dark mode

- Redesigned dashboard stats (questions solved, accuracy, study time)
- Per-module progress rings with average score
- Resume banner for continuing an in-progress exam
- Light and dark themes

Planned:

- [ ] Timed exam mode
- [ ] Question difficulty tags
- [ ] Notes on individual questions
- [ ] PDF export of results
- [ ] Offline PWA support (service worker)
- [ ] Resume an in-progress exam on another device
- [ ] Past-attempt review

---

## Licence

MIT — free to use, modify, and distribute.
