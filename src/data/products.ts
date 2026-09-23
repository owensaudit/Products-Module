export type ClearanceRating = "excellent" | "strong" | "watch"

export type Motorhome = {
  id: string
  rank: number
  name: string
  maker: string
  tagline: string
  length: string
  interiorEmphasis: string
  chassis: string
  drivetrain: string
  gvwr: string
  wheelbase: string
  msrpFrom: string
  clearance: ClearanceRating
  clearanceNote: string
  whyClassy: string
  vsHq21: string[]
  fit: string
  url: string
  accent: string
}

/** Baseline: Black Series HQ21 off-road travel trailer */
export const hq21 = {
  name: "Black Series HQ21",
  type: "Off-road travel trailer",
  interiorLength: "21 ft",
  exteriorLength: "26 ft",
  exteriorWidth: "7 ft",
  exteriorHeight: "10 ft",
  dryWeight: "7,187 lbs",
  gvwr: "10,000 lbs",
  departureAngle: "~23°",
  note: "Hybrid box on a dual-axle chassis — strong departure for a trailer, but not a motorhome.",
}

export const products: Motorhome[] = [
  {
    id: "seneca-xt-29t",
    rank: 1,
    name: "Seneca XT 29T",
    maker: "Jayco",
    tagline: "Heavy-duty Super C with the shortest box that still beats your HQ21 living space.",
    length: "29' 10\"",
    interiorEmphasis: "~29 ft coach vs 21 ft HQ21 interior",
    chassis: "Ford F-550 4×4",
    drivetrain: "6.7L Power Stroke diesel · 4×4",
    gvwr: "19,500 lbs",
    wheelbase: "Compact Super C wheelbase · no-slide floorplan",
    msrpFrom: "~$250k–$300k class",
    clearance: "excellent",
    clearanceNote:
      "Shortest rear overhang in this set. 2\" BDS lift, all-terrain stance, and a tight overall length help when you reverse up a steep apron.",
    whyClassy:
      "Full-body Sikkens paint choices, hardwood cabinets, solid-surface counters — expedition look without a diesel-pusher’s long tail.",
    vsHq21: [
      "Self-propelled — no separate tow vehicle dance on the grade",
      "Wider residential box (8'+ vs 7' HQ21)",
      "Nearly 2× GVWR for true heavy-duty payload",
      "Lifted 4×4 chassis for approach/departure transitions",
    ],
    fit: "Best driveway pick. Start here if clearance is the deal-breaker.",
    url: "https://www.jayco.com/rvs/class-c-motorhomes/2026-seneca-xt/",
    accent: "#8b7355",
  },
  {
    id: "isata-5-28ss",
    rank: 2,
    name: "Isata 5 · 28SS",
    maker: "Dynamax",
    tagline: "The classiest compact Super C — residential finishes on a Ram 5500 4×4.",
    length: "31' 2\"",
    interiorEmphasis: "31 ft coach · one slide · bigger living volume than HQ21",
    chassis: "Ram 5500 SLT 4×4",
    drivetrain: "Cummins 6.7L · 360 hp / 800 lb-ft · 4×4",
    gvwr: "19,500 lbs",
    wheelbase: "217\" — shorter than Verona; mind breakover on sharp crowns",
    msrpFrom: "~$285k–$300k MSRP",
    clearance: "strong",
    clearanceNote:
      "Truck-chassis Super C beats a long Class A on rear overhang. Still measure your driveway: the shorter wheelbase can scrape mid-coach on severe transitions.",
    whyClassy:
      "Hardwood craftsman cabinetry, solid surface, full-body paint options, and Dynamax’s residential detailing — the “dressier” sibling to trail-first builds.",
    vsHq21: [
      "True motorhome living with private bath and residential fridge options",
      "8 ft width and taller interior height than the HQ21 box",
      "10,000 lb tow hitch if you keep a toy or small trailer",
      "Optional Xplorer all-season package for four-season use",
    ],
    fit: "Best blend of class and size without jumping to a 36+ footer.",
    url: "https://www.dynamaxcorp.com/",
    accent: "#6b7c6e",
  },
  {
    id: "rebel-30r",
    rank: 3,
    name: "Rebel 30R",
    maker: "NeXus RV",
    tagline: "Steel-cage Super C built heavy — adventure chassis with residential bones.",
    length: "30' 11\"",
    interiorEmphasis: "Nearly 31 ft overall · large roadside slide living area",
    chassis: "International or Chevy 6500 4×4",
    drivetrain: "Duramax diesel · Allison · 4×4",
    gvwr: "22,000 lbs",
    wheelbase: "243\"",
    msrpFrom: "Often aggressive street pricing vs peers",
    clearance: "strong",
    clearanceNote:
      "4×4 truck chassis and ~31 ft length keep the rear mass closer to the axle than a diesel pusher. Confirm hitch height on your specific unit before committing.",
    whyClassy:
      "Solid-surface counters, premium flooring, and a composite steel cage that feels more “armored coach” than lightweight camp trailer.",
    vsHq21: [
      "HSLA steel framework rated far stronger than typical aluminum stick builds",
      "Higher GVWR (22k) for gear-heavy travel",
      "Bigger fresh-water capacity for longer stays",
      "Self-contained motorhome footprint still close to trailer length",
    ],
    fit: "Choose when you want max structure and value in a ~31 ft package.",
    url: "https://nexusrv.com/motorhomes/rebel",
    accent: "#7a5c45",
  },
  {
    id: "verona-36vsb",
    rank: 4,
    name: "Verona 36VSB",
    maker: "Renegade RV",
    tagline: "Luxury Super C — bigger box, longer wheelbase, still better rear geometry than a DP.",
    length: "36' 8\"",
    interiorEmphasis: "Largest living volume here — well past the HQ21 interior",
    chassis: "Freightliner M2 Super C",
    drivetrain: "Cummins diesel · Allison",
    gvwr: "Super C truck ratings (model-year dependent)",
    wheelbase: "285\" — long wheelbase helps departure vs short-WB peers",
    msrpFrom: "Premium / upper Super C tier",
    clearance: "watch",
    clearanceNote:
      "Owners report ~15.5\" hitch clearance (~17\" with bags up) and roughly 9 ft axle-to-hitch — better than many Class A pushers, but this is a much bigger coach. Test your driveway.",
    whyClassy:
      "Hardwood cabinets, polished solid surfaces, stainless appliances — the dress-up pick when “classy” outranks compact.",
    vsHq21: [
      "Nearly 37 ft of coach living vs 21 ft interior",
      "Residential furniture and storage throughout",
      "Air-bag rear can raise for driveway transitions",
      "Still shorter rear overhang than typical diesel pushers",
    ],
    fit: "Only if the driveway clears a mid-30s Super C on a test drive.",
    url: "https://www.renegaderv.com/rvmodel/verona/",
    accent: "#5c6b7a",
  },
]

export const clearanceGuide = [
  {
    title: "Measure departure, not just length",
    body: "Your steep driveway cares about rear overhang (axle to bumper/hitch) and the angle change at the apron — not marketing length alone.",
  },
  {
    title: "Prefer Super C over diesel pusher",
    body: "Class A diesel pushers often hang a long tail behind the drive axle. Super Cs keep more mass over the truck chassis — usually kinder when reversing up a grade.",
  },
  {
    title: "Test reverse before you buy",
    body: "Bring the exact floorplan to your driveway. Inflate air bags if equipped, remove any low hitch accessories, and watch the rear cap and stairs.",
  },
  {
    title: "Avoid long Class A “bigger box” traps",
    body: "A 38–42 ft pusher may feel like the upgrade from an HQ21, but the rear geometry often fails steep backing — even when ground clearance looks fine on flat pavement.",
  },
]
