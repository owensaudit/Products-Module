const KN_TO_MPH = 1.150779
const KN_TO_KMH = 1.852

export type SpeedMode = {
  id: "cruise" | "max"
  label: string
  question: string
  knots: number
  note: string
  accent: string
}

function round1(n: number) {
  return Math.round(n * 10) / 10
}

export function toMph(knots: number) {
  return round1(knots * KN_TO_MPH)
}

export function toKmh(knots: number) {
  return round1(knots * KN_TO_KMH)
}

export const vessel = {
  brand: "Products Module",
  name: "Vessel speeds",
  headline: "How fast is it?",
  lede: "Two published operating points — the pace you live at, and the ceiling when you ask for more.",
  chartCeilingKn: 22,
}

export const speeds: SpeedMode[] = [
  {
    id: "cruise",
    label: "Cruising speed",
    question: "Everyday pace",
    knots: 14.77,
    note: "The continuous operating speed — efficient, settled, and where the hull spends most of its miles.",
    accent: "#5ec8c0",
  },
  {
    id: "max",
    label: "Max speed",
    question: "Top end",
    knots: 17.38,
    note: "The published maximum — useful headroom above cruise when conditions and load allow.",
    accent: "#f0a35e",
  },
]

export const contextNotes = [
  {
    title: "Knots are the native unit",
    body: "One knot equals one nautical mile per hour. Charts, AIS, and passage plans all speak knots — mph and km/h are conversions for land reference.",
  },
  {
    title: "Cruise vs max is a ratio",
    body: "At 14.77 kn cruise against 17.38 kn max, cruise sits at about 85% of top speed — typical for a displacement or semi-displacement hull that prefers efficiency over sprint.",
  },
  {
    title: "Real-world numbers move",
    body: "Load, sea state, fouling, and wind shift both figures. Treat these as the published baseline, not a guarantee on every day.",
  },
]
