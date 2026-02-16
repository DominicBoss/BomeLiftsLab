export const dynamic = 'force-dynamic'

import { createClient } from '@/utils/supabase/server'
import DashboardCharts from './dashboard-charts'

type BaseLift = 'squat' | 'bench' | 'deadlift'
type LiftSeries = Record<BaseLift, number | null>

type PlanWeekRow = {
  id: string
  week_number: number
  sequence_number: number
  is_deload: boolean
}

type WeekWorkout = {
  id: string
  day_number: number
  name: string | null
  workout_exercises: {
    id: string
    target_sets: number
    exercises: {
      name: string
      is_main_lift: boolean
      base_lift: string
      tracking_mode: string
    } | null
  }[]
}

function safeNum(x: any) {
  const n = Number(x)
  return Number.isFinite(n) ? n : 0
}

function currentWeekNumber(startDateStr: string, durationWeeks: number) {
  const start = new Date(startDateStr + 'T00:00:00')
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const week = Math.floor(diffDays / 7) + 1
  return Math.max(1, Math.min(durationWeeks, week))
}

function dayLabelFromSelected(dayNumber: number, dayName: string) {
  return `Day ${dayNumber} (${dayName})`
}

function statusMeta(logged: number, target: number) {
  if (logged <= 0) {
    return { pill: 'Not started', pillClass: 'bg-white/10 text-white/60', cardClass: 'border-white/10' }
  }
  if (logged < target) {
    return { pill: 'Partially logged', pillClass: 'bg-yellow-500/15 text-yellow-300', cardClass: 'border-yellow-500/30' }
  }
  return { pill: 'Completed', pillClass: 'bg-green-500/15 text-green-300', cardClass: 'border-green-500/30' }
}

function kFactor(lift: BaseLift) {
  if (lift === 'squat') return 30
  if (lift === 'bench') return 31
  return 28
}

// ignore RPE: e1RM = w * (1 + reps/k)
function e1rmNoRpe(weight: number, reps: number, lift: BaseLift) {
  const k = kFactor(lift)
  if (!Number.isFinite(weight) || !Number.isFinite(reps)) return null
  if (weight <= 0 || reps <= 0) return null
  return weight * (1 + reps / k)
}

export default async function Dashboard() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user) return null

  const { data: plan } = await supabase
    .from('plans')
    .select('id,name,duration_weeks,start_date')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!plan) {
    return (
      <div className="card">
        <div className="h1">No active plan</div>
      </div>
    )
  }

  // days for labels
  const { data: inputs } = await supabase
    .from('plan_generation_inputs')
    .select('days_of_week')
    .eq('plan_id', plan.id)
    .single()

  const selectedDays = (inputs?.days_of_week ?? ['Mon', 'Tue', 'Thu', 'Sat']) as string[]

  // Current week block
  const weekNr = currentWeekNumber(plan.start_date, plan.duration_weeks)

  const { data: week } = await supabase
    .from('plan_weeks')
    .select(
      `
      id,
      week_number,
      workouts (
        id,
        day_number,
        name,
        workout_exercises (
          id,
          target_sets,
          exercises ( name, is_main_lift, base_lift, tracking_mode )
        )
      )
    `
    )
    .eq('plan_id', plan.id)
    .eq('week_number', weekNr)
    .single()

  const workouts = ((week?.workouts ?? []) as WeekWorkout[]).slice().sort((a, b) => a.day_number - b.day_number)

  // ---------------------------------------------------------
  // Logged sets count for "This Week"
  // ---------------------------------------------------------
  const thisWeekWeIds = workouts.flatMap((wo) => (wo.workout_exercises ?? []).map((we) => we.id))
  const targetSetsByWorkout = new Map<string, number>()
  const workoutWeIds = new Map<string, string[]>()

  for (const wo of workouts) {
    const ids = (wo.workout_exercises ?? []).map((we) => we.id)
    workoutWeIds.set(wo.id, ids)
    const target = (wo.workout_exercises ?? []).reduce((sum, we) => sum + safeNum(we.target_sets), 0)
    targetSetsByWorkout.set(wo.id, target)
  }

  const loggedCountByWe = new Map<string, number>()
  if (thisWeekWeIds.length) {
    const { data: thisWeekLogs } = await supabase
      .from('set_logs')
      .select('workout_exercise_id')
      .in('workout_exercise_id', thisWeekWeIds)

    for (const row of thisWeekLogs ?? []) {
      const id = (row as any).workout_exercise_id as string
      loggedCountByWe.set(id, (loggedCountByWe.get(id) ?? 0) + 1)
    }
  }

  const loggedCountByWorkout = new Map<string, number>()
  for (const wo of workouts) {
    const ids = workoutWeIds.get(wo.id) ?? []
    const logged = ids.reduce((sum, id) => sum + (loggedCountByWe.get(id) ?? 0), 0)
    loggedCountByWorkout.set(wo.id, logged)
  }

  // ---------------------------------------------------------
  // Timeline axis: weeks in sequence order
  // ---------------------------------------------------------
  const { data: weeksRaw } = await supabase
    .from('plan_weeks')
    .select('id,week_number,sequence_number,is_deload')
    .eq('plan_id', plan.id)
    .order('sequence_number', { ascending: true })

  const weeks = (weeksRaw ?? []) as PlanWeekRow[]
  const weekIdToSeq = new Map<string, number>()
  for (const w of weeks) weekIdToSeq.set(w.id, w.sequence_number)

  // ---------------------------------------------------------
  // PLANNED (grey): max planned e1RM per week per lift, from this plan only
  // ---------------------------------------------------------
  const plannedMaxBySeq: Map<number, LiftSeries> = new Map()
  for (const w of weeks) plannedMaxBySeq.set(w.sequence_number, { squat: null, bench: null, deadlift: null })

  const { data: plannedRowsRaw } = await supabase
    .from('workout_exercises')
    .select('planned_weight, target_reps, workout_id, exercise_id')
    .not('planned_weight', 'is', null)

  const plannedRows = (plannedRowsRaw ?? []) as any[]

  const plannedWorkoutIds = Array.from(new Set(plannedRows.map((r) => String(r.workout_id)).filter(Boolean)))
  const plannedExerciseIds = Array.from(new Set(plannedRows.map((r) => String(r.exercise_id)).filter(Boolean)))

  const workoutIdToWeekId = new Map<string, string>()
  if (plannedWorkoutIds.length) {
    const { data: woRows } = await supabase
      .from('workouts')
      .select('id, week_id')
      .in('id', plannedWorkoutIds)

    for (const r of (woRows ?? []) as any[]) {
      if (r?.id && r?.week_id) workoutIdToWeekId.set(String(r.id), String(r.week_id))
    }
  }

  const weekIdToPlanId = new Map<string, string>()
  if (weeks.length) {
    const { data: pwRows } = await supabase
      .from('plan_weeks')
      .select('id, plan_id')
      .in('id', weeks.map((w) => w.id))

    for (const r of (pwRows ?? []) as any[]) {
      if (r?.id && r?.plan_id) weekIdToPlanId.set(String(r.id), String(r.plan_id))
    }
  }

  const exerciseMeta = new Map<string, { base_lift: string; is_main_lift: boolean }>()
  if (plannedExerciseIds.length) {
    const { data: exRows } = await supabase
      .from('exercises')
      .select('id, base_lift, is_main_lift')
      .in('id', plannedExerciseIds)

    for (const r of (exRows ?? []) as any[]) {
      if (r?.id) exerciseMeta.set(String(r.id), { base_lift: String(r.base_lift), is_main_lift: Boolean(r.is_main_lift) })
    }
  }

  for (const r of plannedRows) {
    const workoutId = String(r.workout_id ?? '')
    const weekId = workoutIdToWeekId.get(workoutId)
    if (!weekId) continue
    if (weekIdToPlanId.get(weekId) !== String(plan.id)) continue

    const seq = weekIdToSeq.get(weekId)
    if (!seq) continue

    const exId = String(r.exercise_id ?? '')
    const meta = exerciseMeta.get(exId)
    if (!meta?.is_main_lift) continue

    const base = meta.base_lift
    if (base !== 'squat' && base !== 'bench' && base !== 'deadlift') continue

    const e = e1rmNoRpe(safeNum(r.planned_weight), safeNum(r.target_reps), base as BaseLift)
    if (!e) continue

    const cur = plannedMaxBySeq.get(seq)![base as BaseLift]
    plannedMaxBySeq.get(seq)![base as BaseLift] = cur == null ? e : Math.max(cur, e)
  }

  // ---------------------------------------------------------
  // ACTUAL (blue): max actual e1RM per week per lift, from logs
  // NO nested joins at all.
  // ---------------------------------------------------------
  const actualMaxBySeq: Map<number, LiftSeries> = new Map()
  for (const w of weeks) actualMaxBySeq.set(w.sequence_number, { squat: null, bench: null, deadlift: null })

  const { data: logsRaw } = await supabase
    .from('set_logs')
    .select('workout_exercise_id, weight, reps, base_lift')
    .eq('user_id', user.id)

  const logs = (logsRaw ?? []) as any[]
  const logWeIds = Array.from(new Set(logs.map((l) => String(l.workout_exercise_id)).filter(Boolean)))

  // map workout_exercise_id -> workout_id
  const weIdToWorkoutId = new Map<string, string>()
  if (logWeIds.length) {
    const { data: weRows } = await supabase
      .from('workout_exercises')
      .select('id, workout_id')
      .in('id', logWeIds)

    for (const r of (weRows ?? []) as any[]) {
      if (r?.id && r?.workout_id) weIdToWorkoutId.set(String(r.id), String(r.workout_id))
    }
  }

  // map workout_id -> week_id (reuse a map, add missing)
  const logWorkoutIds = Array.from(new Set(Array.from(weIdToWorkoutId.values())))
  if (logWorkoutIds.length) {
    const { data: woRows } = await supabase
      .from('workouts')
      .select('id, week_id')
      .in('id', logWorkoutIds)

    for (const r of (woRows ?? []) as any[]) {
      if (r?.id && r?.week_id) workoutIdToWeekId.set(String(r.id), String(r.week_id))
    }
  }

  for (const l of logs) {
    const lift = l.base_lift as BaseLift | null
    if (lift !== 'squat' && lift !== 'bench' && lift !== 'deadlift') continue

    const weId = String(l.workout_exercise_id ?? '')
    const workoutId = weIdToWorkoutId.get(weId)
    if (!workoutId) continue

    const weekId = workoutIdToWeekId.get(workoutId)
    if (!weekId) continue

    // ensure this week belongs to this plan
    if (weekIdToPlanId.get(weekId) !== String(plan.id)) continue

    const seq = weekIdToSeq.get(weekId)
    if (!seq) continue

    const e = e1rmNoRpe(safeNum(l.weight), safeNum(l.reps), lift)
    if (!e) continue

    const cur = actualMaxBySeq.get(seq)![lift]
    actualMaxBySeq.get(seq)![lift] = cur == null ? e : Math.max(cur, e)
  }

  const timeline = weeks.map((w) => ({
    label: w.is_deload ? `Deload (${w.week_number})` : `W${w.week_number}`,
    planned: plannedMaxBySeq.get(w.sequence_number)!,
    actual: actualMaxBySeq.get(w.sequence_number)!,
  }))

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="h1">Dashboard</div>
        <p className="p-muted mt-2">
          {plan.name} • Week {weekNr} / {plan.duration_weeks}
        </p>
      </div>

      <div className="card">
        <div className="font-medium mb-3">This Week</div>

        <div className="space-y-2">
          {workouts.map((wo) => {
            const lifts = (wo.workout_exercises ?? [])
              .map((x) => x.exercises)
              .filter((ex): ex is NonNullable<typeof ex> => !!ex)
              .filter((ex) => ex.base_lift !== 'other')

            const primary = lifts.find((ex) => ex.is_main_lift) ?? lifts[0] ?? null
            const variations = primary ? lifts.filter((ex) => ex.name !== primary.name).map((ex) => ex.name) : []

            const dayName = selectedDays[wo.day_number - 1] ?? `Day${wo.day_number}`
            const logged = loggedCountByWorkout.get(wo.id) ?? 0
            const target = targetSetsByWorkout.get(wo.id) ?? 0
            const s = statusMeta(logged, target)

            return (
              <div key={wo.id} className={`border rounded-lg p-3 ${s.cardClass}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium">{dayLabelFromSelected(wo.day_number, dayName)}</div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${s.pillClass}`}>{s.pill}</span>
                    <a className="link" href={`/workout/${wo.id}`}>Open</a>
                  </div>
                </div>

                <div className="mt-2 text-sm text-white/70">
                  {primary ? (
                    <>
                      <span className="text-white/90">{primary.name}</span>
                      {variations.length > 0 && <span className="text-white/60">{' '}• {variations.join(' • ')}</span>}
                    </>
                  ) : (
                    <span className="text-white/50">No main/variation exercises found.</span>
                  )}
                </div>

                <div className="mt-2 text-xs text-white/50">
                  Logged sets: <span className="text-white/70">{logged}</span> / {target}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <DashboardCharts timeline={timeline} />
    </div>
  )
}