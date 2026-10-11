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
  maker: "Ranger Tugs",
  model: "R-29",
  name: "Ranger Tugs R-29",
  headline: "How fast is it?",
  lede: "Rated speed for the Ranger Tugs R-29 — cruise for the miles, max for the reserve.",
  chartCeilingKn: 22,
  makerUrl: "https://www.rangertugs.com/models/model-category/r-29-s",
}

export const speeds: SpeedMode[] = [
  {
    id: "cruise",
    label: "Cruising speed",
    question: "Everyday pace",
    knots: 14.77,
    note: "Published cruising speed for the R-29 — the continuous pace where the tug covers ground without living at WOT.",
    accent: "#5ec8c0",
  },
  {
    id: "max",
    label: "Max speed",
    question: "Top end",
    knots: 17.38,
    note: "Published maximum for the R-29 — headroom above cruise when load and sea state allow.",
    accent: "#f0a35e",
  },
]

export const contextNotes = [
  {
    title: "Knots are the native unit",
    body: "One knot equals one nautical mile per hour. Charts, AIS, and passage plans all speak knots — mph and km/h are conversions for land reference.",
  },
  {
    title: "Cruise sits near 85% of max",
    body: "At 14.77 kn cruise against 17.38 kn max, the R-29’s cruise rating is about 85% of top speed — a semi-displacement tug balance of pace and efficiency.",
  },
  {
    title: "Real-world numbers move",
    body: "Load, sea state, fouling, and engine package (classic Yanmar 260 vs later Volvo D4 320) all shift results. Treat these as the published baseline for this R-29 rating.",
  },
]
