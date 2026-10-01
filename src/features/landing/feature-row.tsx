import * as m from 'motion/react-m'
import type { Variants } from 'motion/react'
import { durations, easeOutExpo, viewportOnce } from '@/lib/motion'

// Three features on a hairline grid: a mono eyebrow names each one, a sans
// title says what it gives you. Copy describes only what ships today; keep it
// that way when features change.
const FEATURES = [
  {
    eyebrow: '01 · discover',
    title: 'see who is building near you',
    desc: 'pick your city in explore and see the projects, posts and builders there, or look at every city at once.',
  },
  {
    eyebrow: '02 · follow',
    title: 'keep up with builders you admire',
    desc: 'follow builders whose work you admire. their new projects and posts show up in your home feed.',
  },
  {
    eyebrow: '03 · message',
    title: 'talk to them directly',
    desc: 'send a builder a direct message from their profile or project page.',
  },
]

const container: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.1 },
  },
}

const item: Variants = {
  hidden: { y: 10 },
  visible: {
    y: 0,
    transition: { duration: durations.slow, ease: easeOutExpo },
  },
}

export function FeatureRow() {
  return (
    <m.section
      id="features"
      aria-label="what locatic does"
      className="mx-auto mt-16 max-w-(--lx-public-max) px-(--lx-gutter) md:mt-24"
      variants={container}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
    >
      <ul className="m-0 grid list-none grid-cols-1 divide-y divide-line border-y border-line p-0 md:grid-cols-3 md:divide-x md:divide-y-0">
        {FEATURES.map((feature) => (
          // The hairlines stay put; only the content rises into place.
          <li
            key={feature.eyebrow}
            className="min-w-0 py-8 md:px-8 md:first:pl-0 md:last:pr-0"
          >
            <m.div variants={item}>
              <p className="m-0 text-eyebrow text-text-muted">
                {feature.eyebrow}
              </p>
              <h2 className="mt-3 mb-2 text-title wrap-anywhere text-text">
                {feature.title}
              </h2>
              <p className="m-0 text-body text-text-muted">{feature.desc}</p>
            </m.div>
          </li>
        ))}
      </ul>
    </m.section>
  )
}
