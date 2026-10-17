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
  ['lat-pulldown', 'Lat Pulldown', 'strength', 'Back', 'cable'],
  ['kb-swing', 'Kettlebell Swing', 'strength', 'Back', 'kettlebell'],
  ['deadlift', 'Deadlift', 'strength', 'Back', 'barbell'],
  ['ohp', 'Overhead Press', 'strength', 'Shoulders', 'barbell'],
  ['db-shoulder-press', 'Dumbbell Shoulder Press', 'strength', 'Shoulders', 'dumbbell'],
  ['db-lateral', 'Lateral Raise', 'strength', 'Shoulders', 'dumbbell'],
  ['face-pull', 'Face Pull', 'strength', 'Shoulders', 'cable'],
  ['bb-curl', 'Barbell Curl', 'strength', 'Arms', 'barbell'],
  ['db-curl', 'Dumbbell Curl', 'strength', 'Arms', 'dumbbell'],
  ['hammer-curl', 'Hammer Curl', 'strength', 'Arms', 'dumbbell'],
  ['tricep-pushdown', 'Tricep Pushdown', 'strength', 'Arms', 'cable'],
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

export async function seedIfEmpty() {
  const existing = await getAll('exercises');
  if (existing.length) return;
  await putMany('exercises', SEED.map(([id, name, type, muscleGroup, equipment]) => ({
    id, name, type, muscleGroup, equipment, custom: false, archived: false,
  })));
}

// One-off fixes to the built-in exercises on devices seeded by an older version.
// Existing workout entries keep their own shape, so nothing logged changes.
export async function migrate() {
  const v = (await getMeta('seedVersion')) || 1;
  if (v < 2) {
    const plank = await get('exercises', 'plank');
    if (plank && !plank.custom && plank.type === 'flex') await put('exercises', { ...plank, type: 'timed' });
  }
  if (v < 2) await setMeta('seedVersion', 2);
}

export const MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Cardio', 'Flexibility', 'Other'];
export const EQUIPMENT = ['barbell', 'dumbbell', 'kettlebell', 'bodyweight', 'machine', 'cable', 'none'];
