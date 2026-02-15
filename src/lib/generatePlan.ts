import { supabase } from '@/lib/supabase'
import { getTemplate, type PlanKey } from './planTemplates'

type Inputs = {
  userId: string
  plan: PlanKey
  durationWeeks: 8 | 12
}

export async function generatePlanInDb({ userId, plan, durationWeeks }: Inputs) {
  // 1) deactivate old plans (don’t delete history)
  await supabase
    .from('plans')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('is_active', true)

  // 2) create new plan
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

  // preload exercises lookup
  const { data: exRows, error: exErr } = await supabase
    .from('exercises')
    .select('id,name')

  if (exErr) throw new Error(exErr.message)

  const exMap = new Map<string, string>()
  exRows?.forEach((r) => exMap.set(r.name, r.id))

  const getExId = (name: string) => {
    const id = exMap.get(name)
    if (!id) throw new Error(`Exercise not found in DB: ${name} (seed exercises first)`)
    return id
  }

  // 3) weeks + workouts + workout_exercises
  for (let week = 1; week <= durationWeeks; week++) {
    const { data: weekRow, error: wErr } = await supabase
      .from('plan_weeks')
      .insert({ plan_id: planId, week_number: week })
      .select('id')
      .single()
    if (wErr) throw new Error(wErr.message)

    const weekId = weekRow.id as string
    const days = getTemplate(plan, week, durationWeeks)

    for (const day of days) {
      const { data: woRow, error: woErr } = await supabase
        .from('workouts')
        .insert({
          week_id: weekId,
          day_number: day.dayIndex,
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
        target_percentage: e.percentage ?? null,
        target_rpe: e.rpe ?? null,
      }))

      const { error: weErr } = await supabase
        .from('workout_exercises')
        .insert(payload)

      if (weErr) throw new Error(weErr.message)
    }
  }

  return planId
}