import { createClient } from '@/utils/supabase/server'
import DashboardCharts from './dashboard-charts'

type TrackingMode = 'e1rm' | 'volume' | 'none'
type BaseLift = 'squat' | 'bench' | 'deadlift' | 'other'

type WeekWorkout = {
  id: string
  day_number: number
  name: string | null
  workout_exercises: {
    exercise: {
      name: string
      is_main_lift: boolean
      base_lift: BaseLift
      tracking_mode: TrackingMode
    } | null
  }[]
}

type LogRow = {
  created_at: string
  e1rm: number | null
  weight: number
  reps: number
  workout_exercises: {
    exercise: {
      base_lift: BaseLift
      tracking_mode: TrackingMode
    } | null
  } | null
}

function currentWeekNumber(startDateStr: string, durationWeeks: number) {
  const start = new Date(startDateStr + 'T00:00:00')
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  const week = Math.floor(diffDays / 7) + 1
  return Math.max(1, Math.min(durationWeeks, week))
}

function toDayKey(iso: string) {
  return iso.slice(0, 10)
}

function dayLabel(planStartDate: string, weekNr: number, dayNumber: number) {
  const start = new Date(planStartDate + 'T00:00:00')
  const date = new Date(start)
  date.setDate(date.getDate() + (weekNr - 1) * 7 + (dayNumber - 1))
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
  return `Day ${dayNumber} (${names[date.getDay()]})`
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

  const weekNr = currentWeekNumber(plan.start_date, plan.duration_weeks)

  // ---------------------------
  // THIS WEEK (workouts + exercises)
  // Fix: force relationship workout_exercises.exercise_id -> exercises.id
  // ---------------------------
  const weekRes = await supabase
    .from('plan_weeks')
    .select(`
      id,
      week_number,
      workouts (
        id,
        day_number,
        name,
        workout_exercises (
          exercise:exercises!workout_exercises_exercise_id_fkey (
            name,
            is_main_lift,
            base_lift,
            tracking_mode
          )
        )
      )
    `)
    .eq('plan_id', plan.id)
    .eq('week_number', weekNr)
    .single()

  // keep response as any (supabase types are not generated -> TS guesswork causes build failures)
  const week: any = weekRes.data

  const workouts: WeekWorkout[] = ((week?.workouts ?? []) as any)
    .slice()
    .sort((a: any, b: any) => Number(a.day_number) - Number(b.day_number))

  // ---------------------------
  // CHART DATA (last 90 days)
  // Fix: force set_logs.workout_exercise_id -> workout_exercises.id (to-one)
  // Fix: force workout_exercises.exercise_id -> exercises.id (to-one)
  // ---------------------------
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 90)

  const logsRes = await supabase
    .from('set_logs')
    .select(`
      created_at,
      e1rm,
      weight,
      reps,
      workout_exercises:workout_exercises!set_logs_workout_exercise_id_fkey (
        exercise:exercises!workout_exercises_exercise_id_fkey (
          base_lift,
          tracking_mode
        )
      )
    `)
    .gte('created_at', cutoff.toISOString())
    .order('created_at', { ascending: true })

  const logs: LogRow[] = (logsRes.data ?? []) as any

  // Best e1RM per day for S/B/D
  const bestByDay: Record<string, Record<'squat' | 'bench' | 'deadlift', number>> = {}

  for (const r of logs) {
    const ex = r.workout_exercises?.exercise
    if (!ex) continue
    if (ex.tracking_mode !== 'e1rm') continue
    if (ex.base_lift === 'other') continue
    if (r.e1rm == null) continue

    const day = toDayKey(r.created_at)
    if (!bestByDay[day]) bestByDay[day] = { squat: 0, bench: 0, deadlift: 0 }

    const lift = ex.base_lift
    const e1rm = Number(r.e1rm)
    if (Number.isFinite(e1rm) && e1rm > bestByDay[day][lift]) bestByDay[day][lift] = e1rm
  }

  const days = Object.keys(bestByDay).sort()
  const e1rmSeries = days.map((d) => ({
    day: d,
    squat: bestByDay[d].squat || null,
    bench: bestByDay[d].bench || null,
    deadlift: bestByDay[d].deadlift || null,
  }))

  // Weekly tonnage (last 12 ISO weeks from logs)
  const tonnageByWeek = new Map<string, number>()

  for (const r of logs) {
    const w = Number(r.weight)
    const reps = Number(r.reps)
    if (!Number.isFinite(w) || !Number.isFinite(reps) || w <= 0 || reps <= 0) continue

    const dt = new Date(r.created_at)
    const tmp = new Date(Date.UTC(dt.getFullYear(), dt.getMonth(), dt.getDate()))
    const dayNum = tmp.getUTCDay() || 7
    tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum)
    const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1))
    const weekNo = Math.ceil((((tmp.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
    const key = `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`

    tonnageByWeek.set(key, (tonnageByWeek.get(key) ?? 0) + w * reps)
  }

  const tonnageWeeks = Array.from(tonnageByWeek.keys()).sort()
  const last12 = tonnageWeeks.slice(Math.max(0, tonnageWeeks.length - 12))
  const tonnageSeries = last12.map((k) => ({
    week: k,
    tonnage: Math.round(tonnageByWeek.get(k) ?? 0),
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
              .map((x) => x.exercise)
              .filter((ex): ex is NonNullable<typeof ex> => !!ex)
              .filter((ex) => ex.base_lift !== 'other')

            const primary = lifts.find((ex) => ex.is_main_lift) ?? lifts[0] ?? null
            const variations = primary ? lifts.filter((ex) => ex.name !== primary.name).map((ex) => ex.name) : []

            return (
              <div key={wo.id} className="border border-white/10 rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <div className="font-medium">{dayLabel(plan.start_date, weekNr, wo.day_number)}</div>
                  <a className="link" href={`/workout/${wo.id}`}>
                    Open
                  </a>
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
              </div>
            )
          })}
        </div>
      </div>

      <DashboardCharts e1rmSeries={e1rmSeries} tonnageSeries={tonnageSeries} />
    </div>
  )
}