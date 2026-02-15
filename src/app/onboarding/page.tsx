'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { generatePlanInDb } from '@/lib/generatePlan'
import type { PlanKey } from '@/lib/planTemplates'
import { generateBeginnerULPlanInDb, type Weakness } from '@/lib/generateCustomPlan'

type Mode = 'template' | 'custom_ul4'

const WEEKDAYS: { n: number; label: string }[] = [
  { n: 1, label: 'Mon' },
  { n: 2, label: 'Tue' },
  { n: 3, label: 'Wed' },
  { n: 4, label: 'Thu' },
  { n: 5, label: 'Fri' },
  { n: 6, label: 'Sat' },
  { n: 7, label: 'Sun' },
]

const WEAKNESS_OPTIONS: { key: Weakness; label: string }[] = [
  { key: 'bench_off_chest', label: 'Bench: off chest' },
  { key: 'bench_lockout', label: 'Bench: lockout' },
  { key: 'squat_depth', label: 'Squat: depth' },
  { key: 'squat_out_of_hole', label: 'Squat: out of hole' },
  { key: 'deadlift_off_floor', label: 'Deadlift: off floor' },
  { key: 'deadlift_lockout', label: 'Deadlift: lockout' },
]

export default function Onboarding() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  const [squat, setSquat] = useState('')
  const [bench, setBench] = useState('')
  const [deadlift, setDeadlift] = useState('')

  const [mode, setMode] = useState<Mode>('custom_ul4')

  // template mode (existing)
  const [plan, setPlan] = useState<PlanKey>('Beginner')
  const [duration, setDuration] = useState<8 | 12>(12)

  // custom UL4 inputs
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 3, 5, 7])
  const [deloadWeek4, setDeloadWeek4] = useState(true)
  const [deloadWeek8, setDeloadWeek8] = useState(true)
  const [testWeek12, setTestWeek12] = useState(false)
  const [weaknesses, setWeaknesses] = useState<Weakness[]>([])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null)
    })
  }, [])

  const sortedDays = useMemo(() => {
    const u = Array.from(new Set(daysOfWeek)).sort((a, b) => a - b)
    return u
  }, [daysOfWeek])

  const toggleDay = (n: number) => {
    setDaysOfWeek((prev) => (prev.includes(n) ? prev.filter((x) => x !== n) : [...prev, n]))
  }

  const toggleWeakness = (w: Weakness) => {
    setWeaknesses((prev) => {
      if (prev.includes(w)) return prev.filter((x) => x !== w)
      if (prev.length >= 2) return prev // hard cap
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

    // v1 constraint: UL4 = exactly 4 days
    if (mode === 'custom_ul4' && sortedDays.length !== 4) {
      alert('For Beginner Upper/Lower you must select exactly 4 training days.')
      return
    }

    if (mode === 'custom_ul4' && duration === 8 && testWeek12) {
      alert('Test week 12 is only available for 12-week plans.')
      return
    }

    setLoading(true)
    try {
      // Save 1RM on profile (still useful for plan overview calculations)
      const { error: pErr } = await supabase
        .from('profiles')
        .update({
          squat_1rm: s,
          bench_1rm: b,
          deadlift_1rm: d,
        })
        .eq('id', userId)

      if (pErr) throw new Error(pErr.message)

      if (mode === 'template') {
        await generatePlanInDb({ userId, plan, durationWeeks: duration })
      } else {
        await generateBeginnerULPlanInDb({
          userId,
          daysOfWeek: sortedDays,
          durationWeeks: duration,
          deloadWeek4,
          deloadWeek8,
          testWeek12,
          maxes: { squat: s, bench: b, deadlift: d },
          weaknesses,
        })
      }

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
          <p className="p-muted mt-2">
            Enter your current 1RMs, configure your training days, and generate your first block.
          </p>
        </div>

        <div className="card">
          <div className="space-y-5">
            <div className="space-y-3">
              <div>
                <div className="text-sm text-white/70 mb-1">Squat 1RM (kg)</div>
                <input className="input" inputMode="decimal" placeholder="e.g. 240" value={squat} onChange={(e) => setSquat(e.target.value)} />
              </div>

              <div>
                <div className="text-sm text-white/70 mb-1">Bench 1RM (kg)</div>
                <input className="input" inputMode="decimal" placeholder="e.g. 170" value={bench} onChange={(e) => setBench(e.target.value)} />
              </div>

              <div>
                <div className="text-sm text-white/70 mb-1">Deadlift 1RM (kg)</div>
                <input className="input" inputMode="decimal" placeholder="e.g. 290" value={deadlift} onChange={(e) => setDeadlift(e.target.value)} />
              </div>
            </div>

            <div className="h-px bg-white/10" />

            <div className="space-y-3">
              <div>
                <div className="text-sm text-white/70 mb-1">Plan Mode</div>
                <select className="select" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
                  <option value="custom_ul4">Beginner Upper/Lower (custom, 4 days)</option>
                  <option value="template">Template mode (legacy)</option>
                </select>
                <p className="text-xs text-white/50 mt-2">
                  Custom UL4 lets the user pick training days, deloads, and weaknesses. Template mode uses fixed day names.
                </p>
              </div>

              {mode === 'template' ? (
                <>
                  <div>
                    <div className="text-sm text-white/70 mb-1">Template</div>
                    <select className="select" value={plan} onChange={(e) => setPlan(e.target.value as PlanKey)}>
                      <option value="Beginner">Beginner (3 days)</option>
                      <option value="Intermediate">Intermediate (5 days)</option>
                    </select>
                  </div>

                  <div>
                    <div className="text-sm text-white/70 mb-1">Duration</div>
                    <select className="select" value={duration} onChange={(e) => setDuration(Number(e.target.value) as 8 | 12)}>
                      <option value={8}>8 weeks</option>
                      <option value={12}>12 weeks</option>
                    </select>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <div className="text-sm text-white/70 mb-2">Training Days (select exactly 4)</div>
                    <div className="grid grid-cols-4 gap-2">
                      {WEEKDAYS.map((d) => (
                        <button
                          key={d.n}
                          type="button"
                          onClick={() => toggleDay(d.n)}
                          className={sortedDays.includes(d.n) ? 'btn' : 'btn-ghost'}
                        >
                          {d.label}
                        </button>
                      ))}
                    </div>
                    <div className="text-xs text-white/50 mt-2">
                      Selected: {sortedDays.map((n) => WEEKDAYS.find((d) => d.n === n)?.label ?? n).join(', ') || '—'}
                    </div>
                  </div>

                  <div>
                    <div className="text-sm text-white/70 mb-1">Duration</div>
                    <select className="select" value={duration} onChange={(e) => setDuration(Number(e.target.value) as 8 | 12)}>
                      <option value={8}>8 weeks</option>
                      <option value={12}>12 weeks</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    <label className="flex items-center gap-3">
                      <input type="checkbox" checked={deloadWeek4} onChange={(e) => setDeloadWeek4(e.target.checked)} />
                      <span className="text-sm text-white/80">Deload Week 4</span>
                    </label>

                    <label className="flex items-center gap-3">
                      <input type="checkbox" checked={deloadWeek8} onChange={(e) => setDeloadWeek8(e.target.checked)} />
                      <span className="text-sm text-white/80">Deload Week 8</span>
                    </label>

                    <label className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={testWeek12}
                        disabled={duration !== 12}
                        onChange={(e) => setTestWeek12(e.target.checked)}
                      />
                      <span className={`text-sm ${duration !== 12 ? 'text-white/40' : 'text-white/80'}`}>Test Week 12</span>
                    </label>
                  </div>

                  <div>
                    <div className="text-sm text-white/70 mb-2">Weaknesses (optional, max 2)</div>
                    <div className="grid grid-cols-1 gap-2">
                      {WEAKNESS_OPTIONS.map((w) => {
                        const active = weaknesses.includes(w.key)
                        const disabled = !active && weaknesses.length >= 2
                        return (
                          <button
                            key={w.key}
                            type="button"
                            onClick={() => toggleWeakness(w.key)}
                            disabled={disabled}
                            className={active ? 'btn' : 'btn-ghost'}
                          >
                            {w.label}
                          </button>
                        )
                      })}
                    </div>
                    <div className="text-xs text-white/50 mt-2">
                      Selected: {weaknesses.length ? weaknesses.join(', ') : '—'}
                    </div>
                  </div>
                </>
              )}
            </div>

            <button onClick={submit} disabled={loading} className="btn-full">
              {loading ? 'Generating…' : 'Generate Plan'}
            </button>

            <p className="text-xs text-white/50">
              If plan generation fails, it usually means an exercise name is missing in the <code>exercises</code> table.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
