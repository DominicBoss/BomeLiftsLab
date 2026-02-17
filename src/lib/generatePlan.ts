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
  type SlotType,
  secondaryVariation,
  tertiaryVariation,
  type BaseLift,
  type Proficiency,
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

function fatigueForExercise(args: { exerciseName: string; sets: number; reps: number; rpe: number }) {
  const meta = VARIATION_META[args.exerciseName]
  const base = meta?.fatigueScore ?? 1
  // simple heuristic: only to avoid obviously overloaded days
  return base * ((args.sets * args.reps) / 10) * (args.rpe / 10)
}

function addTotals(t: FatigueTotals, inc: FatigueTotals): FatigueTotals {
  return { lower: t.lower + inc.lower, upper: t.upper + inc.upper, overall: t.overall + inc.overall }
}

function withinCaps(t: FatigueTotals, caps: { lowerDailyMax: number; upperDailyMax: number; overallDailyMax: number }) {
  return t.lower <= caps.lowerDailyMax && t.upper <= caps.upperDailyMax && t.overall <= caps.overallDailyMax
}

function liftRegion(lift: BaseLift): 'Lower' | 'Upper' {
  return lift === 'bench' ? 'Upper' : 'Lower'
}

function fatigueIncrementForSlot(
  week: number,
  block: ReturnType<typeof blockForWeek>,
  slot: SlotType,
  lift: BaseLift
): { exName: string; sets: number; reps: number; rpe: number; inc: FatigueTotals } {
  if (slot === 'primary') {
    const p = findPrimary(week, lift)
    const exName = competitionName(lift)

    const top = fatigueForExercise({ exerciseName: exName, sets: p.top.sets, reps: p.top.reps, rpe: p.top.rpe })
    const back = p.backoff
      ? fatigueForExercise({ exerciseName: exName, sets: p.backoff.sets, reps: p.backoff.reps, rpe: p.backoff.rpe })
      : 0

    const total = top + back
    const region = liftRegion(lift)
    const inc: FatigueTotals = {
      lower: region === 'Lower' ? total : 0,
      upper: region === 'Upper' ? total : 0,
      overall: total,
    }
    return { exName, sets: p.top.sets, reps: p.top.reps, rpe: p.top.rpe, inc }
  }

  if (slot === 'secondary') {
    const s = findSecondary(week, lift)
    const exName = secondaryVariation(block, lift)
    const total = s.sets > 0 ? fatigueForExercise({ exerciseName: exName, sets: s.sets, reps: s.reps, rpe: s.rpe }) : 0
    const region = liftRegion(lift)
    const inc: FatigueTotals = {
      lower: region === 'Lower' ? total : 0,
      upper: region === 'Upper' ? total : 0,
      overall: total,
    }
    return { exName, sets: s.sets, reps: s.reps, rpe: s.rpe, inc }
  }

  // tertiary
  const t = findTertiary(week, lift)
  const exName = tertiaryVariation(lift)
  const total = t.sets > 0 ? fatigueForExercise({ exerciseName: exName, sets: t.sets, reps: t.reps, rpe: t.rpe }) : 0
  const region = liftRegion(lift)
  const inc: FatigueTotals = {
    lower: region === 'Lower' ? total : 0,
    upper: region === 'Upper' ? total : 0,
    overall: total,
  }
  return { exName, sets: t.sets, reps: t.reps, rpe: t.rpe, inc }
}

function buildWeekSchedule(args: { days: 3 | 4 | 5 | 6; proficiency: Proficiency; week: number }): SlotItem[][] {
  const { days, proficiency, week } = args
  const block = blockForWeek(week)
  const targets = getSlotTargets(days, proficiency)
  const caps = PROFICIENCY_CAPS[proficiency]

  const perDay: SlotItem[][] = Array.from({ length: days }, () => [])
  const dayFat: FatigueTotals[] = Array.from({ length: days }, () => ({ lower: 0, upper: 0, overall: 0 }))
  const weekFat: FatigueTotals = { lower: 0, upper: 0, overall: 0 }

  const maxSlotsPerDay = 2

  const place = (item: SlotItem) => {
    const candidates = [...Array(days).keys()]
      .filter((i) => perDay[i].length < maxSlotsPerDay)
      .sort((a, b) => perDay[a].length - perDay[b].length)

    const { inc } = fatigueIncrementForSlot(week, block, item.slot, item.lift)

    const tryOrder = (xs: number[]) => {
      for (const i of xs) {
        const hasSameLift = perDay[i].some((x) => x.lift === item.lift)
        if (hasSameLift && days >= 4) continue

        const newDay = addTotals(dayFat[i], inc)
        const newWeek = addTotals(weekFat, inc)

        const dailyOk = withinCaps(newDay, caps)
        const weeklyOk =
          newWeek.lower <= caps.lowerWeeklyMax && newWeek.upper <= caps.upperWeeklyMax && newWeek.overall <= caps.overallWeeklyMax

        if (dailyOk && weeklyOk) {
          perDay[i].push(item)
          dayFat[i] = newDay
          weekFat.lower = newWeek.lower
          weekFat.upper = newWeek.upper
          weekFat.overall = newWeek.overall
          return true
        }
      }
      return false
    }

    if (tryOrder(candidates)) return

    // Fallback: deterministic least-bad
    let bestIdx = candidates[0] ?? 0
    let bestScore = Number.POSITIVE_INFINITY
    for (const i of candidates) {
      const newDay = addTotals(dayFat[i], inc)
      const overload =
        Math.max(0, newDay.lower - caps.lowerDailyMax) +
        Math.max(0, newDay.upper - caps.upperDailyMax) +
        Math.max(0, newDay.overall - caps.overallDailyMax)
      const hasSameLift = perDay[i].some((x) => x.lift === item.lift) ? 0.5 : 0
      const score = overload + hasSameLift + perDay[i].length * 0.1
      if (score < bestScore) {
        bestScore = score
        bestIdx = i
      }
    }

    perDay[bestIdx].push(item)
    dayFat[bestIdx] = addTotals(dayFat[bestIdx], inc)
    weekFat.lower += inc.lower
    weekFat.upper += inc.upper
    weekFat.overall += inc.overall
  }

  // Primaries first
  ;(['squat', 'bench', 'deadlift'] as BaseLift[]).forEach((lift) => {
    const count = targets[lift].primary
    for (let i = 0; i < count; i++) place({ slot: 'primary', lift })
  })

  // Secondaries
  ;(['bench', 'squat', 'deadlift'] as BaseLift[]).forEach((lift) => {
    const count = targets[lift].secondary
    for (let i = 0; i < count; i++) place({ slot: 'secondary', lift })
  })

  // Tertiaries (skip peak)
  if (block !== 'Peak') {
    ;(['bench', 'squat', 'deadlift'] as BaseLift[]).forEach((lift) => {
      const count = targets[lift].tertiary
      for (let i = 0; i < count; i++) place({ slot: 'tertiary', lift })
    })
  }

  // Sort within day
  const order: Record<SlotType, number> = { primary: 0, secondary: 1, tertiary: 2 }
  for (const d of perDay) d.sort((a, b) => order[a.slot] - order[b.slot])

  return perDay
}

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

// ---- READ-ONLY exercises lookup (NO inserts; avoids RLS issues) ----
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

  // Read-only check: fails fast if you forgot to seed exercises table
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

  // store generation metadata (keep DB as weekday numbers 1..7)
  await supabase.from('plan_generation_inputs').insert({
    plan_id: planId,
    days_of_week: daysOfWeek.map(dayNameToNumber),
    duration_weeks: 10,
    deload_week4: false,
    deload_week8: false,
    test_week12: false,
    maxes: { squat: oneRMs.squat, bench: oneRMs.bench, deadlift: oneRMs.deadlift },
    weaknesses: [`proficiency:${proficiency}`, `frequencyDays:${daysOfWeek.length}`, 'generator:static10w:v2'],
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
          await insertExerciseRow({ workoutId, exerciseName: exName, baseLift: lift, sets: s.sets, reps: s.reps, rpe: s.rpe })
        }

        if (slot === 'tertiary') {
          const t = findTertiary(week, lift)
          if (t.sets <= 0) continue
          if (block === 'Peak') continue
          const exName = tertiaryVariation(lift)
          await insertExerciseRow({ workoutId, exerciseName: exName, baseLift: lift, sets: t.sets, reps: t.reps, rpe: t.rpe })
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