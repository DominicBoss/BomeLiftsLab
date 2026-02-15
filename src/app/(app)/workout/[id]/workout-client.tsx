'use client'

import { useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { roundTo2_5 } from '@/lib/rounding'
import { base1rmForBaseLift, type BaseLift, type OneRMs } from '@/lib/lift1rm'

type WorkoutExercise = {
  id: string
  target_sets: number
  target_reps: number
  target_percentage: number | null
  target_rpe: number | null
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

function brzyckiE1RM(weight: number, reps: number) {
  if (!Number.isFinite(weight) || !Number.isFinite(reps)) return null
  if (weight <= 0 || reps <= 0) return null
  if (reps > 10) return null
  return weight * (36 / (37 - reps))
}

export default function WorkoutClient({
  workout,
  initialLogs,
  rms,
}: {
  workout: Workout
  initialLogs: SetLog[]
  rms: OneRMs
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

      const pct = we.target_percentage ? Number(we.target_percentage) : null
      const baseLift = (we.exercise?.base_lift ?? 'other') as BaseLift

      let plannedKg: number | null = null
      if (pct !== null && pct > 0 && baseLift !== 'other') {
        const base = base1rmForBaseLift(baseLift, rms)
        plannedKg = base > 0 ? roundTo2_5(base * pct) : null
      }

      const sets: DraftSet[] = []
      for (let i = 0; i < we.target_sets; i++) {
        const ex = existing[i]

        if (ex) {
          sets.push({
            weight: ex.weight?.toString?.() ?? '',
            reps: ex.reps?.toString?.() ?? (we.target_reps?.toString?.() ?? ''),
            rpe: ex.rpe?.toString?.() ?? '',
          })
          continue
        }

        sets.push({
          weight: plannedKg !== null ? plannedKg.toString() : '',
          reps: we.target_reps?.toString?.() ?? '',
          rpe: '',
        })
      }

      state[we.id] = sets
    }

    return state
  }, [workout.workout_exercises, logsByWe, rms])

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
      if (weIds.length) {
        const { error: delErr } = await supabase
          .from('set_logs')
          .delete()
          .in('workout_exercise_id', weIds)

        if (delErr) throw new Error(delErr.message)
      }

      const payload: any[] = []

      for (const we of workout.workout_exercises) {
        const sets = draft[we.id] ?? []
        for (const s of sets) {
          const w = Number(s.weight)
          const r = Number(s.reps)
          const rpe = s.rpe.trim() === '' ? null : Number(s.rpe)

          if (!Number.isFinite(w) || !Number.isFinite(r) || w <= 0 || r <= 0) continue

          const trackingMode = we.exercise?.tracking_mode ?? 'volume'
          const e1rm = trackingMode === 'e1rm' ? brzyckiE1RM(w, r) : null

          payload.push({
            workout_exercise_id: we.id,
            weight: w,
            reps: r,
            rpe: Number.isFinite(rpe as any) ? rpe : null,
            e1rm,
          })
        }
      }

      if (payload.length === 0) {
        throw new Error('Nothing to save. Enter at least one set (weight + reps).')
      }

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
          const pct = we.target_percentage ? Number(we.target_percentage) : null
          const target =
            pct !== null
              ? `${we.target_sets} x ${we.target_reps} @ ${(pct * 100).toFixed(0)}%`
              : we.target_rpe
                ? `${we.target_sets} x ${we.target_reps} @ RPE ${we.target_rpe}`
                : `${we.target_sets} x ${we.target_reps}`

          const sets = draft[we.id] ?? []

          return (
            <div key={we.id} className="rounded-lg border border-white/10 p-4">
              <div className="flex items-baseline justify-between gap-4">
                <div className="font-medium">{exName}</div>
                <div className="text-sm text-white/60">{target}</div>
              </div>

              <div className="mt-4 space-y-2">
                {sets.map((s, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-2 text-sm text-white/60">Set {idx + 1}</div>

                    <input
                      className="input col-span-4"
                      inputMode="decimal"
                      placeholder="Weight"
                      value={s.weight}
                      onChange={(e) => setField(we.id, idx, 'weight', e.target.value)}
                    />

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
                      placeholder="RPE (opt)"
                      value={s.rpe}
                      onChange={(e) => setField(we.id, idx, 'rpe', e.target.value)}
                    />
                  </div>
                ))}

                <p className="text-xs text-white/50 mt-2">
                  e1RM is saved using Brzycki (only for reps ≤ 10). Higher reps won’t generate e1RM.
                </p>
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