export type PlanKey = 'Beginner' | 'Intermediate'
export type DayName = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'

export const dayNames3: DayName[] = ['Mon', 'Wed', 'Fri']
export const dayNames5: DayName[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

type TemplateExercise = {
  name: string
  sets: number
  reps: number
  // for main lifts / variations we store percentage targets
  percentage?: number
  // for accessories
  rpe?: number
}

export type DayTemplate = {
  dayIndex: number
  dayName: DayName
  title: string
  exercises: TemplateExercise[]
}

export function getTemplate(plan: PlanKey, weekNumber: number, durationWeeks: number): DayTemplate[] {
  const is3 = plan === 'Beginner'
  const days = is3 ? dayNames3 : dayNames5

  // 12 weeks: 1-4 volume, 5-8 strength, 9-12 peak
  // 8 weeks: 1-3 volume, 4-6 strength, 7-8 peak (compressed)
  const phase = getPhase(weekNumber, durationWeeks)

  const pct = getMainLiftPercentages(phase, weekNumber, durationWeeks)

  // Simple fixed structure (expand later)
  if (is3) {
    return [
      {
        dayIndex: 1,
        dayName: days[0],
        title: `Day 1 (${days[0]})`,
        exercises: [
          { name: 'Squat', sets: pct.mainSets, reps: pct.mainReps, percentage: pct.squat },
          { name: 'Paused Squat', sets: 3, reps: 5, percentage: pct.squatVar },
          { name: 'Leg Press', sets: 3, reps: 10, rpe: 8 },
          { name: 'Hamstring Curl', sets: 3, reps: 12, rpe: 8 },
        ],
      },
      {
        dayIndex: 2,
        dayName: days[1],
        title: `Day 2 (${days[1]})`,
        exercises: [
          { name: 'Bench Press', sets: pct.mainSets, reps: pct.mainReps, percentage: pct.bench },
          { name: 'Spoto Press', sets: 3, reps: 6, percentage: pct.benchVar },
          { name: 'Lat Pulldown', sets: 4, reps: 10, rpe: 8 },
          { name: 'Triceps Pushdown', sets: 3, reps: 12, rpe: 8 },
        ],
      },
      {
        dayIndex: 3,
        dayName: days[2],
        title: `Day 3 (${days[2]})`,
        exercises: [
          { name: 'Deadlift', sets: pct.mainSets, reps: pct.mainReps, percentage: pct.deadlift },
          { name: 'RDL', sets: 3, reps: 6, percentage: pct.deadliftVar },
          { name: 'DB Row', sets: 4, reps: 10, rpe: 8 },
          { name: 'Lateral Raise', sets: 3, reps: 15, rpe: 8 },
        ],
      },
    ]
  }

  // Intermediate 5d: mehr Frequenz, weniger pro Einheit
  return [
    {
      dayIndex: 1,
      dayName: days[0],
      title: `Day 1 (${days[0]})`,
      exercises: [
        { name: 'Squat', sets: pct.mainSets5, reps: pct.mainReps5, percentage: pct.squat },
        { name: 'Leg Press', sets: 3, reps: 12, rpe: 8 },
      ],
    },
    {
      dayIndex: 2,
      dayName: days[1],
      title: `Day 2 (${days[1]})`,
      exercises: [
        { name: 'Bench Press', sets: pct.mainSets5, reps: pct.mainReps5, percentage: pct.bench },
        { name: 'Triceps Pushdown', sets: 3, reps: 12, rpe: 8 },
      ],
    },
    {
      dayIndex: 3,
      dayName: days[2],
      title: `Day 3 (${days[2]})`,
      exercises: [
        { name: 'Deadlift', sets: pct.mainSets5, reps: pct.mainReps5, percentage: pct.deadlift },
        { name: 'Hamstring Curl', sets: 3, reps: 12, rpe: 8 },
      ],
    },
    {
      dayIndex: 4,
      dayName: days[3],
      title: `Day 4 (${days[3]})`,
      exercises: [
        { name: 'Close Grip Bench', sets: 4, reps: 6, percentage: pct.benchVar },
        { name: 'Lat Pulldown', sets: 4, reps: 10, rpe: 8 },
      ],
    },
    {
      dayIndex: 5,
      dayName: days[4],
      title: `Day 5 (${days[4]})`,
      exercises: [
        { name: 'Tempo Squat', sets: 3, reps: 5, percentage: pct.squatVar },
        { name: 'DB Row', sets: 4, reps: 10, rpe: 8 },
        { name: 'Lateral Raise', sets: 3, reps: 15, rpe: 8 },
      ],
    },
  ]
}

function getPhase(week: number, duration: number): 'volume' | 'strength' | 'peak' {
  if (duration === 12) {
    if (week <= 4) return 'volume'
    if (week <= 8) return 'strength'
    return 'peak'
  }
  // 8-week compressed
  if (week <= 3) return 'volume'
  if (week <= 6) return 'strength'
  return 'peak'
}

function getMainLiftPercentages(phase: 'volume' | 'strength' | 'peak', week: number, duration: number) {
  // simple linear ramps (tune later)
  const w = week
  const ramp = duration === 12 ? (w - 1) / 11 : (w - 1) / 7

  const base = phase === 'volume' ? 0.68 : phase === 'strength' ? 0.78 : 0.86
  const add = 0.06 * ramp

  const main = clamp(base + add, 0.65, 0.92)

  return {
    squat: main,
    bench: clamp(main - 0.02, 0.62, 0.90),
    deadlift: clamp(main + 0.01, 0.65, 0.93),

    squatVar: clamp(main - 0.06, 0.55, 0.85),
    benchVar: clamp(main - 0.05, 0.55, 0.85),
    deadliftVar: clamp(main - 0.07, 0.55, 0.85),

    mainSets: phase === 'volume' ? 5 : phase === 'strength' ? 4 : 3,
    mainReps: phase === 'volume' ? 5 : phase === 'strength' ? 3 : 2,

    mainSets5: phase === 'volume' ? 4 : phase === 'strength' ? 3 : 3,
    mainReps5: phase === 'volume' ? 5 : phase === 'strength' ? 3 : 2,
  }
}

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x))
}