import { supabase } from '@/lib/supabase'

export type Weakness =
  | 'bench_off_chest'
  | 'bench_lockout'
  | 'squat_depth'
  | 'squat_out_of_hole'
  | 'deadlift_off_floor'
  | 'deadlift_lockout'

export type GenerateBeginnerULInput = {
  userId: string
  daysOfWeek: number[] // [1..7], must be length 4 for UL4 v1
  durationWeeks: 8 | 12
  deloadWeek4: boolean
  deloadWeek8: boolean
  testWeek12: boolean
  maxes: { squat: number; bench: number; deadlift: number }
  weaknesses?: Weakness[] // recommend max 2
}

type ExerciseInsert = {
  name: string
  sets: number
  reps: number
  percentage?: number | null
  rpe?: number | null
}

const DAY_LABEL: Record<number, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
}

function uniqSortedDays(days: number[]) {
  const clean = Array.from(new Set(days.map((d) => Number(d)))).filter((d) => Number.isFinite(d))
  clean.sort((a, b) => a - b)
  return clean
}

function assertValidInput(input: GenerateBeginnerULInput) {
  const days = uniqSortedDays(input.daysOfWeek)
  if (days.length !== 4) throw new Error('Beginner UL (v1) requires exactly 4 selected training days.')
  for (const d of days) if (d < 1 || d > 7) throw new Error('Invalid weekday value. Use Monday=1 … Sunday=7.')

  const { squat, bench, deadlift } = input.maxes
  const ok = [squat, bench, deadlift].every((x) => Number.isFinite(x) && x > 0)
  if (!ok) throw new Error('Please provide valid 1RM values for squat, bench, and deadlift.')

  if (input.durationWeeks === 8 && input.testWeek12) throw new Error('Test week 12 is only available for 12-week plans.')
}

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x))
}

function getPhase(week: number, duration: 8 | 12): 'volume' | 'strength' | 'peak' {
  if (duration === 12) {
    if (week <= 4) return 'volume'
    if (week <= 8) return 'strength'
    return 'peak'
  }
  if (week <= 3) return 'volume'
  if (week <= 6) return 'strength'
  return 'peak'
}

function getMainPct(phase: 'volume' | 'strength' | 'peak', week: number, duration: 8 | 12) {
  const ramp = duration === 12 ? (week - 1) / 11 : (week - 1) / 7
  const base = phase === 'volume' ? 0.68 : phase === 'strength' ? 0.78 : 0.86
  const add = 0.06 * ramp
  return clamp(base + add, 0.65, 0.92)
}

function getWeekPrescription(args: {
  week: number
  duration: 8 | 12
  deloadWeek4: boolean
  deloadWeek8: boolean
  testWeek12: boolean
}) {
  const { week, duration, deloadWeek4, deloadWeek8, testWeek12 } = args

  const isDeload = (week === 4 && deloadWeek4) || (week === 8 && deloadWeek8)
  const isTest = duration === 12 && testWeek12 && week === 12

  if (isTest) {
    return {
      kind: 'test' as const,
      singles: [0.9, 0.925], // safe beginner test
    }
  }

  const phase = getPhase(week, duration)
  const main = getMainPct(phase, week, duration)

  const mainSets = phase === 'volume' ? 5 : phase === 'strength' ? 4 : 3
  const mainReps = phase === 'volume' ? 5 : phase === 'strength' ? 3 : 2

  const adjPct = isDeload ? clamp(main - 0.10, 0.55, 0.90) : main
  const adjSets = isDeload ? Math.max(2, mainSets - 2) : mainSets

  return {
    kind: 'train' as const,
    phase,
    isDeload,
    mainSets: adjSets,
    mainReps,
    squat: adjPct,
    bench: clamp(adjPct - 0.02, 0.55, 0.90),
    deadlift: clamp(adjPct + 0.01, 0.55, 0.93),
    squatVar: clamp(adjPct - 0.06, 0.50, 0.85),
    benchVar: clamp(adjPct - 0.05, 0.50, 0.85),
    deadliftVar: clamp(adjPct - 0.07, 0.50, 0.85),
  }
}

function resolveBenchVariation(weaknesses: Weakness[] | undefined) {
  if (weaknesses?.includes('bench_lockout')) return 'Close Grip Bench'
  return 'Spoto Press'
}

function resolveSquatVariation(weaknesses: Weakness[] | undefined) {
  if (weaknesses?.includes('squat_depth') || weaknesses?.includes('squat_out_of_hole')) return 'Paused Squat'
  return 'Tempo Squat'
}

function resolveDeadliftVariation(_weaknesses: Weakness[] | undefined) {
  return 'RDL'
}

export async function generateBeginnerULPlanInDb(input: GenerateBeginnerULInput) {
  assertValidInput(input)

  const days = uniqSortedDays(input.daysOfWeek)
  const weaknesses = (input.weaknesses ?? []).slice(0, 2)

  // deactivate old plans
  await supabase
    .from('plans')
    .update({ is_active: false })
    .eq('user_id', input.userId)
    .eq('is_active', true)

  // create new plan
  const { data: planRow, error: planErr } = await supabase
    .from('plans')
    .insert({
      user_id: input.userId,
      name: `Beginner UL (Custom)`,
      duration_weeks: input.durationWeeks,
      is_active: true,
    })
    .select('id')
    .single()

  if (planErr) throw new Error(planErr.message)
  const planId = planRow.id as string

  // save generation snapshot
  const { error: snapErr } = await supabase.from('plan_generation_inputs').insert({
    plan_id: planId,
    days_of_week: days,
    duration_weeks: input.durationWeeks,
    deload_week4: input.deloadWeek4,
    deload_week8: input.deloadWeek8,
    test_week12: input.testWeek12 && input.durationWeeks === 12,
    maxes: input.maxes,
    weaknesses,
  })
  if (snapErr) throw new Error(snapErr.message)

  // preload exercises lookup
  const { data: exRows, error: exErr } = await supabase.from('exercises').select('id,name')
  if (exErr) throw new Error(exErr.message)

  const exMap = new Map<string, string>()
  exRows?.forEach((r) => exMap.set(r.name, r.id))

  const getExId = (name: string) => {
    const id = exMap.get(name)
    if (!id) throw new Error(`Exercise not found in DB: ${name} (seed exercises first)`)
    return id
  }

  const benchVar = resolveBenchVariation(weaknesses)
  const squatVar = resolveSquatVariation(weaknesses)
  const deadliftVar = resolveDeadliftVariation(weaknesses)

  const buildDay = (
  dayIndex: number,
  weekday: number,
  presc: ReturnType<typeof getWeekPrescription>
): { title: string; exercises: ExerciseInsert[] } => {
    const wd = DAY_LABEL[weekday] ?? `Day${weekday}`

    const isUpperA = dayIndex === 1
    const isLowerA = dayIndex === 2
    const isUpperB = dayIndex === 3
    const isLowerB = dayIndex === 4

    if (presc.kind === 'test') {
      if (isUpperA || isUpperB) {
        const singles = presc.singles.map((p) => ({ name: 'Bench Press', sets: 1, reps: 1, percentage: p }))
        return {
          title: `${isUpperA ? 'Upper A' : 'Upper B'} (${wd}) • Test`,
          exercises: [
            ...singles,
            { name: 'Lat Pulldown', sets: 3, reps: 10, rpe: 8 },
            { name: 'Triceps Pushdown', sets: 2, reps: 12, rpe: 8 },
          ],
        }
      }
      if (isLowerA) {
        const singles = presc.singles.map((p) => ({ name: 'Squat', sets: 1, reps: 1, percentage: p }))
        return {
          title: `Lower A (${wd}) • Test`,
          exercises: [
            ...singles,
            { name: 'Leg Press', sets: 2, reps: 10, rpe: 8 },
            { name: 'Hamstring Curl', sets: 2, reps: 12, rpe: 8 },
          ],
        }
      }
      const singles = presc.singles.map((p) => ({ name: 'Deadlift', sets: 1, reps: 1, percentage: p }))
      return {
        title: `Lower B (${wd}) • Test`,
        exercises: [
          ...singles,
          { name: 'RDL', sets: 2, reps: 6, percentage: 0.6 },
          { name: 'DB Row', sets: 3, reps: 10, rpe: 8 },
        ],
      }
    }

    const base = {
      squat: presc.squat,
      bench: presc.bench,
      deadlift: presc.deadlift,
      squatVar: presc.squatVar,
      benchVar: presc.benchVar,
      deadliftVar: presc.deadliftVar,
    }

    if (isUpperA) {
      return {
        title: `Upper A (${wd})${presc.isDeload ? ' • Deload' : ''}`,
        exercises: [
          { name: 'Bench Press', sets: presc.mainSets, reps: presc.mainReps, percentage: base.bench },
          { name: 'Spoto Press', sets: 3, reps: 6, percentage: base.benchVar },
          { name: 'Lat Pulldown', sets: 4, reps: 10, rpe: 8 },
          { name: 'Triceps Pushdown', sets: 3, reps: 12, rpe: 8 },
        ],
      }
    }

    if (isLowerA) {
      return {
        title: `Lower A (${wd})${presc.isDeload ? ' • Deload' : ''}`,
        exercises: [
          { name: 'Squat', sets: presc.mainSets, reps: presc.mainReps, percentage: base.squat },
          { name: squatVar, sets: 3, reps: 5, percentage: base.squatVar },
          { name: 'Leg Press', sets: 3, reps: 10, rpe: 8 },
          { name: 'Hamstring Curl', sets: 3, reps: 12, rpe: 8 },
        ],
      }
    }

    if (isUpperB) {
      return {
        title: `Upper B (${wd})${presc.isDeload ? ' • Deload' : ''}`,
        exercises: [
          { name: benchVar, sets: 4, reps: 6, percentage: base.benchVar },
          { name: 'DB Row', sets: 4, reps: 10, rpe: 8 },
          { name: 'Lateral Raise', sets: 3, reps: 15, rpe: 8 },
          { name: 'Triceps Pushdown', sets: 2, reps: 12, rpe: 8 },
        ],
      }
    }

    return {
      title: `Lower B (${wd})${presc.isDeload ? ' • Deload' : ''}`,
      exercises: [
        { name: 'Deadlift', sets: Math.max(2, presc.mainSets - 1), reps: presc.mainReps, percentage: base.deadlift },
        { name: deadliftVar, sets: 3, reps: 6, percentage: base.deadliftVar },
        { name: 'Tempo Squat', sets: 3, reps: 5, percentage: base.squatVar },
        { name: 'Hamstring Curl', sets: 3, reps: 12, rpe: 8 },
      ],
    }
  }

  for (let week = 1; week <= input.durationWeeks; week++) {
    const presc = getWeekPrescription({
      week,
      duration: input.durationWeeks,
      deloadWeek4: input.deloadWeek4,
      deloadWeek8: input.deloadWeek8,
      testWeek12: input.testWeek12,
    })

    const { data: weekRow, error: wErr } = await supabase
      .from('plan_weeks')
      .insert({ plan_id: planId, week_number: week })
      .select('id')
      .single()
    if (wErr) throw new Error(wErr.message)
    const weekId = weekRow.id as string

    for (let i = 0; i < 4; i++) {
      const dayIndex = i + 1
      const weekday = days[i]
      const day = buildDay(dayIndex, weekday, presc)

      const { data: woRow, error: woErr } = await supabase
        .from('workouts')
        .insert({
          week_id: weekId,
          day_number: dayIndex,
          name: day.title,
        })
        .select('id')
        .single()
      if (woErr) throw new Error(woErr.message)

      const workoutId = woRow.id as string

      const payload = day.exercises.map((e) => ({
        workout_id: workoutId,
        exercise_id: getExId(e.name),
        target_sets: e.sets,
        target_reps: e.reps,
        target_percentage: ('percentage' in e ? e.percentage : null) ?? null,
        target_rpe: ('rpe' in e ? e.rpe : null) ?? null,
      }))

      const { error: weErr } = await supabase.from('workout_exercises').insert(payload)
      if (weErr) throw new Error(weErr.message)
    }
  }

  return planId
}