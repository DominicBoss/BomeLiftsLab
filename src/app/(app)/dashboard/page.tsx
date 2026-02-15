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

function startOfIsoWeekMonday(d: Date) {
  // Local time. Monday = 1 ... Sunday = 7
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  const day = x.getDay() === 0 ? 7 : x.getDay()
  x.setDate(x.getDate() - (day - 1))
  return x
}

function currentWeekNumber(planStartDateStr: string, durationWeeks: number) {
  // Week switches at Monday 00:00
  const planStart = new Date(planStartDateStr + 'T00:00:00')
  const startMon = startOfIsoWeekMonday(planStart)
  const nowMon = startOfIsoWeekMonday(new Date())
  const diffMs = nowMon.getTime() - startMon.getTime()
  const diffWeeks = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 7))
  const week = diffWeeks + 1
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

function dayLabelFromSelectedDays(daysOfWeek: number[] | null | undefined, dayNumber: number) {
  if (!daysOfWeek || !Array.isArray(daysOfWeek)) return null
  const d = daysOfWeek[dayNumber - 1]
  const names: Record<number, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' }
  if (!d || !names[d]) return null
  return `Day ${dayNumber} (${names[d]})`
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

  // Read selected weekdays (Option A mapping: day_number 1..4 maps to days_of_week[0..3])
  const genRes = await supabase
    .from('plan_generation_inputs')
    .select('days_of_week')
    .eq('plan_id', plan.id)
    .maybeSingle()

  // keep response as any (no generated types)
  const gen: any = genRes.data
  const selectedDays: number[] | null = (gen?.days_of_week ?? null) as any

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
  // LOGGED STATUS (any set_logs exists for workout_exercises in the workout)
  // ---------------------------
  const workoutIds = workouts.map((w) => w.id)
  const loggedWorkouts = new Set<string>()
  const workoutProgress = new Map<string, { loggedSets: number; targetSets: number }>()

  if (workoutIds.length > 0) {
    const wesRes = await supabase
      .from('workout_exercises')
      .select('id,workout_id,target_sets')
      .in('workout_id', workoutIds)

    const wes: { id: string; workout_id: string; target_sets: number }[] = (wesRes.data ?? []) as any
    const weIdToWorkoutId = new Map<string, string>()

    for (const we of wes) {
      weIdToWorkoutId.set(we.id, we.workout_id)
      const cur = workoutProgress.get(we.workout_id) ?? { loggedSets: 0, targetSets: 0 }
      cur.targetSets += Number(we.target_sets) || 0
      workoutProgress.set(we.workout_id, cur)
    }

    const weIds = wes.map((x) => x.id)
    if (weIds.length > 0) {
      const logs2Res = await supabase
        .from('set_logs')
        .select('workout_exercise_id')
        .in('workout_exercise_id', weIds)
        .limit(5000)

      const rows: { workout_exercise_id: string }[] = (logs2Res.data ?? []) as any
      for (const r of rows) {
        const wid = weIdToWorkoutId.get(r.workout_exercise_id)
        if (!wid) continue
        loggedWorkouts.add(wid)
        const cur = workoutProgress.get(wid) ?? { loggedSets: 0, targetSets: 0 }
        cur.loggedSets += 1
        workoutProgress.set(wid, cur)
      }
    }
  }

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
            const isAnyLogged = loggedWorkouts.has(wo.id)
            const prog = workoutProgress.get(wo.id) ?? { loggedSets: 0, targetSets: 0 }
            const isComplete = prog.targetSets > 0 && prog.loggedSets >= prog.targetSets
            const isPartial = isAnyLogged && !isComplete
            const lifts = (wo.workout_exercises ?? [])
              .map((x) => x.exercise)
              .filter((ex): ex is NonNullable<typeof ex> => !!ex)
              .filter((ex) => ex.base_lift !== 'other')

            const primary = lifts.find((ex) => ex.is_main_lift) ?? lifts[0] ?? null
            const variations = primary ? lifts.filter((ex) => ex.name !== primary.name).map((ex) => ex.name) : []

            return (
              <div
                key={wo.id}
                className={`border rounded-lg p-3 transition-colors ${
                  isComplete
                    ? 'border-green-500 bg-green-500/10'
                    : isPartial
                      ? 'border-yellow-500/40 bg-yellow-500/5'
                      : 'border-white/10'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="font-medium flex items-center gap-2">
                    {dayLabelFromSelectedDays(selectedDays, wo.day_number) ?? dayLabel(plan.start_date, weekNr, wo.day_number)}
                    {isComplete && (
                      <span className="text-xs px-2 py-0.5 rounded-full border border-green-500/40 bg-green-500/10 text-green-300">
                        ✓ Logged ({Math.min(prog.loggedSets, prog.targetSets)}/{prog.targetSets})
                      </span>
                    )}
                    {isPartial && (
                      <span className="text-xs px-2 py-0.5 rounded-full border border-yellow-500/40 bg-yellow-500/10 text-yellow-300">
                        Partial ({prog.loggedSets}/{prog.targetSets || '—'})
                      </span>
                    )}
                  </div>
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