import { createClient } from '@/utils/supabase/server'
import WorkoutClient from './workout-client'

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

  const { data: profile } = await supabase
    .from('profiles')
    .select('squat_1rm, bench_1rm, deadlift_1rm')
    .eq('id', user.id)
    .single()

  const rms = {
    squat: Number(profile?.squat_1rm ?? 0),
    bench: Number(profile?.bench_1rm ?? 0),
    deadlift: Number(profile?.deadlift_1rm ?? 0),
  }

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
      rms={rms}
    />
  )
}