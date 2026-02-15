import { createClient } from '@/utils/supabase/server'
import HistoryClient from './history-client'

type BaseLift = 'squat' | 'bench' | 'deadlift' | 'other'
type TrackingMode = 'e1rm' | 'volume' | 'none'

type LogRow = {
  created_at: string
  weight: number
  reps: number
  e1rm: number | null
  workout_exercises: {
    id: string
    exercise: {
      name: string
      base_lift: BaseLift
      tracking_mode: TrackingMode
      is_main_lift: boolean
    } | null
    workouts: {
      id: string
      day_number: number
      name: string | null
      week_id: string
      plan_weeks: {
        id: string
        week_number: number
        plan_id: string
        plans: {
          id: string
          name: string | null
          start_date: string
          duration_weeks: number
          is_active: boolean
        } | null
      } | null
    } | null
  } | null
}

type WorkoutHistoryItem = {
  workout_id: string
  title: string
  day_number: number
  week_number: number | null
  plan_name: string | null
  is_active_plan: boolean | null
  last_logged_at: string // ISO
  tonnage: number
  best_e1rm: { squat: number | null; bench: number | null; deadlift: number | null }
}

function round(n: number) {
  return Math.round(n)
}

export default async function HistoryPage() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user) return null

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 180)

  const logsRes = await supabase
    .from('set_logs')
    .select(`
      created_at,
      weight,
      reps,
      e1rm,
      workout_exercises:workout_exercises!set_logs_workout_exercise_id_fkey (
        id,
        exercise:exercises!workout_exercises_exercise_id_fkey (
          name,
          base_lift,
          tracking_mode,
          is_main_lift
        ),
        workouts:workouts!workout_exercises_workout_id_fkey (
          id,
          day_number,
          name,
          week_id,
          plan_weeks:plan_weeks!workouts_week_id_fkey (
            id,
            week_number,
            plan_id,
            plans:plans!plan_weeks_plan_id_fkey (
              id,
              name,
              start_date,
              duration_weeks,
              is_active
            )
          )
        )
      )
    `)
    .gte('created_at', cutoff.toISOString())
    .order('created_at', { ascending: false })

  if (logsRes.error) {
    return (
      <div className="card">
        <div className="h1">History</div>
        <p className="p-muted mt-2">Failed to load logs: {logsRes.error.message}</p>
      </div>
    )
  }

  const logs: LogRow[] = (logsRes.data ?? []) as any

  const byWorkout = new Map<string, WorkoutHistoryItem>()

  for (const r of logs) {
    const we = r.workout_exercises
    const wo = we?.workouts
    const pw = wo?.plan_weeks
    const plan = pw?.plans
    if (!wo) continue

    const workoutId = wo.id

    const weight = Number(r.weight)
    const reps = Number(r.reps)
    const tonnageAdd = Number.isFinite(weight) && Number.isFinite(reps) ? weight * reps : 0

    const ex = we?.exercise
    const baseLift = ex?.base_lift ?? 'other'
    const trackingMode = ex?.tracking_mode ?? 'volume'
    const e1rm = r.e1rm == null ? null : Number(r.e1rm)

    if (!byWorkout.has(workoutId)) {
      const title = wo.name ?? `Day ${wo.day_number}`
      byWorkout.set(workoutId, {
        workout_id: workoutId,
        title,
        day_number: Number(wo.day_number),
        week_number: pw?.week_number ?? null,
        plan_name: plan?.name ?? null,
        is_active_plan: plan?.is_active ?? null,
        last_logged_at: r.created_at,
        tonnage: 0,
        best_e1rm: { squat: null, bench: null, deadlift: null },
      })
    }

    const item = byWorkout.get(workoutId)!

    if (r.created_at > item.last_logged_at) item.last_logged_at = r.created_at
    item.tonnage += tonnageAdd

    if (trackingMode === 'e1rm' && baseLift !== 'other' && e1rm != null && Number.isFinite(e1rm)) {
      const prev = item.best_e1rm[baseLift]
      if (prev == null || e1rm > prev) item.best_e1rm[baseLift] = e1rm
    }
  }

  const items = Array.from(byWorkout.values())
    .map((x) => ({
      ...x,
      tonnage: round(x.tonnage),
      best_e1rm: {
        squat: x.best_e1rm.squat ? round(x.best_e1rm.squat) : null,
        bench: x.best_e1rm.bench ? round(x.best_e1rm.bench) : null,
        deadlift: x.best_e1rm.deadlift ? round(x.best_e1rm.deadlift) : null,
      },
    }))
    .sort((a, b) => (a.last_logged_at < b.last_logged_at ? 1 : -1))

  return <HistoryClient initialItems={items} />
}