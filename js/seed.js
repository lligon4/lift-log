import { get, getAll, put, putMany, getMeta, setMeta } from './db.js';

// [id, name, type, muscleGroup, equipment]
const SEED = [
  ['bb-bench', 'Barbell Bench Press', 'strength', 'Chest', 'barbell'],
  ['db-bench', 'Dumbbell Bench Press', 'strength', 'Chest', 'dumbbell'],
  ['db-incline', 'Incline Dumbbell Press', 'strength', 'Chest', 'dumbbell'],
  ['db-fly', 'Dumbbell Fly', 'strength', 'Chest', 'dumbbell'],
  ['pushup', 'Push-up', 'strength', 'Chest', 'bodyweight'],
  ['bb-row', 'Barbell Row', 'strength', 'Back', 'barbell'],
  ['db-row', 'One-Arm Dumbbell Row', 'strength', 'Back', 'dumbbell'],
  ['pullup', 'Pull-up', 'strength', 'Back', 'bodyweight'],
  ['lat-pulldown', 'Lat Pulldown', 'strength', 'Back', 'band'],
  ['kb-swing', 'Kettlebell Swing', 'strength', 'Back', 'kettlebell'],
  ['deadlift', 'Deadlift', 'strength', 'Back', 'barbell'],
  ['ohp', 'Overhead Press', 'strength', 'Shoulders', 'barbell'],
  ['db-shoulder-press', 'Dumbbell Shoulder Press', 'strength', 'Shoulders', 'dumbbell'],
  ['db-lateral', 'Lateral Raise', 'strength', 'Shoulders', 'dumbbell'],
  ['face-pull', 'Face Pull', 'strength', 'Shoulders', 'band'],
  ['bb-curl', 'Barbell Curl', 'strength', 'Arms', 'barbell'],
  ['db-curl', 'Dumbbell Curl', 'strength', 'Arms', 'dumbbell'],
  ['hammer-curl', 'Hammer Curl', 'strength', 'Arms', 'dumbbell'],
  ['tricep-pushdown', 'Tricep Pushdown', 'strength', 'Arms', 'band'],
  ['db-overhead-ext', 'Overhead Tricep Extension', 'strength', 'Arms', 'dumbbell'],
  ['dip', 'Dip', 'strength', 'Arms', 'bodyweight'],
  ['back-squat', 'Back Squat', 'strength', 'Legs', 'barbell'],
  ['goblet-squat', 'Goblet Squat', 'strength', 'Legs', 'dumbbell'],
  ['rdl', 'Romanian Deadlift', 'strength', 'Legs', 'barbell'],
  ['db-lunge', 'Dumbbell Lunge', 'strength', 'Legs', 'dumbbell'],
  ['leg-press', 'Leg Press', 'strength', 'Legs', 'machine'],
  ['calf-raise', 'Calf Raise', 'strength', 'Legs', 'dumbbell'],
  ['plank', 'Plank', 'timed', 'Core', 'bodyweight'],
  ['hanging-leg-raise', 'Hanging Leg Raise', 'strength', 'Core', 'bodyweight'],
  ['run', 'Run', 'cardio', 'Cardio', 'none'],
  ['bike', 'Bike', 'cardio', 'Cardio', 'none'],
  ['walk', 'Walk', 'cardio', 'Cardio', 'none'],
  ['yoga', 'Yoga', 'flex', 'Flexibility', 'none'],
  ['stretch', 'Stretching', 'flex', 'Flexibility', 'none'],
];

// Added in v1.3 for a dumbbell / barbell / kettlebell / band / bodyweight setup.
// Existing devices get them through migrate().
const SEED_V4 = [
  ['db-floor-press', 'Dumbbell Floor Press', 'strength', 'Chest', 'dumbbell'],
  ['band-fly', 'Band Chest Fly', 'strength', 'Chest', 'band'],
  ['close-grip-pushup', 'Close-Grip Push-up', 'strength', 'Arms', 'bodyweight'],
  ['pike-pushup', 'Pike Push-up', 'strength', 'Shoulders', 'bodyweight'],
  ['kb-clean-press', 'Kettlebell Clean & Press', 'strength', 'Shoulders', 'kettlebell'],
  ['db-reverse-fly', 'Reverse Dumbbell Fly', 'strength', 'Shoulders', 'dumbbell'],
  ['band-pull-apart', 'Band Pull-Apart', 'strength', 'Shoulders', 'band'],
  ['chinup', 'Chin-up', 'strength', 'Back', 'bodyweight'],
  ['kb-gorilla-row', 'Kettlebell Gorilla Row', 'strength', 'Back', 'kettlebell'],
  ['band-row', 'Band Row', 'strength', 'Back', 'band'],
  ['db-shrug', 'Dumbbell Shrug', 'strength', 'Back', 'dumbbell'],
  ['db-skullcrusher', 'Dumbbell Skull Crusher', 'strength', 'Arms', 'dumbbell'],
  ['band-curl', 'Band Curl', 'strength', 'Arms', 'band'],
  ['front-squat', 'Front Squat', 'strength', 'Legs', 'barbell'],
  ['bulgarian-split-squat', 'Bulgarian Split Squat', 'strength', 'Legs', 'dumbbell'],
  ['db-step-up', 'Dumbbell Step-up', 'strength', 'Legs', 'dumbbell'],
  ['hip-thrust', 'Barbell Hip Thrust', 'strength', 'Legs', 'barbell'],
  ['db-rdl', 'Dumbbell Romanian Deadlift', 'strength', 'Legs', 'dumbbell'],
  ['kb-goblet-squat', 'Kettlebell Goblet Squat', 'strength', 'Legs', 'kettlebell'],
  ['turkish-getup', 'Turkish Get-up', 'strength', 'Core', 'kettlebell'],
  ['pallof-press', 'Pallof Press', 'strength', 'Core', 'band'],
  ['dead-bug', 'Dead Bug', 'strength', 'Core', 'bodyweight'],
  ['side-plank', 'Side Plank', 'timed', 'Core', 'bodyweight'],
  ['farmer-carry', "Farmer's Carry", 'timed', 'Other', 'kettlebell'],
];

// No cable stack at home: these built-ins are done with a band anchored high or at chest height.
const CABLE_TO_BAND = ['lat-pulldown', 'face-pull', 'tricep-pushdown'];

const exerciseRow = ([id, name, type, muscleGroup, equipment]) => ({
  id, name, type, muscleGroup, equipment, custom: false, archived: false,
});

// [id, name, group, exerciseIds]. Push and Pull each cover the whole body:
// presses + squat on push days, pulls + hinge on pull days.
// Each new day is built from one squat or hinge, one press, one pull and accessories.
const TEMPLATES = [
  ['tpl-push', 'Push', 'Push / Pull', ['bb-bench', 'ohp', 'back-squat', 'db-incline', 'tricep-pushdown']],
  ['tpl-pull', 'Pull', 'Push / Pull', ['deadlift', 'pullup', 'bb-row', 'face-pull', 'db-curl']],
  ['tpl-upper', 'Upper', 'Upper / Lower', ['db-bench', 'db-row', 'db-shoulder-press', 'lat-pulldown', 'hammer-curl']],
  ['tpl-lower', 'Lower', 'Upper / Lower', ['back-squat', 'rdl', 'db-lunge', 'calf-raise', 'plank']],
];

// Added in v1.3. B days rotate with the originals inside each group (Push -> Pull -> Push B -> Pull B).
const TEMPLATES_V4 = [
  ['tpl-push-b', 'Push B', 'Push / Pull', ['db-floor-press', 'kb-clean-press', 'bulgarian-split-squat', 'db-lateral', 'close-grip-pushup']],
  ['tpl-pull-b', 'Pull B', 'Push / Pull', ['kb-swing', 'chinup', 'kb-gorilla-row', 'band-pull-apart', 'hammer-curl']],
  ['tpl-upper-b', 'Upper B', 'Upper / Lower', ['ohp', 'pullup', 'db-incline', 'band-row', 'db-skullcrusher']],
  ['tpl-lower-b', 'Lower B', 'Upper / Lower', ['front-squat', 'hip-thrust', 'db-step-up', 'farmer-carry', 'side-plank']],
  ['tpl-fb-kb', 'Kettlebell Full Body', 'Full Body', ['kb-swing', 'kb-goblet-squat', 'kb-clean-press', 'kb-gorilla-row', 'turkish-getup']],
  ['tpl-fb-db', 'Dumbbell & Band Full Body', 'Full Body', ['db-rdl', 'pushup', 'db-row', 'bulgarian-split-squat', 'pallof-press']],
];

const templateRows = (list, start) => list.map(([id, name, group, exerciseIds], i) => ({
  id, name, group, exerciseIds, order: start + i,
}));

export async function seedIfEmpty() {
  const existing = await getAll('exercises');
  if (existing.length) return;
  await putMany('exercises', [...SEED, ...SEED_V4].map(exerciseRow));
}

// One-off fixes to the built-in exercises on devices seeded by an older version.
// Existing workout entries keep their own shape, so nothing logged changes.
export async function migrate() {
  const v = (await getMeta('seedVersion')) || 1;
  if (v < 2) {
    const plank = await get('exercises', 'plank');
    if (plank && !plank.custom && plank.type === 'flex') await put('exercises', { ...plank, type: 'timed' });
  }
  if (v < 3 && !(await getAll('templates')).length) {
    await putMany('templates', templateRows(TEMPLATES, 0));
  }
  if (v < 4) {
    const exercises = new Map((await getAll('exercises')).map((e) => [e.id, e]));
    await putMany('exercises', SEED_V4.filter(([id]) => !exercises.has(id)).map(exerciseRow));
    const toBand = CABLE_TO_BAND.map((id) => exercises.get(id)).filter((e) => e && !e.custom && e.equipment === 'cable');
    await putMany('exercises', toBand.map((e) => ({ ...e, equipment: 'band' })));
    // New templates go after whatever the user already has; ones they already have (by id) are left alone.
    const templates = await getAll('templates');
    const have = new Set(templates.map((t) => t.id));
    const start = Math.max(-1, ...templates.map((t) => t.order ?? 0)) + 1;
    await putMany('templates', templateRows(TEMPLATES_V4.filter(([id]) => !have.has(id)), start));
  }
  if (v < 4) await setMeta('seedVersion', 4);
}

export const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Cardio', 'Flexibility', 'Other'];
export const EQUIPMENT = ['barbell', 'dumbbell', 'kettlebell', 'band', 'bodyweight', 'machine', 'cable', 'none'];
