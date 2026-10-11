import { useState, useTransition, type CSSProperties } from "react"
import {
  contextNotes,
  speeds,
  toKmh,
  toMph,
  vessel,
  type SpeedMode,
} from "./data/speeds"
import "./App.css"

function App() {
  const [selectedId, setSelectedId] = useState<SpeedMode["id"]>("cruise")
  const [isPending, startTransition] = useTransition()
  const selected = speeds.find((s) => s.id === selectedId) ?? speeds[0]

  const selectMode = (id: SpeedMode["id"]) => {
    startTransition(() => setSelectedId(id))
  }

  return (
    <div className="page">
      <header className="hero">
        <div className="hero__atmosphere" aria-hidden="true" />
        <div className="hero__wake" aria-hidden="true" />
        <nav className="nav">
          <span className="nav__mark">{vessel.brand}</span>
          <a className="nav__link" href="#speeds">
            Speeds
          </a>
        </nav>

        <div className="hero__copy">
          <p className="brand reveal">{vessel.brand}</p>
          <h1 className="headline reveal reveal--delay">{vessel.headline}</h1>
          <p className="lede reveal reveal--delay-2">{vessel.lede}</p>
          <div className="cta-row reveal reveal--delay-3">
            <a className="cta cta--primary" href="#speeds">
              See cruise &amp; max
            </a>
            <a className="cta cta--ghost" href="#context">
              Read the numbers
            </a>
          </div>
        </div>
      </header>

      <section className="speeds" id="speeds" aria-labelledby="speeds-title">
        <div className="section-head">
          <p className="eyebrow">Ranger Tugs R-29 · published performance</p>
          <h2 id="speeds-title">Cruise holds the day. Max is the reserve.</h2>
          <p className="section-lede">
            Toggle between the two rated speeds — cruising 14.77 kn and max 17.38 kn.
          </p>
        </div>

        <div className="picker" role="tablist" aria-label="Speed modes">
          {speeds.map((mode) => (
            <button
              key={mode.id}
              type="button"
              role="tab"
              aria-selected={mode.id === selected.id}
              className={`picker__btn${mode.id === selected.id ? " is-active" : ""}`}
              style={{ "--accent": mode.accent } as CSSProperties}
              onClick={() => selectMode(mode.id)}
            >
              <span className="picker__label">{mode.label}</span>
              <span className="picker__value">
                {mode.knots.toFixed(2)}
                <abbr title="knots">kn</abbr>
              </span>
            </button>
          ))}
        </div>

        <article
          className={`detail${isPending ? " is-pending" : ""}`}
          style={{ "--accent": selected.accent } as CSSProperties}
          aria-live="polite"
        >
          <div className="detail__visual">
            <p className="detail__mode">{selected.question}</p>
            <h3 className="detail__title">{selected.label}</h3>
            <p className="detail__knots">
              <span className="detail__number">{selected.knots.toFixed(2)}</span>
              <span className="detail__unit">kn</span>
            </p>
            <p className="detail__note">{selected.note}</p>
            <a className="detail__link" href={vessel.makerUrl} target="_blank" rel="noreferrer">
              Ranger Tugs R-29
            </a>
            <SpeedBar mode={selected} />
          </div>

          <div className="detail__body">
            <dl className="conversions">
              <div>
                <dt>Knots</dt>
                <dd>{selected.knots.toFixed(2)} kn</dd>
              </div>
              <div>
                <dt>Statute miles</dt>
                <dd>{toMph(selected.knots).toFixed(1)} mph</dd>
              </div>
              <div>
                <dt>Metric</dt>
                <dd>{toKmh(selected.knots).toFixed(1)} km/h</dd>
              </div>
              <div>
                <dt>Share of max</dt>
                <dd>
                  {selected.id === "max"
                    ? "100%"
                    : `${Math.round((selected.knots / speeds[1].knots) * 100)}%`}
                </dd>
              </div>
            </dl>

            <div className="compare" aria-label="Cruise versus max">
              {speeds.map((mode) => (
                <div
                  key={mode.id}
                  className={`compare__row${mode.id === selected.id ? " is-current" : ""}`}
                  style={{ "--accent": mode.accent } as CSSProperties}
                >
                  <span className="compare__label">{mode.label}</span>
                  <span className="compare__track">
                    <span
                      className="compare__fill"
                      style={{
                        width: `${(mode.knots / vessel.chartCeilingKn) * 100}%`,
                      }}
                    />
                  </span>
                  <span className="compare__val">{mode.knots.toFixed(2)} kn</span>
                </div>
              ))}
            </div>
          </div>
        </article>
      </section>

      <section className="context" id="context" aria-labelledby="context-title">
        <div className="section-head section-head--light">
          <p className="eyebrow">How to read it</p>
          <h2 id="context-title">
            What 14.77 and 17.38 kn mean on an R-29 underway
          </h2>
        </div>
        <div className="guide">
          {contextNotes.map((item, index) => (
            <div
              className="guide__item"
              key={item.title}
              style={{ animationDelay: `${index * 80}ms` }}
            >
              <span className="guide__index">0{index + 1}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="footer">
        <p>
          {vessel.brand} · {vessel.name} · cruising {speeds[0].knots.toFixed(2)} kn · max{" "}
          {speeds[1].knots.toFixed(2)} kn
        </p>
      </footer>
    </div>
  )
}

function SpeedBar({ mode }: { mode: SpeedMode }) {
  const pct = Math.min(100, (mode.knots / vessel.chartCeilingKn) * 100)
  return (
    <div className="gauge" role="img" aria-label={`${mode.knots} knots on a ${vessel.chartCeilingKn} knot scale`}>
      <div className="gauge__track">
        <div className="gauge__fill" style={{ width: `${pct}%` }} />
        <div className="gauge__needle" style={{ left: `${pct}%` }} />
      </div>
      <div className="gauge__ticks">
        <span>0</span>
        <span>11</span>
        <span>{vessel.chartCeilingKn}</span>
      </div>
    </div>
  )
}

export default App
