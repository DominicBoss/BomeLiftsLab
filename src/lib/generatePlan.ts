import { supabase } from '@/lib/supabase'
import { roundTo2_5 } from '@/lib/rounding'
import type { DayName, PlanKey } from './planTemplates'
import {
  blockForWeek,
  competitionName,
  findPrimary,
  findSecondary,
  findTertiary,
  getSlotTargets,
  PROFICIENCY_CAPS,
  secondaryVariation,
  tertiaryVariation,
  type BaseLift,
  type Proficiency,
  type SlotType,
  VARIATION_META,
} from './staticPlanTables'

type Inputs = {
  userId: string
  plan: PlanKey // only 'PerformanceBased'
  daysOfWeek: DayName[] // 3..6
  deloadAfterWeek8: boolean
  deloadAfterWeek10: boolean
  oneRMs: { squat: number; bench: number; deadlift: number }
  proficiency?: Proficiency // default Beginner
}

const DAY_TO_NUM: Record<DayName, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
function dayNameToNumber(d: DayName) {
  return DAY_TO_NUM[d]
}

type SlotItem = { slot: SlotType; lift: BaseLift }
type FatigueTotals = { lower: number; upper: number; overall: number }

function addTotals(t: FatigueTotals, inc: FatigueTotals): FatigueTotals {
  return { lower: t.lower + inc.lower, upper: t.upper + inc.upper, overall: t.overall + inc.overall }
}

function withinCaps(t: FatigueTotals, caps: { lowerDailyMax: number; upperDailyMax: number; overallDailyMax: number }) {
  return t.lower <= caps.lowerDailyMax && t.upper <= caps.upperDailyMax && t.overall <= caps.overallDailyMax
}

function liftRegion(lift: BaseLift): 'Lower' | 'Upper' {
  return lift === 'bench' ? 'Upper' : 'Lower'
}

// --- very simple fatigue heuristic: only to prevent obviously overloaded days ---
function fatigueForExercise(args: { exerciseName: string; sets: number; reps: number; rpe: number }) {
  const meta = VARIATION_META[args.exerciseName]
  const base = meta?.fatigueScore ?? 1
  return base * ((args.sets * args.reps) / 10) * (args.rpe / 10)
}

// ---------------- Engine helpers (deterministic, block-aware) ----------------

function maxSlotsPerDay(days: 3 | 4 | 5 | 6) {
  if (days === 3) return 3
  if (days === 4) return 3
  return 2
}

function blockMultiplier(block: ReturnType<typeof blockForWeek>) {
  if (block === 'Volume') return 1.0
  if (block === 'Strength') return 1.15
  return 1.25 // Peak
}

function slotMultiplier(slot: SlotType) {
  if (slot === 'primary') return 1.2
  if (slot === 'secondary') return 1.0
  return 0.8
}

function estimateSlotFatigue(week: number, slot: SlotType, lift: BaseLift) {
  const block = blockForWeek(week)
  const mul = blockMultiplier(block) * slotMultiplier(slot)

  if (slot === 'primary') {
    const p = findPrimary(week, lift)
    const exName = competitionName(lift)
    const top = fatigueForExercise({ exerciseName: exName, sets: p.top.sets, reps: p.top.reps, rpe: p.top.rpe })
    const back = p.backoff
      ? fatigueForExercise({ exerciseName: exName, sets: p.backoff.sets, reps: p.backoff.reps, rpe: p.backoff.rpe })
      : 0
    return (top + back) * mul
  }

  if (slot === 'secondary') {
    const s = findSecondary(week, lift)
    if (s.sets <= 0) return 0
    const exName = secondaryVariation(block, lift)
    return fatigueForExercise({ exerciseName: exName, sets: s.sets, reps: s.reps, rpe: s.rpe }) * mul
  }

  const t = findTertiary(week, lift)
  if (t.sets <= 0) return 0
  const exName = tertiaryVariation(lift)
  return fatigueForExercise({ exerciseName: exName, sets: t.sets, reps: t.reps, rpe: t.rpe }) * mul
}

function violatesHardRules(args: {
  block: ReturnType<typeof blockForWeek>
  days: 3 | 4 | 5 | 6
  daySlots: SlotItem[]
  candidate: SlotItem
}) {
  const { block, days, daySlots, candidate } = args

  const has = (lift: BaseLift, slot?: SlotType) =>
    daySlots.some((x) => x.lift === lift && (slot ? x.slot === slot : true))

  // Never: SQ primary + DL primary same day
  if (candidate.slot === 'primary') {
    if (candidate.lift === 'squat' && has('deadlift', 'primary')) return true
    if (candidate.lift === 'deadlift' && has('squat', 'primary')) return true
  } else {
    // In Strength/Peak: keep DL secondary/tertiary away from SQ primary
    if ((block === 'Strength' || block === 'Peak') && has('squat', 'primary') && candidate.lift === 'deadlift') {
      if (candidate.slot === 'secondary') return true
      if (candidate.slot === 'tertiary') return true
    }
    // In Strength/Peak: avoid SQ secondary on DL primary day
    if ((block === 'Strength' || block === 'Peak') && has('deadlift', 'primary') && candidate.lift === 'squat') {
      if (candidate.slot === 'secondary') return true
    }
  }

  // Same-lift stacking:
  // For 4+ days: avoid repeating same lift on same day (bench is the only partial exception)
  if (days >= 4) {
    const sameLift = daySlots.some((x) => x.lift === candidate.lift)
    if (sameLift) {
      if (candidate.lift !== 'bench') return true
      if (candidate.slot === 'primary') return true
    }
  }

  return false
}

function buildWeekSchedule(args: { days: 3 | 4 | 5 | 6; proficiency: Proficiency; week: number }): SlotItem[][] {
  const { days, proficiency, week } = args
  const block = blockForWeek(week)
  const targets = getSlotTargets(days, proficiency)
  const caps = PROFICIENCY_CAPS[proficiency]
  const capPerDay = maxSlotsPerDay(days)

  const perDay: SlotItem[][] = Array.from({ length: days }, () => [])
  const dayFat: FatigueTotals[] = Array.from({ length: days }, () => ({ lower: 0, upper: 0, overall: 0 }))
  const weekFat: FatigueTotals = { lower: 0, upper: 0, overall: 0 }

  const addFat = (idx: number, lift: BaseLift, amount: number) => {
    const region = liftRegion(lift)
    const inc: FatigueTotals = {
      lower: region === 'Lower' ? amount : 0,
      upper: region === 'Upper' ? amount : 0,
      overall: amount,
    }
    dayFat[idx] = addTotals(dayFat[idx], inc)
    weekFat.lower += inc.lower
    weekFat.upper += inc.upper
    weekFat.overall += inc.overall
  }

  // Score placement. Lower = better. INF = forbidden.
  const scorePlacement = (dayIdx: number, item: SlotItem) => {
    if (perDay[dayIdx].length >= capPerDay) return Number.POSITIVE_INFINITY
    if (violatesHardRules({ block, days, daySlots: perDay[dayIdx], candidate: item })) return Number.POSITIVE_INFINITY

    const slotFat = estimateSlotFatigue(week, item.slot, item.lift)
    const region = liftRegion(item.lift)

    const newDay = addTotals(dayFat[dayIdx], {
      lower: region === 'Lower' ? slotFat : 0,
      upper: region === 'Upper' ? slotFat : 0,
      overall: slotFat,
    })

    // Daily caps = hard
    const dailyOver =
      Math.max(0, newDay.lower - caps.lowerDailyMax) +
      Math.max(0, newDay.upper - caps.upperDailyMax) +
      Math.max(0, newDay.overall - caps.overallDailyMax)

    if (dailyOver > 0) return Number.POSITIVE_INFINITY

    // Weekly caps = soft penalties
    const newWeek = addTotals(weekFat, {
      lower: region === 'Lower' ? slotFat : 0,
      upper: region === 'Upper' ? slotFat : 0,
      overall: slotFat,
    })

    const weeklyOver =
      Math.max(0, newWeek.lower - caps.lowerWeeklyMax) +
      Math.max(0, newWeek.upper - caps.upperWeeklyMax) +
      Math.max(0, newWeek.overall - caps.overallWeeklyMax)

    // Balance preference: avoid stuffing already-heavy days
    const balancePenalty = dayFat[dayIdx].overall * 0.15 + perDay[dayIdx].length * 0.25

    // Soft: keep squat and deadlift apart in Strength/Peak
    let interactionPenalty = 0
    if (block !== 'Volume') {
      const hasSQ = perDay[dayIdx].some((x) => x.lift === 'squat')
      const hasDL = perDay[dayIdx].some((x) => x.lift === 'deadlift')
      if ((item.lift === 'deadlift' && hasSQ) || (item.lift === 'squat' && hasDL)) interactionPenalty += 0.75
    }

    // Deterministic tiny bias: put primaries earlier
    const orderingPenalty = item.slot === 'primary' ? dayIdx * 0.05 : 0

    return weeklyOver * 2.0 + balancePenalty + interactionPenalty + orderingPenalty
  }

  const placeOne = (item: SlotItem) => {
    let bestIdx = 0
    let bestScore = Number.POSITIVE_INFINITY

    for (let i = 0; i < days; i++) {
      const s = scorePlacement(i, item)
      if (s < bestScore) {
        bestScore = s
        bestIdx = i
      }
    }

    // Emergency fallback for 3-day: relax same-lift stacking (but still forbid SQP+DLP)
    if (!Number.isFinite(bestScore) && days === 3) {
      for (let i = 0; i < days; i++) {
        if (perDay[i].length >= capPerDay) continue

        const primaries = perDay[i].filter((x) => x.slot === 'primary').map((x) => x.lift)
        if (item.slot === 'primary' && item.lift === 'squat' && primaries.includes('deadlift')) continue
        if (item.slot === 'primary' && item.lift === 'deadlift' && primaries.includes('squat')) continue

        const slotFat = estimateSlotFatigue(week, item.slot, item.lift)
        const region = liftRegion(item.lift)
        const newDay = addTotals(dayFat[i], {
          lower: region === 'Lower' ? slotFat : 0,
          upper: region === 'Upper' ? slotFat : 0,
          overall: slotFat,
        })

        const dailyOver =
          Math.max(0, newDay.lower - caps.lowerDailyMax) +
          Math.max(0, newDay.upper - caps.upperDailyMax) +
          Math.max(0, newDay.overall - caps.overallDailyMax)

        if (dailyOver > 0) continue

        perDay[i].push(item)
        addFat(i, item.lift, slotFat)
        return
      }
    }

    // Normal place (assumes at least one valid day exists)
    const slotFat = estimateSlotFatigue(week, item.slot, item.lift)
    perDay[bestIdx].push(item)
    addFat(bestIdx, item.lift, slotFat)
  }

  // Build required slots list (deterministic, block-aware)
  const required: SlotItem[] = []

  const primaryOrder: BaseLift[] =
    block === 'Volume' ? (['bench', 'squat', 'deadlift'] as BaseLift[]) : (['squat', 'bench', 'deadlift'] as BaseLift[])

  for (const lift of primaryOrder) {
    for (let i = 0; i < targets[lift].primary; i++) required.push({ slot: 'primary', lift })
  }

  const secondaryOrder: BaseLift[] = ['bench', 'squat', 'deadlift']
  for (const lift of secondaryOrder) {
    for (let i = 0; i < targets[lift].secondary; i++) required.push({ slot: 'secondary', lift })
  }

  if (block !== 'Peak') {
    const tertiaryOrder: BaseLift[] = ['bench', 'squat', 'deadlift']
    for (const lift of tertiaryOrder) {
      for (let i = 0; i < targets[lift].tertiary; i++) required.push({ slot: 'tertiary', lift })
    }
  }

  // Place all slots
  for (const item of required) placeOne(item)

  // Sort inside day: primary -> secondary -> tertiary
  const order: Record<SlotType, number> = { primary: 0, secondary: 1, tertiary: 2 }
  for (const d of perDay) d.sort((a, b) => order[a.slot] - order[b.slot])

  return perDay
}

// ---------------- Planned weight ----------------

function kFactor(lift: BaseLift) {
  if (lift === 'squat') return 30
  if (lift === 'bench') return 31
  return 28
}

function rirFromRpe(rpe: number) {
  return 10 - rpe
}

function plannedWeightFrom1RM(oneRm: number, reps: number, rpe: number, lift: BaseLift) {
  const k = kFactor(lift)
  const rir = rirFromRpe(rpe)
  const denom = 1 + (reps + rir) / k
  return roundTo2_5(oneRm / denom)
}

// ---------------- DB helpers (READ-ONLY exercises) ----------------

async function getMainLiftExerciseIds() {
  const { data, error } = await supabase
    .from('exercises')
    .select('id, base_lift, is_main_lift')
    .eq('is_main_lift', true)
    .in('base_lift', ['squat', 'bench', 'deadlift'])

  if (error) throw new Error(error.message)

  const map = new Map<BaseLift, string>()
  for (const row of data ?? []) {
    const b = row.base_lift as BaseLift
    if (!map.has(b)) map.set(b, row.id)
  }

  if (!map.get('squat') || !map.get('bench') || !map.get('deadlift')) {
    throw new Error('Missing main lift exercises in DB. Ensure exercises has is_main_lift=true for squat/bench/deadlift.')
  }

  return map
}

async function getExerciseIdOrThrow(name: string, base_lift: BaseLift) {
  const { data, error } = await supabase
    .from('exercises')
    .select('id')
    .eq('name', name)
    .eq('base_lift', base_lift)
    .limit(1)

  if (error) throw new Error(error.message)
  const id = data?.[0]?.id as string | undefined
  if (!id) throw new Error(`Missing exercise in DB: "${name}" (${base_lift}). Seed exercises table.`)
  return id
}

async function ensureStaticExercisesExist() {
  const required: Array<{ name: string; base_lift: BaseLift }> = [
    { name: 'Competition Squat', base_lift: 'squat' },
    { name: 'Competition Bench', base_lift: 'bench' },
    { name: 'Competition Deadlift', base_lift: 'deadlift' },

    { name: 'Paused Squat', base_lift: 'squat' },
    { name: 'Pin Squat (Mid)', base_lift: 'squat' },
    { name: 'Tempo Squat', base_lift: 'squat' },

    { name: 'Paused Bench', base_lift: 'bench' },
    { name: 'Pin Press', base_lift: 'bench' },
    { name: 'Tempo Bench', base_lift: 'bench' },

    { name: 'RDL', base_lift: 'deadlift' },
    { name: 'Paused Deadlift', base_lift: 'deadlift' },
    { name: 'Hip Thrust', base_lift: 'deadlift' },
  ]

  const { data, error } = await supabase.from('exercises').select('name, base_lift')
  if (error) throw new Error(error.message)

  const have = new Set((data ?? []).map((r: any) => `${r.name}::${r.base_lift}`))
  const missing = required.filter((r) => !have.has(`${r.name}::${r.base_lift}`))
  if (missing.length) {
    throw new Error(`Missing exercises in DB: ${missing.map((m) => `${m.name} (${m.base_lift})`).join(', ')}`)
  }
}

// ---------------- Main entry ----------------

export async function generatePlanInDb({
  userId,
  plan,
  daysOfWeek,
  deloadAfterWeek8,
  deloadAfterWeek10,
  oneRMs,
  proficiency = 'Beginner',
}: Inputs) {
  if (plan !== 'PerformanceBased') throw new Error('Invalid plan')
  if (!Array.isArray(daysOfWeek) || daysOfWeek.length < 3 || daysOfWeek.length > 6)
    throw new Error('Select between 3 and 6 training days.')
  if (proficiency !== 'Beginner' && proficiency !== 'Advanced') throw new Error('Invalid proficiency')

  // Read-only check to avoid RLS issues
  await ensureStaticExercisesExist()

  // deactivate old plans
  await supabase
    .from('plans')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('is_active', true)

  const deloadCount = (deloadAfterWeek8 ? 1 : 0) + (deloadAfterWeek10 ? 1 : 0)
  const durationWeeks = 10 + deloadCount

  const { data: planRow, error: planErr } = await supabase
    .from('plans')
    .insert({
      user_id: userId,
      name: plan,
      duration_weeks: durationWeeks,
      is_active: true,
    })
    .select('id')
    .single()

  if (planErr) throw new Error(planErr.message)
  const planId = planRow.id as string

  // store generation metadata (keep DB weekday numbers 1..7)
  await supabase.from('plan_generation_inputs').insert({
    plan_id: planId,
    days_of_week: daysOfWeek.map(dayNameToNumber),
    duration_weeks: 10,
    deload_week4: false,
    deload_week8: false,
    test_week12: false,
    maxes: { squat: oneRMs.squat, bench: oneRMs.bench, deadlift: oneRMs.deadlift },
    weaknesses: [`proficiency:${proficiency}`, `frequencyDays:${daysOfWeek.length}`, 'generator:static10w:v3'],
  })

  const exIds = await getMainLiftExerciseIds()

  let sequence = 1
  const insertWeek = async (week_number: number, is_deload: boolean) => {
    const { data: weekRow, error: wErr } = await supabase
      .from('plan_weeks')
      .insert({
        plan_id: planId,
        week_number,
        sequence_number: sequence,
        is_deload,
      })
      .select('id')
      .single()

    if (wErr) throw new Error(wErr.message)
    sequence++
    return weekRow.id as string
  }

  const insertDay = async (weekId: string, dayIndex: number, dayName: DayName) => {
    const { data: woRow, error: woErr } = await supabase
      .from('workouts')
      .insert({
        week_id: weekId,
        day_number: dayIndex,
        name: `Tag ${dayIndex} (${dayName})`,
      })
      .select('id')
      .single()

    if (woErr) throw new Error(woErr.message)
    return woRow.id as string
  }

  const insertExerciseRow = async (args: {
    workoutId: string
    exerciseName: string
    baseLift: BaseLift
    sets: number
    reps: number
    rpe: number
    forceExerciseId?: string
  }) => {
    if (args.sets <= 0 || args.reps <= 0 || args.rpe <= 0) return

    const exId =
      args.forceExerciseId ??
      (args.exerciseName === competitionName(args.baseLift)
        ? exIds.get(args.baseLift)!
        : await getExerciseIdOrThrow(args.exerciseName, args.baseLift))

    const oneRm =
      args.baseLift === 'squat' ? oneRMs.squat : args.baseLift === 'bench' ? oneRMs.bench : oneRMs.deadlift

    const planned = plannedWeightFrom1RM(oneRm, args.reps, args.rpe, args.baseLift)

    const { error } = await supabase.from('workout_exercises').insert({
      workout_id: args.workoutId,
      exercise_id: exId,
      target_sets: args.sets,
      target_reps: args.reps,
      target_percentage: null,
      target_rpe: args.rpe,
      planned_weight: planned,
    })

    if (error) throw new Error(error.message)
  }

  const dayCount = daysOfWeek.length as 3 | 4 | 5 | 6

  for (let week = 1; week <= 10; week++) {
    const weekId = await insertWeek(week, false)
    const block = blockForWeek(week)
    const weekSchedule = buildWeekSchedule({ days: dayCount, proficiency, week })

    for (let dayIndex = 1; dayIndex <= dayCount; dayIndex++) {
      const dayName = daysOfWeek[dayIndex - 1]
      const workoutId = await insertDay(weekId, dayIndex, dayName)

      for (const item of weekSchedule[dayIndex - 1]) {
        const lift = item.lift
        const slot = item.slot

        if (slot === 'primary') {
          const p = findPrimary(week, lift)
          const exName = competitionName(lift)

          await insertExerciseRow({
            workoutId,
            exerciseName: exName,
            baseLift: lift,
            sets: p.top.sets,
            reps: p.top.reps,
            rpe: p.top.rpe,
            forceExerciseId: exIds.get(lift)!,
          })

          if (p.backoff) {
            await insertExerciseRow({
              workoutId,
              exerciseName: exName,
              baseLift: lift,
              sets: p.backoff.sets,
              reps: p.backoff.reps,
              rpe: p.backoff.rpe,
              forceExerciseId: exIds.get(lift)!,
            })
          }
        }

        if (slot === 'secondary') {
          const s = findSecondary(week, lift)
          if (s.sets <= 0) continue
          if (block === 'Peak' && lift === 'deadlift') continue // keep peak deadlift clean

          const exName = secondaryVariation(block, lift)
          await insertExerciseRow({
            workoutId,
            exerciseName: exName,
            baseLift: lift,
            sets: s.sets,
            reps: s.reps,
            rpe: s.rpe,
          })
        }

        if (slot === 'tertiary') {
          const t = findTertiary(week, lift)
          if (t.sets <= 0) continue
          if (block === 'Peak') continue

          const exName = tertiaryVariation(lift)
          await insertExerciseRow({
            workoutId,
            exerciseName: exName,
            baseLift: lift,
            sets: t.sets,
            reps: t.reps,
            rpe: t.rpe,
          })
        }
      }
    }

    const insertDeloadWeek = async (labelWeek: number) => {
      const deloadWeekId = await insertWeek(labelWeek, true)

      for (let dayIndex = 1; dayIndex <= dayCount; dayIndex++) {
        const dayName = daysOfWeek[dayIndex - 1]
        const workoutId = await insertDay(deloadWeekId, dayIndex, dayName)

        const mod = (dayIndex - 1) % 3
        if (mod === 0) {
          await insertExerciseRow({
            workoutId,
            exerciseName: competitionName('squat'),
            baseLift: 'squat',
            sets: 3,
            reps: 3,
            rpe: 6,
            forceExerciseId: exIds.get('squat')!,
          })
          await insertExerciseRow({
            workoutId,
            exerciseName: competitionName('bench'),
            baseLift: 'bench',
            sets: 3,
            reps: 4,
            rpe: 6,
            forceExerciseId: exIds.get('bench')!,
          })
        } else if (mod === 1) {
          await insertExerciseRow({
            workoutId,
            exerciseName: competitionName('bench'),
            baseLift: 'bench',
            sets: 3,
            reps: 3,
            rpe: 6,
            forceExerciseId: exIds.get('bench')!,
          })
          await insertExerciseRow({
            workoutId,
            exerciseName: competitionName('deadlift'),
            baseLift: 'deadlift',
            sets: 2,
            reps: 3,
            rpe: 6,
            forceExerciseId: exIds.get('deadlift')!,
          })
        } else {
          await insertExerciseRow({
            workoutId,
            exerciseName: competitionName('squat'),
            baseLift: 'squat',
            sets: 2,
            reps: 3,
            rpe: 6,
            forceExerciseId: exIds.get('squat')!,
          })
          await insertExerciseRow({
            workoutId,
            exerciseName: competitionName('bench'),
            baseLift: 'bench',
            sets: 2,
            reps: 3,
            rpe: 6,
            forceExerciseId: exIds.get('bench')!,
          })
        }
      }
    }

    if (week === 8 && deloadAfterWeek8) await insertDeloadWeek(8)
    if (week === 10 && deloadAfterWeek10) await insertDeloadWeek(10)
  }

  return planId
}