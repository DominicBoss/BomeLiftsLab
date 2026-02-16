import { createClient } from '@/utils/supabase/server'
import WorkoutClient from './workout-client'

type OneRMs = {
  squat: number
  bench: number
  deadlift: number
}

export default async function WorkoutPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const workoutId = id

  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user) return null

  // Profile 1RMs (fallback)
  const { data: profile } = await supabase
    .from('profiles')
    .select('squat_1rm, bench_1rm, deadlift_1rm')
    .eq('id', user.id)
    .single()

  const profileRms: OneRMs = {
    squat: Number(profile?.squat_1rm ?? 0),
    bench: Number(profile?.bench_1rm ?? 0),
    deadlift: Number(profile?.deadlift_1rm ?? 0),
  }

  // Workout + workout_exercises incl planned_weight
  const { data: workout, error } = await supabase
    .from('workouts')
    .select(
      `
      id,
      name,
      day_number,
      week_id,
      workout_exercises (
        id,
        target_sets,
        target_reps,
        target_percentage,
        target_rpe,
        planned_weight,
        exercise:exercises ( id, name, is_main_lift, base_lift, tracking_mode )
      )
    `
    )
    .eq('id', workoutId)
    .single()

  if (error || !workout) {
    return (
      <div className="card">
        <div className="h1">Workout not found</div>
        <p className="p-muted mt-2">Invalid ID or no access.</p>
      </div>
    )
  }

  const avg10WithFallback = (vals: number[], fallback: number) => {
    const n = vals.length
    const safeFallback = Number.isFinite(fallback) && fallback > 0 ? fallback : 0
    const sum = vals.reduce((a, b) => a + b, 0) + Math.max(0, 10 - n) * safeFallback
    return sum / 10
  }

  // Fetch last 10 e1RM per lift (fast path)
  const fetchLift = async (lift: 'squat' | 'bench' | 'deadlift') => {
    const { data } = await supabase
      .from('set_logs')
      .select('e1rm')
      .eq('user_id', user.id)
      .eq('base_lift', lift)
      .not('e1rm', 'is', null)
      .order('created_at', { ascending: false })
      .limit(10)

    return (data ?? [])
      .map((x: any) => Number(x.e1rm))
      .filter((x: number) => Number.isFinite(x) && x > 0)
  }

  const [sq, bp, dl] = await Promise.all([
    fetchLift('squat'),
    fetchLift('bench'),
    fetchLift('deadlift'),
  ])

  const suggestedRms: OneRMs = {
    squat: avg10WithFallback(sq, profileRms.squat),
    bench: avg10WithFallback(bp, profileRms.bench),
    deadlift: avg10WithFallback(dl, profileRms.deadlift),
  }

  // Logs for this workout
  const weIds = (workout.workout_exercises ?? []).map((x: any) => x.id)

  const { data: logs } = weIds.length
    ? await supabase
        .from('set_logs')
        .select('id, workout_exercise_id, weight, reps, rpe, e1rm, created_at')
        .in('workout_exercise_id', weIds)
        .order('created_at', { ascending: true })
    : { data: [] as any[] }

  return (
    <WorkoutClient
      workout={workout as any}
      initialLogs={(logs ?? []) as any[]}
      userId={user.id}
      profileRms={profileRms}
      suggestedRms={suggestedRms}
    />
  )
}