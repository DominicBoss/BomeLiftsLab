'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { generatePlanInDb } from '@/lib/generatePlan'
import type { PlanKey } from '@/lib/planTemplates'

export default function Onboarding() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)

  const [squat, setSquat] = useState('')
  const [bench, setBench] = useState('')
  const [deadlift, setDeadlift] = useState('')

  const [plan, setPlan] = useState<PlanKey>('Beginner')
  const [duration, setDuration] = useState<8 | 12>(12)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null)
    })
  }, [])

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

    setLoading(true)
    try {
      // Save 1RM
      const { error: pErr } = await supabase
        .from('profiles')
        .update({
          squat_1rm: s,
          bench_1rm: b,
          deadlift_1rm: d,
        })
        .eq('id', userId)

      if (pErr) throw new Error(pErr.message)

      // Generate plan
      await generatePlanInDb({ userId, plan, durationWeeks: duration })

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
            Enter your current 1RMs, choose a plan, and generate your first block.
          </p>
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

            <div className="space-y-3">
              <div>
                <div className="text-sm text-white/70 mb-1">Plan</div>
                <select
                  className="select"
                  value={plan}
                  onChange={(e) => setPlan(e.target.value as PlanKey)}
                >
                  <option value="Beginner">Beginner (3 days)</option>
                  <option value="Intermediate">Intermediate (5 days)</option>
                </select>
                <p className="text-xs text-white/50 mt-2">
                  Day names are fixed (Mon–Fri). You can customize later via Plan Builder.
                </p>
              </div>

              <div>
                <div className="text-sm text-white/70 mb-1">Duration</div>
                <select
                  className="select"
                  value={duration}
                  onChange={(e) => setDuration(Number(e.target.value) as 8 | 12)}
                >
                  <option value={8}>8 weeks</option>
                  <option value={12}>12 weeks</option>
                </select>
              </div>
            </div>

            <button onClick={submit} disabled={loading} className="btn-full">
              {loading ? 'Generating…' : 'Generate Plan'}
            </button>

            <p className="text-xs text-white/50">
              Your plan is generated based on percentages. Accessories are logged by weight + reps (optional RPE).
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}