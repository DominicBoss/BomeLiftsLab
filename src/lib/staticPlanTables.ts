export type Block = 'Volume' | 'Strength' | 'Peak'
export type BaseLift = 'squat' | 'bench' | 'deadlift'
export type Proficiency = 'Beginner' | 'Advanced'

export type SlotType = 'primary' | 'secondary' | 'tertiary'

export type PrimaryRow = {
  block: Block
  week: number
  lift: BaseLift
  top: { sets: number; reps: number; rpe: number }
  backoff?: { sets: number; reps: number; rpe: number }
}

export type SimpleRow = {
  block: Block
  week: number
  lift: BaseLift
  sets: number
  reps: number
  rpe: number
}

// ---------- Frequency / caps (static, generator-driven) ----------

export type FrequencyRow = {
  frequencyDays: 3 | 4 | 5 | 6
  lift: BaseLift
  primarySlots: number
  secondaryBeginner: number
  secondaryAdvanced: number
  tertiaryBeginner: number
  tertiaryAdvanced: number
}

// Source: your FrequencyDays table (with a bench bump for Advanced).
export const FREQUENCY_DAYS: FrequencyRow[] = [
  { frequencyDays: 3, lift: 'squat', primarySlots: 1, secondaryBeginner: 1, secondaryAdvanced: 1, tertiaryBeginner: 0, tertiaryAdvanced: 1 },
  { frequencyDays: 3, lift: 'bench', primarySlots: 1, secondaryBeginner: 1, secondaryAdvanced: 2, tertiaryBeginner: 0, tertiaryAdvanced: 1 },
  { frequencyDays: 3, lift: 'deadlift', primarySlots: 1, secondaryBeginner: 0, secondaryAdvanced: 1, tertiaryBeginner: 0, tertiaryAdvanced: 1 },

  { frequencyDays: 4, lift: 'squat', primarySlots: 1, secondaryBeginner: 1, secondaryAdvanced: 1, tertiaryBeginner: 0, tertiaryAdvanced: 1 },
  { frequencyDays: 4, lift: 'bench', primarySlots: 1, secondaryBeginner: 1, secondaryAdvanced: 2, tertiaryBeginner: 1, tertiaryAdvanced: 1 },
  { frequencyDays: 4, lift: 'deadlift', primarySlots: 1, secondaryBeginner: 1, secondaryAdvanced: 1, tertiaryBeginner: 0, tertiaryAdvanced: 1 },

  { frequencyDays: 5, lift: 'squat', primarySlots: 1, secondaryBeginner: 1, secondaryAdvanced: 1, tertiaryBeginner: 1, tertiaryAdvanced: 1 },
  { frequencyDays: 5, lift: 'bench', primarySlots: 2, secondaryBeginner: 1, secondaryAdvanced: 2, tertiaryBeginner: 1, tertiaryAdvanced: 2 },
  { frequencyDays: 5, lift: 'deadlift', primarySlots: 1, secondaryBeginner: 1, secondaryAdvanced: 1, tertiaryBeginner: 0, tertiaryAdvanced: 1 },

  { frequencyDays: 6, lift: 'squat', primarySlots: 1, secondaryBeginner: 1, secondaryAdvanced: 1, tertiaryBeginner: 1, tertiaryAdvanced: 1 },
  { frequencyDays: 6, lift: 'bench', primarySlots: 2, secondaryBeginner: 1, secondaryAdvanced: 2, tertiaryBeginner: 1, tertiaryAdvanced: 2 },
  { frequencyDays: 6, lift: 'deadlift', primarySlots: 1, secondaryBeginner: 1, secondaryAdvanced: 1, tertiaryBeginner: 0, tertiaryAdvanced: 1 },
]

export type ProficiencyCaps = {
  lowerDailyMax: number
  upperDailyMax: number
  overallDailyMax: number
  lowerWeeklyMax: number
  upperWeeklyMax: number
  overallWeeklyMax: number
}

// Static caps (work in the same unit as our fatigue estimate below).
export const PROFICIENCY_CAPS: Record<Proficiency, ProficiencyCaps> = {
  Beginner: { lowerDailyMax: 2.5, upperDailyMax: 2.5, overallDailyMax: 3.5, lowerWeeklyMax: 7.5, upperWeeklyMax: 8, overallWeeklyMax: 14 },
  Advanced: { lowerDailyMax: 3.25, upperDailyMax: 3.25, overallDailyMax: 4.5, lowerWeeklyMax: 10, upperWeeklyMax: 11, overallWeeklyMax: 18 },
}

export type SlotTargets = Record<BaseLift, { primary: number; secondary: number; tertiary: number }>

export function getSlotTargets(days: 3 | 4 | 5 | 6, proficiency: Proficiency): SlotTargets {
  const rows = FREQUENCY_DAYS.filter((r) => r.frequencyDays === days)
  const get = (lift: BaseLift) => rows.find((r) => r.lift === lift)!

  const squat = get('squat')
  const bench = get('bench')
  const deadlift = get('deadlift')

  return {
    squat: {
      primary: squat.primarySlots,
      secondary: proficiency === 'Advanced' ? squat.secondaryAdvanced : squat.secondaryBeginner,
      tertiary: proficiency === 'Advanced' ? squat.tertiaryAdvanced : squat.tertiaryBeginner,
    },
    bench: {
      primary: bench.primarySlots,
      secondary: proficiency === 'Advanced' ? bench.secondaryAdvanced : bench.secondaryBeginner,
      tertiary: proficiency === 'Advanced' ? bench.tertiaryAdvanced : bench.tertiaryBeginner,
    },
    deadlift: {
      primary: deadlift.primarySlots,
      secondary: proficiency === 'Advanced' ? deadlift.secondaryAdvanced : deadlift.secondaryBeginner,
      tertiary: proficiency === 'Advanced' ? deadlift.tertiaryAdvanced : deadlift.tertiaryBeginner,
    },
  }
}

// ---------- Fatigue estimate (used only to prevent obviously dumb slot packing) ----------

export type VariationMeta = {
  name: string
  fatigueScore: number
  region: 'Lower' | 'Upper'
}

export const VARIATION_META: Record<string, VariationMeta> = {
  // Competition
  'Competition Squat': { name: 'Competition Squat', fatigueScore: 1.5, region: 'Lower' },
  'Competition Bench': { name: 'Competition Bench', fatigueScore: 1.5, region: 'Upper' },
  'Competition Deadlift': { name: 'Competition Deadlift', fatigueScore: 1.5, region: 'Lower' },

  // Secondary
  'Paused Squat': { name: 'Paused Squat', fatigueScore: 1.0, region: 'Lower' },
  'Pin Squat (Mid)': { name: 'Pin Squat (Mid)', fatigueScore: 1.1, region: 'Lower' },
  'Paused Bench': { name: 'Paused Bench', fatigueScore: 0.95, region: 'Upper' },
  'Pin Press': { name: 'Pin Press', fatigueScore: 1.0, region: 'Upper' },
  'RDL': { name: 'RDL', fatigueScore: 0.9, region: 'Lower' },
  'Paused Deadlift': { name: 'Paused Deadlift', fatigueScore: 1.15, region: 'Lower' },

  // Tertiary
  'Tempo Squat': { name: 'Tempo Squat', fatigueScore: 0.7, region: 'Lower' },
  'Tempo Bench': { name: 'Tempo Bench', fatigueScore: 0.7, region: 'Upper' },
  'Hip Thrust': { name: 'Hip Thrust', fatigueScore: 0.7, region: 'Lower' },
}

export function competitionName(lift: BaseLift) {
  if (lift === 'squat') return 'Competition Squat'
  if (lift === 'bench') return 'Competition Bench'
  return 'Competition Deadlift'
}

export function secondaryVariation(block: Block, lift: BaseLift) {
  if (lift === 'squat') return block === 'Strength' ? 'Pin Squat (Mid)' : 'Paused Squat'
  if (lift === 'bench') return block === 'Strength' ? 'Pin Press' : 'Paused Bench'
  return block === 'Strength' ? 'Paused Deadlift' : 'RDL'
}

export function tertiaryVariation(lift: BaseLift) {
  if (lift === 'squat') return 'Tempo Squat'
  if (lift === 'bench') return 'Tempo Bench'
  return 'Hip Thrust'
}

// ---------- Prescriptions (static tables) ----------

export const PRIMARY: PrimaryRow[] = [
  // Volume 1-4
  { block: 'Volume', week: 1, lift: 'squat', top: { sets: 4, reps: 6, rpe: 6 } },
  { block: 'Volume', week: 2, lift: 'squat', top: { sets: 4, reps: 6, rpe: 6.5 } },
  { block: 'Volume', week: 3, lift: 'squat', top: { sets: 4, reps: 5, rpe: 7 } },
  { block: 'Volume', week: 4, lift: 'squat', top: { sets: 4, reps: 5, rpe: 6.5 } },

  { block: 'Volume', week: 1, lift: 'bench', top: { sets: 4, reps: 6, rpe: 6 } },
  { block: 'Volume', week: 2, lift: 'bench', top: { sets: 4, reps: 6, rpe: 6.5 } },
  { block: 'Volume', week: 3, lift: 'bench', top: { sets: 4, reps: 5, rpe: 7 } },
  { block: 'Volume', week: 4, lift: 'bench', top: { sets: 4, reps: 5, rpe: 6.5 } },

  { block: 'Volume', week: 1, lift: 'deadlift', top: { sets: 3, reps: 5, rpe: 6 } },
  { block: 'Volume', week: 2, lift: 'deadlift', top: { sets: 3, reps: 5, rpe: 6.5 } },
  { block: 'Volume', week: 3, lift: 'deadlift', top: { sets: 3, reps: 4, rpe: 7 } },
  { block: 'Volume', week: 4, lift: 'deadlift', top: { sets: 2, reps: 4, rpe: 6.5 } },

  // Strength 5-8
  { block: 'Strength', week: 5, lift: 'squat', top: { sets: 1, reps: 4, rpe: 7 }, backoff: { sets: 3, reps: 4, rpe: 6.5 } },
  { block: 'Strength', week: 6, lift: 'squat', top: { sets: 1, reps: 3, rpe: 8 }, backoff: { sets: 3, reps: 3, rpe: 7.5 } },
  { block: 'Strength', week: 7, lift: 'squat', top: { sets: 1, reps: 2, rpe: 8.5 }, backoff: { sets: 3, reps: 2, rpe: 8 } },
  { block: 'Strength', week: 8, lift: 'squat', top: { sets: 1, reps: 2, rpe: 8 }, backoff: { sets: 2, reps: 2, rpe: 7.5 } },

  { block: 'Strength', week: 5, lift: 'bench', top: { sets: 1, reps: 4, rpe: 7 }, backoff: { sets: 3, reps: 4, rpe: 6.5 } },
  { block: 'Strength', week: 6, lift: 'bench', top: { sets: 1, reps: 3, rpe: 8 }, backoff: { sets: 3, reps: 3, rpe: 7.5 } },
  { block: 'Strength', week: 7, lift: 'bench', top: { sets: 1, reps: 2, rpe: 8.5 }, backoff: { sets: 3, reps: 2, rpe: 8 } },
  { block: 'Strength', week: 8, lift: 'bench', top: { sets: 1, reps: 2, rpe: 8 }, backoff: { sets: 2, reps: 2, rpe: 7.5 } },

  { block: 'Strength', week: 5, lift: 'deadlift', top: { sets: 1, reps: 3, rpe: 7 }, backoff: { sets: 2, reps: 3, rpe: 6.5 } },
  { block: 'Strength', week: 6, lift: 'deadlift', top: { sets: 1, reps: 2, rpe: 8 }, backoff: { sets: 2, reps: 2, rpe: 7.5 } },
  { block: 'Strength', week: 7, lift: 'deadlift', top: { sets: 1, reps: 2, rpe: 8.5 }, backoff: { sets: 1, reps: 2, rpe: 8 } },
  { block: 'Strength', week: 8, lift: 'deadlift', top: { sets: 1, reps: 2, rpe: 8 }, backoff: { sets: 1, reps: 2, rpe: 7.5 } },

  // Peak 9-10 (singles)
  { block: 'Peak', week: 9, lift: 'squat', top: { sets: 1, reps: 1, rpe: 8.5 }, backoff: { sets: 2, reps: 2, rpe: 7.5 } },
  { block: 'Peak', week: 10, lift: 'squat', top: { sets: 1, reps: 1, rpe: 9 }, backoff: { sets: 1, reps: 2, rpe: 7 } },

  { block: 'Peak', week: 9, lift: 'bench', top: { sets: 1, reps: 1, rpe: 8.5 }, backoff: { sets: 2, reps: 2, rpe: 7.5 } },
  { block: 'Peak', week: 10, lift: 'bench', top: { sets: 1, reps: 1, rpe: 9 }, backoff: { sets: 1, reps: 2, rpe: 7 } },

  { block: 'Peak', week: 9, lift: 'deadlift', top: { sets: 1, reps: 1, rpe: 8.5 }, backoff: { sets: 1, reps: 2, rpe: 7.5 } },
  { block: 'Peak', week: 10, lift: 'deadlift', top: { sets: 1, reps: 1, rpe: 9 }, backoff: { sets: 1, reps: 1, rpe: 7 } },
]

export const SECONDARY: SimpleRow[] = [
  // Volume
  { block: 'Volume', week: 1, lift: 'squat', sets: 4, reps: 8, rpe: 6 },
  { block: 'Volume', week: 2, lift: 'squat', sets: 4, reps: 8, rpe: 7 },
  { block: 'Volume', week: 3, lift: 'squat', sets: 4, reps: 6, rpe: 7.5 },
  { block: 'Volume', week: 4, lift: 'squat', sets: 3, reps: 6, rpe: 6.5 },

  { block: 'Volume', week: 1, lift: 'bench', sets: 4, reps: 8, rpe: 6 },
  { block: 'Volume', week: 2, lift: 'bench', sets: 4, reps: 8, rpe: 7 },
  { block: 'Volume', week: 3, lift: 'bench', sets: 4, reps: 6, rpe: 7.5 },
  { block: 'Volume', week: 4, lift: 'bench', sets: 3, reps: 6, rpe: 6.5 },

  { block: 'Volume', week: 1, lift: 'deadlift', sets: 3, reps: 8, rpe: 6 },
  { block: 'Volume', week: 2, lift: 'deadlift', sets: 3, reps: 8, rpe: 6.5 },
  { block: 'Volume', week: 3, lift: 'deadlift', sets: 3, reps: 6, rpe: 7 },
  { block: 'Volume', week: 4, lift: 'deadlift', sets: 2, reps: 6, rpe: 6.5 },

  // Strength
  { block: 'Strength', week: 5, lift: 'squat', sets: 3, reps: 6, rpe: 7 },
  { block: 'Strength', week: 6, lift: 'squat', sets: 3, reps: 5, rpe: 7.5 },
  { block: 'Strength', week: 7, lift: 'squat', sets: 2, reps: 4, rpe: 7.5 },
  { block: 'Strength', week: 8, lift: 'squat', sets: 2, reps: 3, rpe: 7 },

  { block: 'Strength', week: 5, lift: 'bench', sets: 3, reps: 6, rpe: 7 },
  { block: 'Strength', week: 6, lift: 'bench', sets: 3, reps: 5, rpe: 7.5 },
  { block: 'Strength', week: 7, lift: 'bench', sets: 2, reps: 4, rpe: 7.5 },
  { block: 'Strength', week: 8, lift: 'bench', sets: 2, reps: 3, rpe: 7 },

  { block: 'Strength', week: 5, lift: 'deadlift', sets: 2, reps: 5, rpe: 7 },
  { block: 'Strength', week: 6, lift: 'deadlift', sets: 2, reps: 4, rpe: 7.5 },
  { block: 'Strength', week: 7, lift: 'deadlift', sets: 1, reps: 3, rpe: 7.5 },
  { block: 'Strength', week: 8, lift: 'deadlift', sets: 1, reps: 3, rpe: 7 },

  // Peak (mostly removed)
  { block: 'Peak', week: 9, lift: 'squat', sets: 1, reps: 3, rpe: 6.5 },
  { block: 'Peak', week: 10, lift: 'squat', sets: 0, reps: 0, rpe: 0 },
  { block: 'Peak', week: 9, lift: 'bench', sets: 1, reps: 3, rpe: 6.5 },
  { block: 'Peak', week: 10, lift: 'bench', sets: 0, reps: 0, rpe: 0 },
  { block: 'Peak', week: 9, lift: 'deadlift', sets: 0, reps: 0, rpe: 0 },
  { block: 'Peak', week: 10, lift: 'deadlift', sets: 0, reps: 0, rpe: 0 },
]

export const TERTIARY: SimpleRow[] = [
  // Volume
  { block: 'Volume', week: 1, lift: 'squat', sets: 3, reps: 10, rpe: 6 },
  { block: 'Volume', week: 2, lift: 'squat', sets: 3, reps: 8, rpe: 6.5 },
  { block: 'Volume', week: 3, lift: 'squat', sets: 3, reps: 8, rpe: 6.5 },
  { block: 'Volume', week: 4, lift: 'squat', sets: 2, reps: 6, rpe: 6 },

  { block: 'Volume', week: 1, lift: 'bench', sets: 3, reps: 10, rpe: 6 },
  { block: 'Volume', week: 2, lift: 'bench', sets: 3, reps: 8, rpe: 6.5 },
  { block: 'Volume', week: 3, lift: 'bench', sets: 3, reps: 8, rpe: 6.5 },
  { block: 'Volume', week: 4, lift: 'bench', sets: 2, reps: 6, rpe: 6 },

  { block: 'Volume', week: 1, lift: 'deadlift', sets: 2, reps: 8, rpe: 6 },
  { block: 'Volume', week: 2, lift: 'deadlift', sets: 2, reps: 8, rpe: 6 },
  { block: 'Volume', week: 3, lift: 'deadlift', sets: 2, reps: 6, rpe: 6 },
  { block: 'Volume', week: 4, lift: 'deadlift', sets: 1, reps: 6, rpe: 6 },

  // Strength
  { block: 'Strength', week: 5, lift: 'squat', sets: 2, reps: 8, rpe: 6 },
  { block: 'Strength', week: 6, lift: 'squat', sets: 2, reps: 6, rpe: 6 },
  { block: 'Strength', week: 7, lift: 'squat', sets: 1, reps: 6, rpe: 6 },
  { block: 'Strength', week: 8, lift: 'squat', sets: 1, reps: 5, rpe: 6 },

  { block: 'Strength', week: 5, lift: 'bench', sets: 2, reps: 8, rpe: 6 },
  { block: 'Strength', week: 6, lift: 'bench', sets: 2, reps: 6, rpe: 6 },
  { block: 'Strength', week: 7, lift: 'bench', sets: 1, reps: 6, rpe: 6 },
  { block: 'Strength', week: 8, lift: 'bench', sets: 1, reps: 5, rpe: 6 },

  { block: 'Strength', week: 5, lift: 'deadlift', sets: 1, reps: 6, rpe: 6 },
  { block: 'Strength', week: 6, lift: 'deadlift', sets: 1, reps: 6, rpe: 6 },
  { block: 'Strength', week: 7, lift: 'deadlift', sets: 0, reps: 0, rpe: 0 },
  { block: 'Strength', week: 8, lift: 'deadlift', sets: 0, reps: 0, rpe: 0 },

  // Peak (none)
  { block: 'Peak', week: 9, lift: 'squat', sets: 0, reps: 0, rpe: 0 },
  { block: 'Peak', week: 10, lift: 'squat', sets: 0, reps: 0, rpe: 0 },
  { block: 'Peak', week: 9, lift: 'bench', sets: 0, reps: 0, rpe: 0 },
  { block: 'Peak', week: 10, lift: 'bench', sets: 0, reps: 0, rpe: 0 },
  { block: 'Peak', week: 9, lift: 'deadlift', sets: 0, reps: 0, rpe: 0 },
  { block: 'Peak', week: 10, lift: 'deadlift', sets: 0, reps: 0, rpe: 0 },
]

export function blockForWeek(week: number): Block {
  if (week <= 4) return 'Volume'
  if (week <= 8) return 'Strength'
  return 'Peak'
}

export function findPrimary(week: number, lift: BaseLift) {
  const block = blockForWeek(week)
  const row = PRIMARY.find((r) => r.week === week && r.lift === lift && r.block === block)
  if (!row) throw new Error(`Missing PRIMARY row for ${lift} week ${week}`)
  return row
}

export function findSecondary(week: number, lift: BaseLift) {
  const block = blockForWeek(week)
  const row = SECONDARY.find((r) => r.week === week && r.lift === lift && r.block === block)
  if (!row) throw new Error(`Missing SECONDARY row for ${lift} week ${week}`)
  return row
}

export function findTertiary(week: number, lift: BaseLift) {
  const block = blockForWeek(week)
  const row = TERTIARY.find((r) => r.week === week && r.lift === lift && r.block === block)
  if (!row) throw new Error(`Missing TERTIARY row for ${lift} week ${week}`)
  return row
}