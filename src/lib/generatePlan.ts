import { supabase } from '@/lib/supabase'
import { roundTo2_5 } from '@/lib/rounding'
import { DELOAD_TEMPLATE, getPerformanceBasedWeek, type DayName, type PlanKey, type TemplateBlock } from './planTemplates'

type Inputs = {
  userId: string
  plan: PlanKey // only 'PerformanceBased'
  daysOfWeek: DayName[] // exactly 4
  deloadAfterWeek8: boolean
  deloadAfterWeek10: boolean
  oneRMs: { squat: number; bench: number; deadlift: number } // from profiles
}

type BaseLift = 'squat' | 'bench' | 'deadlift'

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
  // robust: do NOT rely on names. Use base_lift + is_main_lift.
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

export async function generatePlanInDb({
  userId,
  plan,
  daysOfWeek,
  deloadAfterWeek8,
  deloadAfterWeek10,
  oneRMs,
}: Inputs) {
  if (plan !== 'PerformanceBased') throw new Error('Invalid plan')
  if (!Array.isArray(daysOfWeek) || daysOfWeek.length !== 4) throw new Error('Select exactly 4 training days.')

  // 1) deactivate old active plans
  await supabase
    .from('plans')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('is_active', true)

  // Plan length in UI sense stays 10, but stored duration should reflect chronological sequence
  const deloadCount = (deloadAfterWeek8 ? 1 : 0) + (deloadAfterWeek10 ? 1 : 0)
  const durationWeeks = 10 + deloadCount

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

  // 3) persist inputs
  await supabase.from('plan_generation_inputs').insert({
    plan_id: planId,
    days_of_week: daysOfWeek,
    duration_weeks: 10,
    deload_week4: false, // legacy field exists; keep false
    deload_week8: false, // legacy field exists; keep false
    test_week12: false,  // legacy; keep false
    maxes: { squat: oneRMs.squat, bench: oneRMs.bench, deadlift: oneRMs.deadlift },
    weaknesses: [],
    // add your new flags in a follow-up migration if you want; for now, store them in weaknesses or maxes if needed
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

  const insertBlocks = async (workoutId: string, blocks: TemplateBlock[]) => {
    const payload = blocks.map((b) => {
      const lift = b.base_lift
      const exId = exIds.get(lift)!
      const oneRm = lift === 'squat' ? oneRMs.squat : lift === 'bench' ? oneRMs.bench : oneRMs.deadlift

      const planned = plannedWeightFrom1RM(oneRm, b.reps, b.rpe, lift)

      return {
        workout_id: workoutId,
        exercise_id: exId,
        target_sets: b.sets,
        target_reps: b.reps,
        target_percentage: null,
        target_rpe: b.rpe,
        planned_weight: planned,
      }
    })

    const { error } = await supabase.from('workout_exercises').insert(payload)
    if (error) throw new Error(error.message)
  }

  // 4) weeks 1..10 with optional deload insertions
  for (let week = 1; week <= 10; week++) {
    const weekId = await insertWeek(week, false)

    const tmpl = getPerformanceBasedWeek(week)
    for (const day of tmpl.days) {
      const dayName = daysOfWeek[day.dayIndex - 1]
      const workoutId = await insertDay(weekId, day.dayIndex, dayName)
      await insertBlocks(workoutId, day.blocks)
    }

    if (week === 8 && deloadAfterWeek8) {
      const deloadWeekId = await insertWeek(8, true)
      for (const d of DELOAD_TEMPLATE) {
        const dayName = daysOfWeek[d.dayIndex - 1]
        const workoutId = await insertDay(deloadWeekId, d.dayIndex, dayName)
        await insertBlocks(workoutId, d.blocks)
      }
    }

    if (week === 10 && deloadAfterWeek10) {
      const deloadWeekId = await insertWeek(10, true)
      for (const d of DELOAD_TEMPLATE) {
        const dayName = daysOfWeek[d.dayIndex - 1]
        const workoutId = await insertDay(deloadWeekId, d.dayIndex, dayName)
        await insertBlocks(workoutId, d.blocks)
      }
    }
  }

  return planId
}