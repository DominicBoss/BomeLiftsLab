'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { generatePlanInDb } from '@/lib/generatePlan'
import { allDayNames, type DayName, type PlanKey } from '@/lib/planTemplates'

type Proficiency = 'Beginner' | 'Advanced'

export default function Onboarding() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  const [squat, setSquat] = useState('')
  const [bench, setBench] = useState('')
  const [deadlift, setDeadlift] = useState('')

  const plan: PlanKey = 'PerformanceBased'

  const [days, setDays] = useState<DayName[]>(['Mon', 'Tue', 'Thu', 'Sat'])
  const [proficiency, setProficiency] = useState<Proficiency>('Beginner')

  const [deloadAfterWeek8, setDeloadAfterWeek8] = useState(true)
  const [deloadAfterWeek10, setDeloadAfterWeek10] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null)
    })
  }, [])

  const durationLabel = useMemo(() => {
    const extra = (deloadAfterWeek8 ? 1 : 0) + (deloadAfterWeek10 ? 1 : 0)
    return 10 + extra
  }, [deloadAfterWeek8, deloadAfterWeek10])

  const toggleDay = (d: DayName) => {
    setDays((prev) => {
      const has = prev.includes(d)
      if (has) return prev.filter((x) => x !== d)
      return [...prev, d]
    })
  }

  const submit = async () => {
    if (!userId) {
      alert('Not logged in.')
      router.push('/auth/login')
      return
    }

    if (days.length < 3 || days.length > 6) {
      alert('Please select between 3 and 6 training days.')
      return
    }

    const s = Number(squat)
    const b = Number(bench)
    const d = Number(deadlift)

    if (!Number.isFinite(s) || !Number.isFinite(b) || !Number.isFinite(d) || s <= 0 || b <= 0 || d <= 0) {
      alert('Please enter valid 1RM values (kg).')
      return
    }

    setLoading(true)
    try {
      const { error: pErr } = await supabase
        .from('profiles')
        .update({ squat_1rm: s, bench_1rm: b, deadlift_1rm: d })
        .eq('id', userId)

      if (pErr) throw new Error(pErr.message)

      await generatePlanInDb({
        userId,
        plan,
        daysOfWeek: days,
        deloadAfterWeek8,
        deloadAfterWeek10,
        oneRMs: { squat: s, bench: b, deadlift: d },
        proficiency,
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
          <p className="p-muted mt-2">
            Static SBD plan (10 weeks). Choose 3–6 training days. Planned weights are generated and stored.
          </p>
        </div>

        <div className="card">
          <div className="space-y-5">
            <div className="space-y-3">
              <div>
                <div className="text-sm text-white/70 mb-1">Squat 1RM (kg)</div>
                <input className="input" inputMode="decimal" value={squat} onChange={(e) => setSquat(e.target.value)} />
              </div>
              <div>
                <div className="text-sm text-white/70 mb-1">Bench 1RM (kg)</div>
                <input className="input" inputMode="decimal" value={bench} onChange={(e) => setBench(e.target.value)} />
              </div>
              <div>
                <div className="text-sm text-white/70 mb-1">Deadlift 1RM (kg)</div>
                <input className="input" inputMode="decimal" value={deadlift} onChange={(e) => setDeadlift(e.target.value)} />
              </div>
            </div>

            <div className="h-px bg-white/10" />

            <div>
              <div className="text-sm text-white/70 mb-2">Level</div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setProficiency('Beginner')} className={`btn ${proficiency === 'Beginner' ? '' : 'opacity-60'}`}>
                  Beginner
                </button>
                <button type="button" onClick={() => setProficiency('Advanced')} className={`btn ${proficiency === 'Advanced' ? '' : 'opacity-60'}`}>
                  Advanced
                </button>
              </div>
              <p className="text-xs text-white/50 mt-2">
                Advanced = more bench exposure + optional squat/deadlift tertiary work.
              </p>
            </div>

            <div>
              <div className="text-sm text-white/70 mb-2">Training days (select 3–6)</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {allDayNames.map((d) => {
                  const active = days.includes(d)
                  return (
                    <button key={d} type="button" onClick={() => toggleDay(d)} className={`btn ${active ? '' : 'opacity-60'}`}>
                      {d}
                    </button>
                  )
                })}
              </div>
              <p className="text-xs text-white/50 mt-2">
                Selected days map to Tag 1–{days.length} in order.
              </p>
            </div>

            <div className="h-px bg-white/10" />

            <div className="space-y-2">
              <label className="flex items-center gap-3 text-sm text-white/70">
                <input type="checkbox" checked={deloadAfterWeek8} onChange={(e) => setDeloadAfterWeek8(e.target.checked)} />
                Deload after Strength Block (after Week 8)
              </label>

              <label className="flex items-center gap-3 text-sm text-white/70">
                <input type="checkbox" checked={deloadAfterWeek10} onChange={(e) => setDeloadAfterWeek10(e.target.checked)} />
                Deload after Peaking (after Week 10)
              </label>

              <p className="text-xs text-white/50">
                Total timeline: {durationLabel} weeks (10 + optional deloads). Week numbers stay 1–10; deloads are marked.
              </p>
            </div>

            <button onClick={submit} disabled={loading} className="btn-full">
              {loading ? 'Generating…' : 'Generate Plan'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}