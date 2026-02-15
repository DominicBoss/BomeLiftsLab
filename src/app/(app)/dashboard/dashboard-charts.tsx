'use client'

import React, { useMemo } from 'react'

type E1rmPoint = {
  day: string // YYYY-MM-DD
  squat: number | null
  bench: number | null
  deadlift: number | null
}

type TonnagePoint = {
  week: string // YYYY-Wxx
  tonnage: number
}

function niceNumber(n: number) {
  if (!Number.isFinite(n)) return '0'
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`
  if (n >= 1000) return `${Math.round(n / 1000)}k`
  return `${Math.round(n)}`
}

function LineChart({
  title,
  subtitle,
  values,
}: {
  title: string
  subtitle?: string
  values: (number | null)[]
}) {
  const width = 900
  const height = 260
  const padding = { l: 44, r: 16, t: 18, b: 32 }

  const all = values.filter((v): v is number => v != null && Number.isFinite(v))
  const yMin = all.length ? Math.min(...all) : 0
  const yMax = all.length ? Math.max(...all) : 1
  const yRange = Math.max(1, yMax - yMin)

  const n = Math.max(1, values.length)
  const xStep = (width - padding.l - padding.r) / Math.max(1, n - 1)

  const y = (v: number) => {
    const t = (v - yMin) / yRange
    return height - padding.b - t * (height - padding.t - padding.b)
  }
  const x = (i: number) => padding.l + i * xStep

  const pts: string[] = []
  values.forEach((v, i) => {
    if (v == null) return
    pts.push(`${x(i)},${y(v)}`)
  })

  const yTicks = 4
  const ticks = Array.from({ length: yTicks + 1 }).map((_, i) => {
    const t = i / yTicks
    const val = yMin + (yMax - yMin) * (1 - t)
    const yy = padding.t + t * (height - padding.t - padding.b)
    return { val, yy }
  })

  return (
    <div className="rounded-lg border border-white/10 p-4">
      <div>
        <div className="font-medium">{title}</div>
        {subtitle ? <div className="text-xs text-white/50 mt-1">{subtitle}</div> : null}
      </div>

      <div className="mt-3 overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[700px] w-full">
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

          <line x1={padding.l} x2={padding.l} y1={padding.t} y2={height - padding.b} stroke="rgba(255,255,255,0.2)" />
          <line x1={padding.l} x2={width - padding.r} y1={height - padding.b} y2={height - padding.b} stroke="rgba(255,255,255,0.2)" />

          <polyline
            points={pts.join(' ')}
            fill="none"
            stroke="rgba(255,255,255,0.85)"
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      </div>
    </div>
  )
}

function BarChart({
  title,
  subtitle,
  points,
}: {
  title: string
  subtitle?: string
  points: { label: string; value: number }[]
}) {
  const width = 900
  const height = 240
  const padding = { l: 44, r: 16, t: 18, b: 46 }

  const max = Math.max(1, ...points.map((p) => p.value))
  const n = Math.max(1, points.length)
  const barW = (width - padding.l - padding.r) / n

  return (
    <div className="rounded-lg border border-white/10 p-4">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <div className="font-medium">{title}</div>
          {subtitle ? <div className="text-xs text-white/50 mt-1">{subtitle}</div> : null}
        </div>
        <div className="text-xs text-white/60">Max: {niceNumber(max)} kg</div>
      </div>

      <div className="mt-3 overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="min-w-[700px] w-full">
          <line x1={padding.l} x2={padding.l} y1={padding.t} y2={height - padding.b} stroke="rgba(255,255,255,0.2)" />
          <line x1={padding.l} x2={width - padding.r} y1={height - padding.b} y2={height - padding.b} stroke="rgba(255,255,255,0.2)" />

          {points.map((p, i) => {
            const h = (p.value / max) * (height - padding.t - padding.b)
            const x = padding.l + i * barW + barW * 0.15
            const w = barW * 0.7
            const y = height - padding.b - h
            return (
              <g key={p.label}>
                <rect x={x} y={y} width={w} height={h} fill="rgba(255,255,255,0.75)" rx="4" />
                <text
                  x={x + w / 2}
                  y={height - padding.b + 16}
                  fontSize="10"
                  fill="rgba(255,255,255,0.55)"
                  textAnchor="middle"
                >
                  {p.label}
                </text>
              </g>
            )
          })}
        </svg>
      </div>
    </div>
  )
}

export default function DashboardCharts({
  e1rmSeries,
  tonnageSeries,
}: {
  e1rmSeries: E1rmPoint[]
  tonnageSeries: TonnagePoint[]
}) {
  const squatValues = useMemo(() => e1rmSeries.map((p) => p.squat), [e1rmSeries])
  const benchValues = useMemo(() => e1rmSeries.map((p) => p.bench), [e1rmSeries])
  const deadliftValues = useMemo(() => e1rmSeries.map((p) => p.deadlift), [e1rmSeries])

  const bars = useMemo(
    () => tonnageSeries.map((p) => ({ label: p.week.replace('-', ' '), value: p.tonnage })),
    [tonnageSeries]
  )

  return (
    <div className="space-y-4">
      {/* 3 separate e1RM charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <LineChart
          title="Squat — best daily e1RM (last 90 days)"
          subtitle="tracking_mode=e1rm • base_lift=squat"
          values={squatValues}
        />
        <LineChart
          title="Bench — best daily e1RM (last 90 days)"
          subtitle="tracking_mode=e1rm • base_lift=bench"
          values={benchValues}
        />
        <LineChart
          title="Deadlift — best daily e1RM (last 90 days)"
          subtitle="tracking_mode=e1rm • base_lift=deadlift"
          values={deadliftValues}
        />
      </div>

      {/* Tonnage */}
      <div className="grid gap-4 lg:grid-cols-2">
        {bars.length ? (
          <BarChart title="Weekly tonnage (last 12 weeks)" subtitle="Sum of weight * reps (all exercises)" points={bars} />
        ) : (
          <div className="rounded-lg border border-white/10 p-4">
            <div className="font-medium">Weekly tonnage (last 12 weeks)</div>
            <p className="text-sm text-white/60 mt-2">No logs yet.</p>
          </div>
        )}
      </div>
    </div>
  )
}