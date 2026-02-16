'use client'

import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { roundTo2_5 } from '@/lib/rounding'

type BaseLift = 'squat' | 'bench' | 'deadlift' | 'other'

type OneRMs = {
  squat: number
  bench: number
  deadlift: number
}

type WorkoutExercise = {
  id: string
  target_sets: number
  target_reps: number
  target_percentage: number | null
  target_rpe: number | null
  planned_weight: number | null
  exercise: {
    id: string
    name: string
    is_main_lift: boolean
    base_lift: BaseLift
    tracking_mode: 'e1rm' | 'volume' | 'none'
  } | null
}

type Workout = {
  id: string
  name: string | null
  day_number: number
  workout_exercises: WorkoutExercise[]
}

type SetLog = {
  id: string
  workout_exercise_id: string
  weight: number
  reps: number
  rpe: number | null
  e1rm: number | null
}

type DraftSet = {
  weight: string
  reps: string
  rpe: string
}

type InsertRow = {
  user_id: string
  base_lift: 'squat' | 'bench' | 'deadlift' | null
  workout_exercise_id: string
  weight: number
  reps: number
  rpe: number | null
  e1rm: number | null
}

function fmtKg(x: number) {
  return x.toFixed(1)
}

function diffColor(diff: number | null) {
  if (diff === null || diff === 0) return 'text-white/40'
  if (diff > 0) return 'text-green-400'
  return 'text-red-400'
}

function isSbdLift(x: string): x is 'squat' | 'bench' | 'deadlift' {
  return x === 'squat' || x === 'bench' || x === 'deadlift'
}

function kFactor(baseLift: BaseLift) {
  if (baseLift === 'squat') return 30
  if (baseLift === 'bench') return 31
  if (baseLift === 'deadlift') return 28
  return null
}

function rirFromRpe(rpe: number) {
  return 10 - rpe
}

function e1rmFromSet(weight: number, reps: number, rpe: number, baseLift: BaseLift) {
  const k = kFactor(baseLift)
  if (!k) return null
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || !Number.isFinite(rpe)) return null
  if (weight <= 0 || reps <= 0 || rpe <= 0) return null
  const rir = rirFromRpe(rpe)
  return weight * (1 + (reps + rir) / k)
}

function weightFromE1rm(e1rm: number, reps: number, targetRpe: number, baseLift: BaseLift) {
  const k = kFactor(baseLift)
  if (!k) return null
  if (!Number.isFinite(e1rm) || !Number.isFinite(reps) || !Number.isFinite(targetRpe)) return null
  if (e1rm <= 0 || reps <= 0 || targetRpe <= 0) return null
  const rir = rirFromRpe(targetRpe)
  const denom = 1 + (reps + rir) / k
  if (denom <= 0) return null
  return e1rm / denom
}

function base1rmFor(baseLift: BaseLift, rms: OneRMs) {
  if (baseLift === 'squat') return rms.squat
  if (baseLift === 'bench') return rms.bench
  if (baseLift === 'deadlift') return rms.deadlift
  return 0
}

export default function WorkoutClient({
  workout,
  initialLogs,
  userId,
  profileRms,
  suggestedRms,
}: {
  workout: Workout
  initialLogs: SetLog[]
  userId: string
  profileRms: OneRMs
  suggestedRms: OneRMs
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)

  const logsByWe = useMemo(() => {
    const map = new Map<string, SetLog[]>()
    for (const l of initialLogs) {
      const arr = map.get(l.workout_exercise_id) ?? []
      arr.push(l)
      map.set(l.workout_exercise_id, arr)
    }
    return map
  }, [initialLogs])

  const initialDraft = useMemo(() => {
    const state: Record<string, DraftSet[]> = {}

    for (const we of workout.workout_exercises ?? []) {
      const existing = logsByWe.get(we.id) ?? []
      const targetRpe = we.target_rpe != null ? Number(we.target_rpe) : null

      const baseLift = (we.exercise?.base_lift ?? 'other') as BaseLift
      const isMainLift = Boolean(we.exercise?.is_main_lift) && baseLift !== 'other'
      const isSbdMain = isMainLift && isSbdLift(baseLift)

      const plannedKg =
        we.planned_weight != null && Number.isFinite(Number(we.planned_weight)) && Number(we.planned_weight) > 0
          ? roundTo2_5(Number(we.planned_weight))
          : null

      let suggestedKg: number | null = null
      if (isSbdMain && targetRpe !== null) {
        const suggestedBase = base1rmFor(baseLift, suggestedRms)
        const s = weightFromE1rm(suggestedBase, we.target_reps, targetRpe, baseLift)
        suggestedKg = s != null ? roundTo2_5(s) : null
      }

      const prefill = suggestedKg ?? plannedKg ?? null

      const sets: DraftSet[] = []
      for (let i = 0; i < we.target_sets; i++) {
        const ex = existing[i]
        if (ex) {
          sets.push({
            weight: ex.weight?.toString?.() ?? '',
            reps: ex.reps?.toString?.() ?? (we.target_reps?.toString?.() ?? ''),
            rpe: ex.rpe?.toString?.() ?? '',
          })
        } else {
          sets.push({
            weight: prefill !== null ? prefill.toString() : '',
            reps: we.target_reps?.toString?.() ?? '',
            rpe: '',
          })
        }
      }

      state[we.id] = sets
    }

    return state
  }, [workout.workout_exercises, logsByWe, suggestedRms])

  const [draft, setDraft] = useState<Record<string, DraftSet[]>>(initialDraft)

  const setField = (weId: string, setIndex: number, field: keyof DraftSet, value: string) => {
    setDraft((prev) => {
      const copy = { ...prev }
      const sets = [...(copy[weId] ?? [])]
      const row = { ...(sets[setIndex] ?? { weight: '', reps: '', rpe: '' }) }
      row[field] = value
      sets[setIndex] = row
      copy[weId] = sets
      return copy
    })
  }

  const saveWorkout = async () => {
    setSaving(true)
    try {
      const weIds = workout.workout_exercises.map((x) => x.id)

      // overwrite logs for this workout
      if (weIds.length) {
        const { error: delErr } = await supabase.from('set_logs').delete().in('workout_exercise_id', weIds)
        if (delErr) throw new Error(delErr.message)
      }

      const meta = new Map<string, { baseLift: BaseLift; isMainLift: boolean }>()
      for (const we of workout.workout_exercises ?? []) {
        meta.set(we.id, {
          baseLift: (we.exercise?.base_lift ?? 'other') as BaseLift,
          isMainLift: Boolean(we.exercise?.is_main_lift),
        })
      }

      const payload: InsertRow[] = []

      for (const we of workout.workout_exercises) {
        const sets = draft[we.id] ?? []
        const m = meta.get(we.id)
        const baseLift = (m?.baseLift ?? 'other') as BaseLift
        const isSbdMain = Boolean(m?.isMainLift) && isSbdLift(baseLift)

        for (const s of sets) {
          const w = Number(s.weight)
          const r = Number(s.reps)
          const rpe = s.rpe.trim() === '' ? null : Number(s.rpe)

          if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) continue

          let e1rm: number | null = null
          if (isSbdMain && rpe !== null && Number.isFinite(rpe) && rpe > 0) {
            e1rm = e1rmFromSet(w, r, rpe, baseLift)
          }

          payload.push({
            user_id: userId,
            base_lift: isSbdLift(baseLift) ? baseLift : null,
            workout_exercise_id: we.id,
            weight: w,
            reps: r,
            rpe: rpe !== null && Number.isFinite(rpe as any) ? rpe : null,
            e1rm,
          })
        }
      }

      if (payload.length === 0) throw new Error('Nothing to save.')

      const { error: insErr } = await supabase.from('set_logs').insert(payload)
      if (insErr) throw new Error(insErr.message)

      router.refresh()
      alert('Workout saved.')
    } catch (e: any) {
      alert(e?.message ?? 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  const title = workout.name ?? `Day ${workout.day_number}`

  return (
    <div className="space-y-4">
      <div className="card flex items-center justify-between gap-4">
        <div>
          <div className="h1">{title}</div>
          <p className="p-muted mt-2">Log all sets. Save once when you’re done.</p>
        </div>
        <button className="btn" onClick={() => router.push('/dashboard')}>
          Back
        </button>
      </div>

      <div className="card space-y-6">
        {(workout.workout_exercises ?? []).map((we) => {
          const exName = we.exercise?.name ?? 'Exercise'
          const targetRpe = we.target_rpe != null ? Number(we.target_rpe) : null

          const baseLift = (we.exercise?.base_lift ?? 'other') as BaseLift
          const isMainLift = Boolean(we.exercise?.is_main_lift) && baseLift !== 'other'
          const isSbdMain = isMainLift && isSbdLift(baseLift)

          const plannedKg =
            we.planned_weight != null && Number.isFinite(Number(we.planned_weight)) && Number(we.planned_weight) > 0
              ? roundTo2_5(Number(we.planned_weight))
              : null

          let suggestedKg: number | null = null
          if (isSbdMain && targetRpe !== null) {
            const suggestedBase = base1rmFor(baseLift, suggestedRms)
            const s = weightFromE1rm(suggestedBase, we.target_reps, targetRpe, baseLift)
            suggestedKg = s != null ? roundTo2_5(s) : null
          }

          const diff = plannedKg !== null && suggestedKg !== null ? suggestedKg - plannedKg : null
          const sets = draft[we.id] ?? []

          return (
            <div key={we.id} className="rounded-lg border border-white/10 p-4">
              <div className="flex items-baseline justify-between gap-4">
                <div className="font-medium">{exName}</div>
                <div className="text-sm text-white/60">
                  {we.target_sets} x {we.target_reps}
                  {targetRpe !== null ? ` @ RPE ${targetRpe}` : ''}
                </div>
              </div>

              <div className="mt-4 grid grid-cols-12 gap-3 items-center">
                <div className="col-span-1 text-xs uppercase tracking-wide text-white/40">Set</div>
                <div className="col-span-5 text-xs uppercase tracking-wide text-white/40">Weight</div>
                <div className="col-span-3 text-xs uppercase tracking-wide text-white/40">Reps</div>
                <div className="col-span-3 text-xs uppercase tracking-wide text-white/40">
                  {isSbdMain ? (
                    <>
                      RPE <span className="normal-case text-white/30">(needed for e1RM)</span>
                    </>
                  ) : (
                    <>
                      RPE <span className="normal-case text-white/30">(optional)</span>
                    </>
                  )}
                </div>
              </div>

              <div className="mt-2 space-y-3">
                {sets.map((s, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-3 items-start">
                    <div className="col-span-1 text-sm text-white/50 mt-2">{idx + 1}</div>

                    <div className="col-span-5">
                      <div className="relative">
                        <input
                          className="input w-full pr-10"
                          inputMode="decimal"
                          placeholder="Weight"
                          value={s.weight}
                          onChange={(e) => setField(we.id, idx, 'weight', e.target.value)}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 text-sm pointer-events-none">
                          kg
                        </span>
                      </div>

                      {isSbdMain && suggestedKg !== null && plannedKg !== null && (
                        <div className={`mt-1 text-xs ${diffColor(diff)}`}>
                          Suggested: {fmtKg(suggestedKg)} kg
                          <span className="ml-2 text-white/30">Planned: {fmtKg(plannedKg)} kg</span>
                          {diff !== null && (
                            <span className="ml-1">
                              ({diff > 0 ? '+' : ''}
                              {fmtKg(diff)} kg)
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <input
                      className="input col-span-3"
                      inputMode="numeric"
                      placeholder="Reps"
                      value={s.reps}
                      onChange={(e) => setField(we.id, idx, 'reps', e.target.value)}
                    />

                    <input
                      className="input col-span-3"
                      inputMode="decimal"
                      placeholder={isSbdMain ? 'RPE' : 'RPE (opt)'}
                      value={s.rpe}
                      onChange={(e) => setField(we.id, idx, 'rpe', e.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        <button className="btn-full" disabled={saving} onClick={saveWorkout}>
          {saving ? 'Saving…' : 'Save Workout'}
        </button>
      </div>
    </div>
  )
}