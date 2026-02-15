'use client'

import { useMemo, useState } from 'react'

type WorkoutHistoryItem = {
  workout_id: string
  title: string
  day_number: number
  week_number: number | null
  plan_name: string | null
  is_active_plan: boolean | null
  last_logged_at: string
  tonnage: number
  best_e1rm: { squat: number | null; bench: number | null; deadlift: number | null }
}

// Deterministic formatting to avoid hydration mismatch
const nf = new Intl.NumberFormat('de-CH')
const df = new Intl.DateTimeFormat('de-CH', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

function fmtDate(iso: string) {
  const d = new Date(iso)
  return df.format(d)
}

export default function HistoryClient({ initialItems }: { initialItems: WorkoutHistoryItem[] }) {
  const [q, setQ] = useState('')
  const [onlyActivePlan, setOnlyActivePlan] = useState(false)

  const items = useMemo(() => {
    const query = q.trim().toLowerCase()
    return initialItems.filter((it) => {
      if (onlyActivePlan && it.is_active_plan !== true) return false
      if (!query) return true
      const hay = `${it.title} ${it.plan_name ?? ''} week ${it.week_number ?? ''}`.toLowerCase()
      return hay.includes(query)
    })
  }, [initialItems, q, onlyActivePlan])

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="h1">History</div>
        <p className="p-muted mt-2">All completed workouts (has logs).</p>
      </div>

      <div className="card flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <input
          className="input w-full md:max-w-sm"
          placeholder="Search (e.g. bench, week 3, intermediate)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input
            type="checkbox"
            checked={onlyActivePlan}
            onChange={(e) => setOnlyActivePlan(e.target.checked)}
          />
          Only active plan
        </label>
      </div>

      <div className="card">
        {items.length === 0 ? (
          <p className="text-sm text-white/60">No history found.</p>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.workout_id} className="border border-white/10 rounded-lg p-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="font-medium">{it.title}</div>
                    <div className="text-xs text-white/50 mt-1">
                      {it.plan_name ? (
                        <>
                          {it.plan_name}
                          {it.week_number != null ? ` • Week ${it.week_number}` : ''}
                          {it.is_active_plan ? ' • active' : ''}
                        </>
                      ) : (
                        <>Workout</>
                      )}
                      {' • '}
                      Last logged: {fmtDate(it.last_logged_at)}
                    </div>
                  </div>

                  <a className="link" href={`/workout/${it.workout_id}`}>
                    Open
                  </a>
                </div>

                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <div className="text-sm text-white/70">
                    <span className="text-white/50">Tonnage:</span> {nf.format(it.tonnage)} kg
                  </div>

                  <div className="text-sm text-white/70">
                    <span className="text-white/50">Best e1RM:</span>{' '}
                    {[
                      it.best_e1rm.squat != null ? `S ${nf.format(it.best_e1rm.squat)}` : null,
                      it.best_e1rm.bench != null ? `B ${nf.format(it.best_e1rm.bench)}` : null,
                      it.best_e1rm.deadlift != null ? `D ${nf.format(it.best_e1rm.deadlift)}` : null,
                    ]
                      .filter(Boolean)
                      .join(' • ') || '—'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}