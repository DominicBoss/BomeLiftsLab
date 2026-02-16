'use client'

import React, { useMemo } from 'react'

type BaseLift = 'squat' | 'bench' | 'deadlift'
type LiftSeries = Record<BaseLift, number | null>

type TimelinePoint = {
  label: string
  planned: LiftSeries
  actual: LiftSeries
}

function LineChart2({
  title,
  subtitle,
  labels,
  planned,
  actual,
}: {
  title: string
  subtitle?: string
  labels: string[]
  planned: (number | null)[]
  actual: (number | null)[]
}) {
  const width = 900
  const height = 260
  const padding = { l: 44, r: 16, t: 18, b: 42 }

  const all = [...planned, ...actual].filter((v): v is number => v != null && Number.isFinite(v))
  const yMin = all.length ? Math.min(...all) : 0
  const yMax = all.length ? Math.max(...all) : 1
  const yRange = Math.max(1, yMax - yMin)

  const n = Math.max(1, labels.length)
  const xStep = (width - padding.l - padding.r) / Math.max(1, n - 1)

  const y = (v: number) => {
    const t = (v - yMin) / yRange
    return height - padding.b - t * (height - padding.t - padding.b)
  }
  const x = (i: number) => padding.l + i * xStep

  const mkPts = (values: (number | null)[]) => {
    const pts: string[] = []
    values.forEach((v, i) => {
      if (v == null) return
      pts.push(`${x(i)},${y(v)}`)
    })
    return pts.join(' ')
  }

  const mkDots = (values: (number | null)[], fill: string) => {
    return values.map((v, i) => {
      if (v == null) return null
      return <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={fill} />
    })
  }

  const yTicks = 4
  const ticks = Array.from({ length: yTicks + 1 }).map((_, i) => {
    const t = i / yTicks
    const val = yMin + (yMax - yMin) * (1 - t)
    const yy = padding.t + t * (height - padding.t - padding.b)
    return { val, yy }
  })

  // Colors
  const plannedStroke = 'rgba(255,255,255,0.35)' // grey line
  const plannedDot = 'rgba(255,255,255,0.55)'    // grey dots
  const actualStroke = 'rgba(59,130,246,0.95)'   // blue line
  const actualDot = 'rgba(59,130,246,0.95)'      // blue dots

  const plannedPts = mkPts(planned)
  const actualPts = mkPts(actual)

  return (
    <div className="rounded-lg border border-white/10 p-4">
      <div>
        <div className="font-medium">{title}</div>
        {subtitle ? <div className="text-xs text-white/50 mt-1">{subtitle}</div> : null}
      </div>

      <div className="mt-3 overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[700px] w-full">
          {/* grid + y labels */}
          {ticks.map((t, idx) => (
            <g key={idx}>
              <line
                x1={padding.l}
                x2={width - padding.r}
                y1={t.yy}
                y2={t.yy}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth="1"
              />
              <text x={8} y={t.yy + 4} fontSize="10" fill="rgba(255,255,255,0.5)">
                {Math.round(t.val)}
              </text>
            </g>
          ))}

          {/* axes */}
          <line x1={padding.l} x2={padding.l} y1={padding.t} y2={height - padding.b} stroke="rgba(255,255,255,0.2)" />
          <line x1={padding.l} x2={width - padding.r} y1={height - padding.b} y2={height - padding.b} stroke="rgba(255,255,255,0.2)" />

          {/* PLANNED line */}
          {plannedPts.length > 0 && (
            <polyline
              points={plannedPts}
              fill="none"
              stroke={plannedStroke}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* ACTUAL line */}
          {actualPts.length > 0 && (
            <polyline
              points={actualPts}
              fill="none"
              stroke={actualStroke}
              strokeWidth="2.5"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          )}

          {/* dots (this is the important part for 1-point weeks) */}
          {mkDots(planned, plannedDot)}
          {mkDots(actual, actualDot)}

          {/* x labels */}
          {labels.map((lab, i) => {
            if (n > 14 && i % 2 === 1) return null
            return (
              <text
                key={lab + i}
                x={x(i)}
                y={height - 18}
                fontSize="10"
                fill="rgba(255,255,255,0.45)"
                textAnchor="middle"
              >
                {lab}
              </text>
            )
          })}

          {/* legend */}
          <g>
            <rect x={padding.l + 10} y={padding.t + 6} width="10" height="2" fill={plannedStroke} />
            <text x={padding.l + 26} y={padding.t + 10} fontSize="10" fill="rgba(255,255,255,0.6)">
              Planned 1RM
            </text>

            <rect x={padding.l + 90} y={padding.t + 6} width="10" height="2" fill={actualStroke} />
            <text x={padding.l + 106} y={padding.t + 10} fontSize="10" fill="rgba(255,255,255,0.6)">
              Actual 1RM
            </text>
          </g>
        </svg>
      </div>
    </div>
  )
}

export default function DashboardCharts({ timeline }: { timeline: TimelinePoint[] }) {
  const labels = useMemo(() => timeline.map((p) => p.label), [timeline])

  const squatPlanned = useMemo(() => timeline.map((p) => p.planned.squat), [timeline])
  const benchPlanned = useMemo(() => timeline.map((p) => p.planned.bench), [timeline])
  const deadPlanned = useMemo(() => timeline.map((p) => p.planned.deadlift), [timeline])

  const squatActual = useMemo(() => timeline.map((p) => p.actual.squat), [timeline])
  const benchActual = useMemo(() => timeline.map((p) => p.actual.bench), [timeline])
  const deadActual = useMemo(() => timeline.map((p) => p.actual.deadlift), [timeline])

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <LineChart2
          title="Squat — planned vs actual 1RM"
          subtitle="Planned from planned weights/reps • Actual from logged weights/reps (no RPE)"
          labels={labels}
          planned={squatPlanned}
          actual={squatActual}
        />
        <LineChart2
          title="Bench — planned vs actual 1RM"
          subtitle="Planned from planned weights/reps • Actual from logged weights/reps (no RPE)"
          labels={labels}
          planned={benchPlanned}
          actual={benchActual}
        />
        <LineChart2
          title="Deadlift — planned vs actual 1RM"
          subtitle="Planned from planned weights/reps • Actual from logged weights/reps (no RPE)"
          labels={labels}
          planned={deadPlanned}
          actual={deadActual}
        />
      </div>
    </div>
  )
}