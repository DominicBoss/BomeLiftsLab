export type PlanKey = 'PerformanceBased'
export type DayName = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun'

export const allDayNames: DayName[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export type TemplateBlock = {
  base_lift: 'squat' | 'bench' | 'deadlift'
  sets: number
  reps: number
  rpe: number
}

export type DayTemplate = {
  dayIndex: number // 1..4
  dayName: DayName
  title: string
  blocks: TemplateBlock[]
}

export type WeekTemplate = {
  week: number // 1..10
  // PerformanceBased braucht aktuell nur dayIndex + blocks.
  // Explizit tippen, damit Consumer (generatePlan.ts) dayIndex sicher lesen kann.
  days: Array<Pick<DayTemplate, 'dayIndex' | 'blocks'>>
}

const PERFORMANCE_BASED: WeekTemplate[] = [
  // W1
  {
    week: 1,
    days: [
      { dayIndex: 1, blocks: [{ base_lift: 'squat', sets: 5, reps: 5, rpe: 6.5 }, { base_lift: 'bench', sets: 5, reps: 5, rpe: 6.5 }] },
      { dayIndex: 2, blocks: [{ base_lift: 'bench', sets: 4, reps: 6, rpe: 6 }, { base_lift: 'deadlift', sets: 3, reps: 3, rpe: 6 }] },
      { dayIndex: 3, blocks: [{ base_lift: 'squat', sets: 4, reps: 6, rpe: 6 }, { base_lift: 'bench', sets: 6, reps: 4, rpe: 6 }] },
      { dayIndex: 4, blocks: [{ base_lift: 'deadlift', sets: 4, reps: 5, rpe: 6 }, { base_lift: 'bench', sets: 3, reps: 5, rpe: 6 }] },
    ],
  },
  // W2
  {
    week: 2,
    days: [
      { dayIndex: 1, blocks: [{ base_lift: 'squat', sets: 5, reps: 5, rpe: 7 }, { base_lift: 'bench', sets: 5, reps: 5, rpe: 7 }] },
      { dayIndex: 2, blocks: [{ base_lift: 'bench', sets: 4, reps: 6, rpe: 6.5 }, { base_lift: 'deadlift', sets: 3, reps: 3, rpe: 6.5 }] },
      { dayIndex: 3, blocks: [{ base_lift: 'squat', sets: 4, reps: 6, rpe: 6.5 }, { base_lift: 'bench', sets: 6, reps: 4, rpe: 6 }] },
      { dayIndex: 4, blocks: [{ base_lift: 'deadlift', sets: 4, reps: 5, rpe: 6.5 }, { base_lift: 'bench', sets: 3, reps: 5, rpe: 6.5 }] },
    ],
  },
  // W3
  {
    week: 3,
    days: [
      { dayIndex: 1, blocks: [{ base_lift: 'squat', sets: 4, reps: 6, rpe: 7 }, { base_lift: 'bench', sets: 4, reps: 6, rpe: 7 }] },
      { dayIndex: 2, blocks: [{ base_lift: 'bench', sets: 4, reps: 6, rpe: 7 }, { base_lift: 'deadlift', sets: 3, reps: 3, rpe: 7 }] },
      { dayIndex: 3, blocks: [{ base_lift: 'squat', sets: 3, reps: 8, rpe: 7 }, { base_lift: 'bench', sets: 5, reps: 5, rpe: 6.5 }] },
      { dayIndex: 4, blocks: [{ base_lift: 'deadlift', sets: 4, reps: 4, rpe: 7 }, { base_lift: 'bench', sets: 3, reps: 5, rpe: 6.5 }] },
    ],
  },
  // W4
  {
    week: 4,
    days: [
      { dayIndex: 1, blocks: [{ base_lift: 'squat', sets: 5, reps: 5, rpe: 7.5 }, { base_lift: 'bench', sets: 5, reps: 5, rpe: 7.5 }] },
      { dayIndex: 2, blocks: [{ base_lift: 'bench', sets: 4, reps: 5, rpe: 7 }, { base_lift: 'deadlift', sets: 3, reps: 3, rpe: 7 }] },
      { dayIndex: 3, blocks: [{ base_lift: 'squat', sets: 3, reps: 6, rpe: 7 }, { base_lift: 'bench', sets: 5, reps: 4, rpe: 6.5 }] },
      { dayIndex: 4, blocks: [{ base_lift: 'deadlift', sets: 4, reps: 4, rpe: 7.5 }, { base_lift: 'bench', sets: 3, reps: 5, rpe: 7 }] },
    ],
  },
  // W5
  {
    week: 5,
    days: [
      { dayIndex: 1, blocks: [{ base_lift: 'squat', sets: 1, reps: 1, rpe: 8 }, { base_lift: 'squat', sets: 4, reps: 4, rpe: 7 }, { base_lift: 'bench', sets: 5, reps: 3, rpe: 7 }] },
      { dayIndex: 2, blocks: [{ base_lift: 'bench', sets: 1, reps: 1, rpe: 8 }, { base_lift: 'deadlift', sets: 3, reps: 3, rpe: 7 }] },
      { dayIndex: 3, blocks: [{ base_lift: 'squat', sets: 4, reps: 4, rpe: 7 }, { base_lift: 'bench', sets: 6, reps: 2, rpe: 6.5 }] },
      { dayIndex: 4, blocks: [{ base_lift: 'deadlift', sets: 1, reps: 1, rpe: 8 }, { base_lift: 'bench', sets: 3, reps: 4, rpe: 7 }] },
    ],
  },
  // W6
  {
    week: 6,
    days: [
      { dayIndex: 1, blocks: [{ base_lift: 'squat', sets: 1, reps: 1, rpe: 8 }, { base_lift: 'squat', sets: 4, reps: 3, rpe: 7.5 }, { base_lift: 'bench', sets: 4, reps: 4, rpe: 7.5 }] },
      { dayIndex: 2, blocks: [{ base_lift: 'bench', sets: 1, reps: 1, rpe: 8 }, { base_lift: 'deadlift', sets: 3, reps: 3, rpe: 7.5 }] },
      { dayIndex: 3, blocks: [{ base_lift: 'squat', sets: 4, reps: 3, rpe: 7.5 }, { base_lift: 'bench', sets: 5, reps: 2, rpe: 7 }] },
      { dayIndex: 4, blocks: [{ base_lift: 'deadlift', sets: 1, reps: 1, rpe: 8 }, { base_lift: 'bench', sets: 3, reps: 3, rpe: 7.5 }] },
    ],
  },
  // W7
  {
    week: 7,
    days: [
      { dayIndex: 1, blocks: [{ base_lift: 'squat', sets: 1, reps: 1, rpe: 8.5 }, { base_lift: 'squat', sets: 3, reps: 3, rpe: 8 }, { base_lift: 'bench', sets: 4, reps: 3, rpe: 8 }] },
      { dayIndex: 2, blocks: [{ base_lift: 'bench', sets: 1, reps: 1, rpe: 8.5 }, { base_lift: 'deadlift', sets: 3, reps: 2, rpe: 8 }] },
      { dayIndex: 3, blocks: [{ base_lift: 'squat', sets: 3, reps: 3, rpe: 8 }, { base_lift: 'bench', sets: 5, reps: 2, rpe: 7 }] },
      { dayIndex: 4, blocks: [{ base_lift: 'deadlift', sets: 1, reps: 1, rpe: 8.5 }, { base_lift: 'bench', sets: 3, reps: 3, rpe: 8 }] },
    ],
  },
  // W8
  {
    week: 8,
    days: [
      { dayIndex: 1, blocks: [{ base_lift: 'squat', sets: 1, reps: 1, rpe: 9 }, { base_lift: 'squat', sets: 2, reps: 3, rpe: 8 }, { base_lift: 'bench', sets: 3, reps: 3, rpe: 8 }] },
      { dayIndex: 2, blocks: [{ base_lift: 'bench', sets: 1, reps: 1, rpe: 9 }, { base_lift: 'deadlift', sets: 2, reps: 2, rpe: 8 }] },
      { dayIndex: 3, blocks: [{ base_lift: 'squat', sets: 2, reps: 3, rpe: 8 }, { base_lift: 'bench', sets: 4, reps: 2, rpe: 7 }] },
      { dayIndex: 4, blocks: [{ base_lift: 'deadlift', sets: 1, reps: 1, rpe: 8.5 }, { base_lift: 'bench', sets: 3, reps: 2, rpe: 8 }] },
    ],
  },
  // W9
  {
    week: 9,
    days: [
      { dayIndex: 1, blocks: [{ base_lift: 'squat', sets: 1, reps: 1, rpe: 8.5 }, { base_lift: 'squat', sets: 3, reps: 2, rpe: 7.5 }, { base_lift: 'bench', sets: 3, reps: 2, rpe: 7.5 }] },
      { dayIndex: 2, blocks: [{ base_lift: 'bench', sets: 1, reps: 1, rpe: 8.5 }, { base_lift: 'deadlift', sets: 3, reps: 2, rpe: 7.5 }] },
      { dayIndex: 3, blocks: [{ base_lift: 'squat', sets: 3, reps: 2, rpe: 7.5 }, { base_lift: 'bench', sets: 4, reps: 1, rpe: 7 }] },
      { dayIndex: 4, blocks: [{ base_lift: 'deadlift', sets: 1, reps: 1, rpe: 8 }, { base_lift: 'bench', sets: 3, reps: 2, rpe: 7.5 }] },
    ],
  },
  // W10
  {
    week: 10,
    days: [
      { dayIndex: 1, blocks: [{ base_lift: 'squat', sets: 1, reps: 1, rpe: 9 }, { base_lift: 'squat', sets: 2, reps: 2, rpe: 8 }, { base_lift: 'bench', sets: 3, reps: 2, rpe: 8 }] },
      { dayIndex: 2, blocks: [{ base_lift: 'bench', sets: 1, reps: 1, rpe: 9 }, { base_lift: 'deadlift', sets: 2, reps: 2, rpe: 8 }] },
      { dayIndex: 3, blocks: [{ base_lift: 'squat', sets: 2, reps: 2, rpe: 8 }, { base_lift: 'bench', sets: 3, reps: 1, rpe: 7 }] },
      { dayIndex: 4, blocks: [{ base_lift: 'deadlift', sets: 1, reps: 1, rpe: 9 }, { base_lift: 'bench', sets: 2, reps: 2, rpe: 8 }] },
    ],
  },
]

export const DELOAD_TEMPLATE: Array<Pick<DayTemplate, 'dayIndex' | 'blocks'>> = [
  { dayIndex: 1, blocks: [{ base_lift: 'squat', sets: 3, reps: 3, rpe: 6 }, { base_lift: 'bench', sets: 3, reps: 4, rpe: 6 }] },
  { dayIndex: 2, blocks: [{ base_lift: 'bench', sets: 3, reps: 3, rpe: 6 }, { base_lift: 'deadlift', sets: 2, reps: 3, rpe: 6 }] },
  { dayIndex: 3, blocks: [{ base_lift: 'squat', sets: 3, reps: 3, rpe: 6 }, { base_lift: 'bench', sets: 3, reps: 3, rpe: 6 }] },
  { dayIndex: 4, blocks: [{ base_lift: 'deadlift', sets: 2, reps: 2, rpe: 6 }, { base_lift: 'bench', sets: 2, reps: 3, rpe: 6 }] },
]

export function getPerformanceBasedWeek(weekNumber: number): WeekTemplate {
  const w = PERFORMANCE_BASED.find((x) => x.week === weekNumber)
  if (!w) throw new Error(`No template for week ${weekNumber}`)
  return w
}