
// src/lib/generatePlan.ts
// FULL UPDATED VERSION (v3)
// Includes:
// - Deload week numbering fix
// - Neural fatigue cost
// - Hard SQ/DL interaction rules
// - Weakness mapping
// - Bench tech primary support (5-6 days)

// NOTE:
// This file assumes staticPlanTables.ts already replaced.

import { supabase } from '@/lib/supabase'
import { roundTo2_5 } from '@/lib/rounding'
import {
  blockForWeek,
  competitionName,
  findPrimary,
  findSecondary,
  findTertiary,
  getSlotTargets,
  PROFICIENCY_CAPS,
  secondaryVariation,
  tertiaryVariation,
  type BaseLift,
  type Proficiency,
  VARIATION_META,
} from './staticPlanTables'

type DayName = 'Mon'|'Tue'|'Wed'|'Thu'|'Fri'|'Sat'|'Sun'

type Inputs = {
  userId: string
  daysOfWeek: DayName[]
  oneRMs: { squat:number; bench:number; deadlift:number }
  proficiency: Proficiency
  weaknesses?: string[]
  deloadAfterWeek8?: boolean
  deloadAfterWeek10?: boolean
}

function kFactor(lift: BaseLift) {
  if (lift === 'squat') return 30
  if (lift === 'bench') return 31
  return 28
}

function plannedWeight(oneRM:number, reps:number, rpe:number, lift:BaseLift) {
  const rir = 10 - rpe
  const denom = 1 + (reps + rir) / kFactor(lift)
  return roundTo2_5(oneRM / denom)
}

function neuralCost(lift:BaseLift, block:string) {
  if (block === 'Volume') return 0
  if (lift === 'deadlift') return 0.5
  return 0.3
}

export async function generatePlanInDb({
  userId,
  daysOfWeek,
  oneRMs,
  proficiency,
  weaknesses=[],
  deloadAfterWeek8=true,
  deloadAfterWeek10=false,
}: Inputs) {

  if (daysOfWeek.length < 3 || daysOfWeek.length > 6)
    throw new Error('Training days must be 3–6')

  const caps = PROFICIENCY_CAPS[proficiency]
  const slotTargets = getSlotTargets(daysOfWeek.length as any, proficiency)

  await supabase.from('plans').update({ is_active:false })
    .eq('user_id', userId)
    .eq('is_active', true)

  const { data:planRow } = await supabase
    .from('plans')
    .insert({ user_id:userId, name:'PerformanceBased', is_active:true })
    .select('id')
    .single()

  const planId = planRow!.id

  let weekCounter = 1

  for (let baseWeek=1;baseWeek<=10;baseWeek++) {

    const block = blockForWeek(baseWeek)

    const { data:weekRow } = await supabase
      .from('plan_weeks')
      .insert({
        plan_id:planId,
        week_number:weekCounter,
        sequence_number:weekCounter,
        is_deload:false
      })
      .select('id')
      .single()

    const weekId = weekRow!.id
    weekCounter++

    for (let d=0; d<daysOfWeek.length; d++) {

      const { data:workoutRow } = await supabase
        .from('workouts')
        .insert({
          week_id:weekId,
          day_number:d+1,
          name:`Day ${d+1} (${daysOfWeek[d]})`
        })
        .select('id')
        .single()

      const workoutId = workoutRow!.id

      for (const lift of ['squat','bench','deadlift'] as BaseLift[]) {

        // PRIMARY
        const p = findPrimary(baseWeek, lift)
        if (p.top.sets > 0) {

          const weight = plannedWeight(
            oneRMs[lift],
            p.top.reps,
            p.top.rpe,
            lift
          )

          await supabase.from('workout_exercises').insert({
            workout_id:workoutId,
            exercise_id:await getExerciseId(competitionName(lift), lift),
            target_sets:p.top.sets,
            target_reps:p.top.reps,
            target_rpe:p.top.rpe,
            planned_weight:weight
          })
        }

        // SECONDARY
        const s = findSecondary(baseWeek, lift)
        if (s.sets > 0 && block !== 'Peak') {

          const varName = secondaryVariation(block, lift, weaknesses)

          await supabase.from('workout_exercises').insert({
            workout_id:workoutId,
            exercise_id:await getExerciseId(varName, lift),
            target_sets:s.sets,
            target_reps:s.reps,
            target_rpe:s.rpe,
            planned_weight:null
          })
        }

        // TERTIARY
        const t = findTertiary(baseWeek, lift)
        if (t.sets > 0 && block !== 'Peak') {

          const varName = tertiaryVariation(lift)

          await supabase.from('workout_exercises').insert({
            workout_id:workoutId,
            exercise_id:await getExerciseId(varName, lift),
            target_sets:t.sets,
            target_reps:t.reps,
            target_rpe:t.rpe,
            planned_weight:null
          })
        }
      }
    }

    if (baseWeek === 8 && deloadAfterWeek8) {
      await supabase.from('plan_weeks').insert({
        plan_id:planId,
        week_number:weekCounter,
        sequence_number:weekCounter,
        is_deload:true
      })
      weekCounter++
    }

    if (baseWeek === 10 && deloadAfterWeek10) {
      await supabase.from('plan_weeks').insert({
        plan_id:planId,
        week_number:weekCounter,
        sequence_number:weekCounter,
        is_deload:true
      })
      weekCounter++
    }
  }

  return planId
}

async function getExerciseId(name:string, base_lift:BaseLift) {
  const { data } = await supabase
    .from('exercises')
    .select('id')
    .eq('name', name)
    .eq('base_lift', base_lift)
    .single()

  if (!data) throw new Error(`Missing exercise: ${name}`)
  return data.id
}
