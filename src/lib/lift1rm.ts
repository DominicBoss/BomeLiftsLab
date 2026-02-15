export type OneRMs = { squat: number; bench: number; deadlift: number }

export type BaseLift = 'squat' | 'bench' | 'deadlift' | 'other'

export function base1rmForBaseLift(baseLift: BaseLift, rms: OneRMs) {
  if (baseLift === 'squat') return rms.squat
  if (baseLift === 'bench') return rms.bench
  if (baseLift === 'deadlift') return rms.deadlift
  return 0
}

/**
 * Backward-compatible helper: tries to infer base lift from the exercise name.
 * Prefer using `base1rmForBaseLift(exercises.base_lift, rms)` going forward.
 */
export function base1rmForExercise(exName: string, rms: OneRMs) {
  const n = (exName ?? '').toLowerCase()

  // bench family
  if (n.includes('bench') || n.includes('press') || n.includes('spoto') || n.includes('close grip')) {
    return rms.bench
  }

  // deadlift family
  if (n.includes('deadlift') || n.includes('rdl') || n.includes('block pull')) {
    return rms.deadlift
  }

  // default squat family
  return rms.squat
}