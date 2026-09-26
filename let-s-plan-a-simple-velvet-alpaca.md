# Fitness Tracker v1 — Plan

## Context
You want a simple way to log weightlifting sessions, set by set, on your phone at the gym: exercise, weight, target reps vs. actual reps, and sets. You also want to review past workouts to plan the next one. Running, biking and yoga come up now and then, and only need duration and distance. Suggesting exercises from your available free weights is a later phase. The data model keeps equipment tags now so that phase can be added without a migration.

Decisions from Q&A:
- Data stays on one device, in the browser. JSON export/import provides backup.
- Each set is logged as its own row: weight, target reps, actual reps.
- Logging happens live on your phone, so the layout is mobile-first.
- Weights are in lb and always record the total weight moved.
- Hosting is a GitHub Pages PWA that is installable and works offline.
- Exercises start from a seeded list and you can add custom ones. Each exercise is tagged with muscle group and equipment.
- Cardio and yoga record duration and distance.
- The only history view in v1 is a workout log list.

## Tech approach
- Plain HTML, CSS and JavaScript using ES modules. There is no build step and no dependencies, so GitHub Pages can serve the repo as-is.
- Data is stored in IndexedDB through a small hand-written wrapper. On first load the app calls `navigator.storage.persist()` so the browser is less likely to evict the data. Installing the app to the home screen matters on iOS, where Safari can clear storage for sites that aren't installed.
- A service worker caches the app shell for offline use. A `manifest.webmanifest` makes the app installable.
- There is no framework. Views are rendered by small functions and a hash router (`#/log`, `#/history`, `#/exercises`, `#/settings`).

## Data model (IndexedDB stores)
- **exercises**: `{ id, name, type: 'strength'|'cardio'|'flex', muscleGroup, equipment: 'barbell'|'dumbbell'|'kettlebell'|'bodyweight'|'machine'|'cable'|'none', custom: bool, archived: bool }`
- **workouts**: `{ id, date (ISO), startedAt, finishedAt, notes, entries: [Entry] }`
  - A strength entry is `{ exerciseId, sets: [{ weight, targetReps, actualReps, done }] }`.
  - A cardio or flex entry is `{ exerciseId, durationMin, distanceMi? }`.
- Volume is calculated when needed as Σ(weight × actualReps). It is never stored.
- Each workout keeps its entries inside the workout record. This keeps the logging flow atomic and simple. A per-exercise history can still be built later by scanning workouts, which is fast enough for years of personal data.

## Screens
1. **Log (home)**: Tap "Start workout" to open a session for today.
   - "Add exercise" opens a searchable picker grouped by muscle, with an option to add a custom exercise.
   - Each strength exercise shows a card with one row per set: weight, target reps, actual reps, and a done checkbox. The "+ Set" button copies the previous set's weight and target so you only adjust what changed. Inputs use large tap targets and `inputmode="decimal"` or `numeric`.
   - Cardio and yoga cards have duration and distance fields.
   - Each card shows its running volume, and the workout shows a total. "Finish" saves the end time. The session autosaves after every change, so an accidental refresh at the gym doesn't lose anything.
2. **History**: Past workouts, newest first. Each row shows the date, the exercises done, total sets and total volume. Tap a row to expand it and see every set as `weight × actual/target`. From the expanded view you can edit or delete that workout.
3. **Exercises**: The seeded list plus your custom exercises. You can add, rename and archive them.
4. **Settings**: Export all data to a JSON file, import from JSON (replace or merge), and see the app version.

## Files
```
index.html               app shell, nav bar
manifest.webmanifest     PWA manifest
sw.js                    service worker (cache-first app shell, versioned cache)
css/styles.css           mobile-first styles, dark mode
js/app.js                router + bootstrapping
js/db.js                 IndexedDB wrapper (open, get, put, delete, getAll)
js/seed.js               ~30 seeded exercises with muscle/equipment tags
js/views/log.js          active workout screen
js/views/history.js      workout list
js/views/exercises.js    exercise management
js/views/settings.js     export/import
js/util.js               volume calc, date formatting, id generation
icons/                   PWA icons (192, 512)
```

## Out of scope for v1 (data model already supports these)
- Per-exercise history and "last time" hints
- Charts
- Templates
- Suggestions based on available equipment and weights

## Verification
1. Serve the folder locally with `npx serve` or `python -m http.server`. Open it in desktop Chrome with device emulation set to a phone size.
2. Log a workout with two strength exercises of three sets each, including one missed rep, plus one run with duration and distance. Refresh partway through and confirm nothing is lost. Finish the workout.
3. In History, check the totals: volume, and actual vs. target reps. Edit a set and confirm the change persists. Delete a workout.
4. Export to JSON, clear site data, import the file, and confirm the history is restored.
5. Lighthouse PWA check: confirm the app is installable and loads with DevTools set to offline.
6. Push to GitHub Pages, open the site on your phone, add it to the home screen, and log a quick test set with airplane mode on.
