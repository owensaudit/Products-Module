import { useState, useTransition, type CSSProperties } from "react"
import {
  clearanceGuide,
  hq21,
  products,
  type ClearanceRating,
  type Motorhome,
} from "./data/products"
import "./App.css"

const clearanceLabel: Record<ClearanceRating, string> = {
  excellent: "Excellent rear clearance",
  strong: "Strong for a Super C",
  watch: "Test your driveway",
}

function App() {
  const [selectedId, setSelectedId] = useState(products[0].id)
  const [isPending, startTransition] = useTransition()
  const selected = products.find((p) => p.id === selectedId) ?? products[0]

  const selectProduct = (id: string) => {
    startTransition(() => setSelectedId(id))
  }

  return (
    <div className="page">
      <header className="hero">
        <div className="hero__atmosphere" aria-hidden="true" />
        <nav className="nav">
          <span className="nav__mark">Products Module</span>
          <a className="nav__link" href="#picks">
            Picks
          </a>
        </nav>

        <div className="hero__copy">
          <p className="brand reveal">Products Module</p>
          <h1 className="headline reveal reveal--delay">
            A heavier, classier coach than your HQ21 — without dragging the tail up the drive.
          </h1>
          <p className="lede reveal reveal--delay-2">
            Curated Super C motorhomes with a bigger living box than the Black Series HQ21,
            built for steep reverse approaches.
          </p>
          <div className="cta-row reveal reveal--delay-3">
            <a className="cta cta--primary" href="#picks">
              See matched coaches
            </a>
            <a className="cta cta--ghost" href="#clearance">
              Clearance rules
            </a>
          </div>
        </div>
      </header>

      <section className="baseline" aria-labelledby="baseline-title">
        <div className="baseline__inner">
          <p className="eyebrow">Your baseline</p>
          <h2 id="baseline-title">{hq21.name}</h2>
          <p className="baseline__note">{hq21.note}</p>
          <dl className="spec-strip">
            <div>
              <dt>Interior box</dt>
              <dd>{hq21.interiorLength}</dd>
            </div>
            <div>
              <dt>Exterior</dt>
              <dd>
                {hq21.exteriorLength} × {hq21.exteriorWidth}
              </dd>
            </div>
            <div>
              <dt>GVWR</dt>
              <dd>{hq21.gvwr}</dd>
            </div>
            <div>
              <dt>Departure</dt>
              <dd>{hq21.departureAngle}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="picks" id="picks" aria-labelledby="picks-title">
        <div className="section-head">
          <p className="eyebrow">Matched for you</p>
          <h2 id="picks-title">Heavy-duty Super Cs that clear better than a long diesel pusher</h2>
          <p className="section-lede">
            Ranked for steep-driveway reverse first, then living volume past the HQ21, then a classy
            finish.
          </p>
        </div>

        <div className="picker" role="tablist" aria-label="Recommended motorhomes">
          {products.map((product) => (
            <button
              key={product.id}
              type="button"
              role="tab"
              aria-selected={product.id === selected.id}
              className={`picker__btn${product.id === selected.id ? " is-active" : ""}`}
              style={{ "--accent": product.accent } as CSSProperties}
              onClick={() => selectProduct(product.id)}
            >
              <span className="picker__rank">0{product.rank}</span>
              <span className="picker__name">
                {product.maker} {product.name}
              </span>
              <span className="picker__meta">{product.length}</span>
            </button>
          ))}
        </div>

        <article
          className={`detail${isPending ? " is-pending" : ""}`}
          style={{ "--accent": selected.accent } as CSSProperties}
          aria-live="polite"
        >
          <div className="detail__visual">
            <div className="detail__badge">{clearanceLabel[selected.clearance]}</div>
            <p className="detail__maker">{selected.maker}</p>
            <h3 className="detail__title">{selected.name}</h3>
            <p className="detail__tagline">{selected.tagline}</p>
            <p className="detail__fit">{selected.fit}</p>
            <a className="detail__link" href={selected.url} target="_blank" rel="noreferrer">
              Maker page
            </a>
          </div>

          <div className="detail__body">
            <SpecGrid product={selected} />
            <div className="detail__block">
              <h4>Steep driveway</h4>
              <p>{selected.clearanceNote}</p>
            </div>
            <div className="detail__block">
              <h4>Why it feels classy</h4>
              <p>{selected.whyClassy}</p>
            </div>
            <div className="detail__block">
              <h4>Vs your HQ21</h4>
              <ul>
                {selected.vsHq21.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
        </article>
      </section>

      <section className="clearance" id="clearance" aria-labelledby="clearance-title">
        <div className="section-head section-head--light">
          <p className="eyebrow">Driveway geometry</p>
          <h2 id="clearance-title">Back it up the grade without kissing the bumper</h2>
        </div>
        <div className="guide">
          {clearanceGuide.map((item, index) => (
            <div className="guide__item" key={item.title} style={{ animationDelay: `${index * 80}ms` }}>
              <span className="guide__index">0{index + 1}</span>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="footer">
        <p>
          Products Module · recommendations for an HQ21 owner seeking a heavier, classier motorhome
          with rear clearance for a steep reverse driveway.
        </p>
      </footer>
    </div>
  )
}

function SpecGrid({ product }: { product: Motorhome }) {
  return (
    <dl className="detail__specs">
      <div>
        <dt>Overall length</dt>
        <dd>{product.length}</dd>
      </div>
      <div>
        <dt>Living box</dt>
        <dd>{product.interiorEmphasis}</dd>
      </div>
      <div>
        <dt>Chassis</dt>
        <dd>{product.chassis}</dd>
      </div>
      <div>
        <dt>Power</dt>
        <dd>{product.drivetrain}</dd>
      </div>
      <div>
        <dt>GVWR</dt>
        <dd>{product.gvwr}</dd>
      </div>
      <div>
        <dt>Wheelbase note</dt>
        <dd>{product.wheelbase}</dd>
      </div>
      <div>
        <dt>Budget band</dt>
        <dd>{product.msrpFrom}</dd>
      </div>
    </dl>
  )
}

export default App
