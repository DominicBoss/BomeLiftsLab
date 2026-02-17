'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { generatePlanInDb } from '@/lib/generatePlan'

type DayName = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'
type Proficiency = 'Beginner' | 'Advanced'

const ALL_DAYS: DayName[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function Onboarding() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  const [squat, setSquat] = useState('')
  const [bench, setBench] = useState('')
  const [deadlift, setDeadlift] = useState('')

  const [proficiency, setProficiency] = useState<Proficiency>('Beginner')
  const [daysOfWeek, setDaysOfWeek] = useState<DayName[]>(['Mon', 'Wed', 'Fri'])

  const [weaknesses, setWeaknesses] = useState<string[]>([])
  const [deloadAfterWeek8, setDeloadAfterWeek8] = useState(true)
  const [deloadAfterWeek10, setDeloadAfterWeek10] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null)
    })
  }, [])

  const daysError = useMemo(() => {
    if (daysOfWeek.length < 3) return 'Pick at least 3 training days.'
    if (daysOfWeek.length > 6) return 'Pick at most 6 training days.'
    return null
  }, [daysOfWeek])

  const toggleDay = (day: DayName) => {
    setDaysOfWeek((prev) => {
      if (prev.includes(day)) return prev.filter((d) => d !== day)
      return [...prev, day]
    })
  }

  const toggleWeakness = (w: string) => {
    setWeaknesses((prev) => {
      if (prev.includes(w)) return prev.filter((x) => x !== w)
      return [...prev, w]
    })
  }

  const submit = async () => {
    if (!userId) {
      alert('Not logged in.')
      router.push('/auth/login')
      return
    }

    const s = Number(squat)
    const b = Number(bench)
    const d = Number(deadlift)

    if (!Number.isFinite(s) || !Number.isFinite(b) || !Number.isFinite(d) || s <= 0 || b <= 0 || d <= 0) {
      alert('Please enter valid 1RM values (kg).')
      return
    }

    if (daysError) {
      alert(daysError)
      return
    }

    setLoading(true)
    try {
      // Save 1RM to profile (dashboard uses this)
      const { error: pErr } = await supabase
        .from('profiles')
        .update({
          squat_1rm: s,
          bench_1rm: b,
          deadlift_1rm: d,
        })
        .eq('id', userId)

      if (pErr) throw new Error(pErr.message)

      // Generate STATIC plan (engine distributes slots)
      await generatePlanInDb({
        userId,
        daysOfWeek,
        oneRMs: { squat: s, bench: b, deadlift: d },
        proficiency,
        weaknesses,
        deloadAfterWeek8,
        deloadAfterWeek10,
      })

      router.push('/dashboard')
    } catch (e: any) {
      alert(e?.message ?? 'Error generating plan.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page">
      <div className="shell">
        <div className="mb-8">
          <div className="text-sm text-white/60">BomeLifts Lab</div>
          <div className="h1 mt-1">Onboarding</div>
          <p className="p-muted mt-2">Enter your current 1RMs and generate your first 10-week block.</p>
        </div>

        <div className="card">
          <div className="space-y-5">
            <div className="space-y-3">
              <div>
                <div className="text-sm text-white/70 mb-1">Squat 1RM (kg)</div>
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="e.g. 240"
                  value={squat}
                  onChange={(e) => setSquat(e.target.value)}
                />
              </div>

              <div>
                <div className="text-sm text-white/70 mb-1">Bench 1RM (kg)</div>
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="e.g. 170"
                  value={bench}
                  onChange={(e) => setBench(e.target.value)}
                />
              </div>

              <div>
                <div className="text-sm text-white/70 mb-1">Deadlift 1RM (kg)</div>
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="e.g. 290"
                  value={deadlift}
                  onChange={(e) => setDeadlift(e.target.value)}
                />
              </div>
            </div>

            <div className="h-px bg-white/10" />

            <div className="space-y-4">
              <div>
                <div className="text-sm text-white/70 mb-2">Training days (pick 3–6)</div>
                <div className="grid grid-cols-2 gap-2">
                  {ALL_DAYS.map((day) => (
                    <label key={day} className="flex items-center gap-2 text-sm text-white/80">
                      <input
                        type="checkbox"
                        checked={daysOfWeek.includes(day)}
                        onChange={() => toggleDay(day)}
                      />
                      {day}
                    </label>
                  ))}
                </div>
                {daysError ? <p className="text-xs text-red-400 mt-2">{daysError}</p> : null}
                <p className="text-xs text-white/50 mt-2">
                  The generator uses your selected days as Day 1..N. You can change day order later.
                </p>
              </div>

              <div>
                <div className="text-sm text-white/70 mb-1">Experience level</div>
                <select className="select" value={proficiency} onChange={(e) => setProficiency(e.target.value as Proficiency)}>
                  <option value="Beginner">Beginner</option>
                  <option value="Advanced">Advanced</option>
                </select>
              </div>

              <div>
                <div className="text-sm text-white/70 mb-2">Weakness focus (optional)</div>

                <div className="grid grid-cols-1 gap-2">
                  <label className="flex items-center gap-2 text-sm text-white/80">
                    <input
                      type="checkbox"
                      checked={weaknesses.includes('bench_off_chest')}
                      onChange={() => toggleWeakness('bench_off_chest')}
                    />
                    Bench — off chest
                  </label>

                  <label className="flex items-center gap-2 text-sm text-white/80">
                    <input
                      type="checkbox"
                      checked={weaknesses.includes('bench_lockout')}
                      onChange={() => toggleWeakness('bench_lockout')}
                    />
                    Bench — lockout
                  </label>

                  <label className="flex items-center gap-2 text-sm text-white/80">
                    <input
                      type="checkbox"
                      checked={weaknesses.includes('squat_hole')}
                      onChange={() => toggleWeakness('squat_hole')}
                    />
                    Squat — out of the hole
                  </label>

                  <label className="flex items-center gap-2 text-sm text-white/80">
                    <input
                      type="checkbox"
                      checked={weaknesses.includes('deadlift_off_floor')}
                      onChange={() => toggleWeakness('deadlift_off_floor')}
                    />
                    Deadlift — off the floor
                  </label>
                </div>
              </div>

              <div className="h-px bg-white/10" />

              <div className="space-y-2">
                <div className="text-sm text-white/70">Deload options</div>

                <label className="flex items-center gap-2 text-sm text-white/80">
                  <input
                    type="checkbox"
                    checked={deloadAfterWeek8}
                    onChange={() => setDeloadAfterWeek8((v) => !v)}
                  />
                  Insert deload after Week 8
                </label>

                <label className="flex items-center gap-2 text-sm text-white/80">
                  <input
                    type="checkbox"
                    checked={deloadAfterWeek10}
                    onChange={() => setDeloadAfterWeek10((v) => !v)}
                  />
                  Insert deload after Week 10
                </label>

                <p className="text-xs text-white/50">
                  Deload weeks are added as extra weeks and will be marked as deload in your plan.
                </p>
              </div>
            </div>

            <button onClick={submit} disabled={loading} className="btn-full">
              {loading ? 'Generating…' : 'Generate Plan'}
            </button>

            <p className="text-xs text-white/50">
              Planned weights are calculated from your 1RM using k-factors (SQ 30, BP 31, DL 28). Logged weights will be used for future auto-regulation.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
