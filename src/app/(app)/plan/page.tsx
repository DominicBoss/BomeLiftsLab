import { createClient } from '@/utils/supabase/server'
import { roundTo2_5 } from '@/lib/rounding'
import { base1rmForBaseLift, type BaseLift } from '@/lib/lift1rm'

type Profile = {
  squat_1rm: number | null
  bench_1rm: number | null
  deadlift_1rm: number | null
}

const DAY_LABEL: Record<number, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
}

export default async function PlanPage() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getUser()
  const user = auth.user
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('squat_1rm, bench_1rm, deadlift_1rm')
    .eq('id', user.id)
    .single<Profile>()

  const rms = {
    squat: Number(profile?.squat_1rm ?? 0),
    bench: Number(profile?.bench_1rm ?? 0),
    deadlift: Number(profile?.deadlift_1rm ?? 0),
  }

  const { data: plan } = await supabase
    .from('plans')
    .select('id,name,duration_weeks,start_date')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .single()

  if (!plan) {
    return (
      <div className="card">
        <div className="h1">No active plan</div>
        <p className="p-muted mt-2">Go to onboarding and generate one.</p>
        <div className="mt-4">
          <a className="btn" href="/onboarding">
            Create plan
          </a>
        </div>
      </div>
    )
  }

  const { data: gen } = await supabase
    .from('plan_generation_inputs')
    .select('days_of_week,duration_weeks,deload_week4,deload_week8,test_week12,weaknesses')
    .eq('plan_id', plan.id)
    .maybeSingle()

  const dayLabels =
    gen?.days_of_week && Array.isArray(gen.days_of_week)
      ? (gen.days_of_week as number[]).map((d) => DAY_LABEL[d] ?? String(d)).join(', ')
      : null

  const optionsText = gen
    ? [
        dayLabels ? `days: ${dayLabels}` : null,
        gen.deload_week4 ? 'deload W4' : null,
        gen.deload_week8 ? 'deload W8' : null,
        gen.test_week12 ? 'test W12' : null,
        gen.weaknesses?.length ? `weaknesses: ${(gen.weaknesses as string[]).join(', ')}` : null,
      ]
        .filter(Boolean)
        .join(' • ')
    : null

  const { data: weeks } = await supabase
    .from('plan_weeks')
    .select(
      `
      id,
      week_number,
      workouts (
        id,
        day_number,
        name,
        workout_exercises (
          id,
          target_sets,
          target_reps,
          target_percentage,
          target_rpe,
          exercise:exercises ( id, name, is_main_lift, base_lift, tracking_mode )
        )
      )
    `
    )
    .eq('plan_id', plan.id)
    .order('week_number', { ascending: true })

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="h1">Plan Overview</div>
            <p className="p-muted mt-2">
              {plan.name} • {plan.duration_weeks} weeks • start {plan.start_date}
              {optionsText ? ` • ${optionsText}` : ''}
            </p>
          </div>

          <a className="btn" href="/onboarding">
            Change plan
          </a>
        </div>
      </div>

      {weeks?.map((w: any) => (
        <div key={w.id} className="card">
          <div className="flex items-baseline justify-between">
            <div className="h1">Week {w.week_number}</div>
          </div>

          <div className="mt-4 space-y-4">
            {(w.workouts ?? [])
              .sort((a: any, b: any) => a.day_number - b.day_number)
              .map((wo: any) => (
                <div key={wo.id} className="rounded-lg border border-white/10 p-4">
                  <div className="font-medium">{wo.name ?? `Day ${wo.day_number}`}</div>

                  <div className="mt-3 space-y-2">
                    {(wo.workout_exercises ?? []).map((we: any) => {
                      const exName = we.exercise?.name ?? 'Exercise'
                      const pct = we.target_percentage ? Number(we.target_percentage) : null

                      let targetText = `${we.target_sets} x ${we.target_reps}`
                      if (pct) {
                        const baseLift = (we.exercise?.base_lift ?? 'other') as BaseLift
                        const base = base1rmForBaseLift(baseLift, rms)
                        const kg = base > 0 ? roundTo2_5(base * pct) : null
                        targetText += ` @ ${(pct * 100).toFixed(0)}%${kg !== null ? ` (~${kg} kg)` : ''}`
                      } else if (we.target_rpe) {
                        targetText += ` @ RPE ${we.target_rpe}`
                      }

                      return (
                        <div key={we.id} className="flex items-center justify-between gap-4">
                          <div className="text-white/90">{exName}</div>
                          <div className="text-white/60 text-sm">{targetText}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
  )
}
