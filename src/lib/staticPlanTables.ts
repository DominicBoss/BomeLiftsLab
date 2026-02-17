// src/lib/staticPlanTables.ts

export type BaseLift = 'squat' | 'bench' | 'deadlift'
export type SlotType = 'primary' | 'secondary' | 'tertiary'
export type Proficiency = 'Beginner' | 'Advanced'

export type Block = 'Volume' | 'Strength' | 'Peak'

export function blockForWeek(week: number): Block {
  if (week <= 4) return 'Volume'
  if (week <= 8) return 'Strength'
  return 'Peak'
}

export const PROFICIENCY_CAPS = {
  Beginner: {
    lowerDailyMax: 2.5,
    upperDailyMax: 2.5,
    overallDailyMax: 3.5,
    lowerWeeklyMax: 7.5,
    upperWeeklyMax: 8,
    overallWeeklyMax: 14,
  },
  Advanced: {
    lowerDailyMax: 3.25,
    upperDailyMax: 3.25,
    overallDailyMax: 4.5,
    lowerWeeklyMax: 10,
    upperWeeklyMax: 11,
    overallWeeklyMax: 18,
  },
}

export const VARIATION_META: Record<string, { fatigueScore: number }> = {
  'Competition Squat': { fatigueScore: 1.5 },
  'Competition Bench': { fatigueScore: 1.5 },
  'Competition Deadlift': { fatigueScore: 1.7 },

  'Paused Squat': { fatigueScore: 1.0 },
  'Pin Squat (Mid)': { fatigueScore: 1.1 },
  'Tempo Squat': { fatigueScore: 0.7 },

  'Paused Bench': { fatigueScore: 0.9 },
  'Close Grip Bench': { fatigueScore: 0.9 },
  'Pin Press': { fatigueScore: 1.0 },
  'Tempo Bench': { fatigueScore: 0.7 },

  'RDL': { fatigueScore: 1.0 },
  'Paused Deadlift': { fatigueScore: 1.1 },
  'Deficit Deadlift': { fatigueScore: 1.1 },
  'Hip Thrust': { fatigueScore: 0.7 },
}

export function competitionName(lift: BaseLift) {
  if (lift === 'squat') return 'Competition Squat'
  if (lift === 'bench') return 'Competition Bench'
  return 'Competition Deadlift'
}

/* =============================
   PRIMARY / SECONDARY / TERTIARY
   (Deine bestehenden Tabellen)
   ============================= */

export function findPrimary(week: number, lift: BaseLift) {
  // stark verkürzt – hier deine bestehende Tabelle einsetzen
  // Beispiel:
  if (week <= 4) {
    return {
      top: { sets: 4, reps: week <= 2 ? 6 : 5, rpe: week === 1 ? 6 : week === 2 ? 6.5 : week === 3 ? 7 : 6.5 },
      backoff: undefined,
    }
  }

  if (week <= 8) {
    const map = {
      5: { reps: 4, rpe: 7 },
      6: { reps: 3, rpe: 8 },
      7: { reps: 2, rpe: 8.5 },
      8: { reps: 2, rpe: 8 },
    } as any
    return {
      top: { sets: 1, reps: map[week].reps, rpe: map[week].rpe },
      backoff: { sets: 3, reps: map[week].reps, rpe: map[week].rpe - 0.5 },
    }
  }

  return {
    top: { sets: 1, reps: 1, rpe: week === 9 ? 8.5 : 9 },
    backoff: week === 9 ? { sets: 2, reps: 2, rpe: 7.5 } : { sets: 1, reps: 2, rpe: 7 },
  }
}

export function findSecondary(week: number, lift: BaseLift) {
  if (week <= 4) {
    return { sets: 4, reps: 8, rpe: 6 }
  }
  if (week <= 8) {
    return { sets: 3, reps: 5, rpe: 7 }
  }
  return { sets: 0, reps: 0, rpe: 0 }
}

export function findTertiary(week: number, lift: BaseLift) {
  if (week <= 4) return { sets: 3, reps: 10, rpe: 6 }
  if (week <= 8) return { sets: 2, reps: 6, rpe: 6 }
  return { sets: 0, reps: 0, rpe: 0 }
}

export function getSlotTargets(days: 3 | 4 | 5 | 6, prof: Proficiency) {
  const benchPrimary = days >= 5 ? 2 : 1
  return {
    squat: { primary: 1, secondary: 1, tertiary: days >= 5 ? 1 : 0 },
    bench: { primary: benchPrimary, secondary: 1, tertiary: days >= 4 ? 1 : 0 },
    deadlift: { primary: 1, secondary: prof === 'Advanced' ? 1 : 0, tertiary: 0 },
  }
}

export function secondaryVariation(block: Block, lift: BaseLift, weaknesses?: string[]) {
  if (lift === 'bench') {
    if (weaknesses?.includes('bench_off_chest')) return 'Paused Bench'
    if (weaknesses?.includes('bench_lockout')) return 'Pin Press'
    return 'Close Grip Bench'
  }

  if (lift === 'squat') {
    if (weaknesses?.includes('squat_hole')) return 'Paused Squat'
    return 'Pin Squat (Mid)'
  }

  if (lift === 'deadlift') {
    if (block === 'Volume') return 'Deficit Deadlift'
    if (weaknesses?.includes('deadlift_off_floor')) return 'Paused Deadlift'
    return 'RDL'
  }

  return competitionName(lift)
}

export function tertiaryVariation(lift: BaseLift) {
  if (lift === 'bench') return 'Tempo Bench'
  if (lift === 'squat') return 'Tempo Squat'
  return 'Hip Thrust'
}