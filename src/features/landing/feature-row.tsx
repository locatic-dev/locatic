import * as m from 'motion/react-m'
import type { Variants } from 'motion/react'
import { cn } from '@/lib/utils'
import { ArrowRight, Heart, MapPin } from '@/lib/icons'
import { durations, easeOutExpo, viewportOnce } from '@/lib/motion'

// Asymmetric feature composition: one lead statement carries the section, two
// supporting rows sit beside it. Deliberately not three equal columns — the
// varied widths and inline icons keep the block from reading as a template.
const LEAD = {
  title: 'discover',
  desc: 'See projects shipped by people in your city, your stack, your tier of weird — plotted on a map you can actually read.',
  Icon: MapPin,
}

const SUPPORTING = [
  {
    title: 'like & star',
    desc: 'A heart for taste, a star for code. Both signals matter — they go to different places.',
    Icon: Heart,
  },
  {
    title: 'connect',
    desc: 'Follow builders whose work you admire. Their next push shows up at the top of your feed.',
    Icon: ArrowRight,
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
      className="mx-auto mt-16 max-w-296 border-y border-line px-(--lx-gutter) py-10 md:px-8"
      variants={container}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
    >
      <div className="grid grid-cols-1 gap-x-10 gap-y-8 md:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* Lead feature — larger, carries the section */}
        <m.div variants={item} className="min-w-0">
          <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-control border border-line-strong text-brand">
            <LEAD.Icon size={20} strokeWidth={1.4} />
          </div>
          <h3 className="mt-0 mb-2.5 font-mono text-2xl font-semibold tracking-[-0.015em] wrap-anywhere text-text">
            {LEAD.title}
          </h3>
          <p className="m-0 max-w-90 font-sans text-[15px] leading-[1.6] text-text-muted">
            {LEAD.desc}
          </p>
        </m.div>

        {/* Supporting features — stacked rows, hairline-divided */}
        <div className="flex flex-col">
          {SUPPORTING.map((f, i) => (
            <m.div
              key={f.title}
              variants={item}
              className={cn(
                'min-w-0 py-4 first:pt-0 last:pb-0',
                i > 0 && 'border-t border-line',
              )}
            >
              <div className="mb-1.5 flex items-center gap-2.5">
                <f.Icon
                  size={16}
                  strokeWidth={1.5}
                  className="shrink-0 text-brand"
                />
                <h3 className="m-0 font-mono text-base font-semibold tracking-[-0.01em] wrap-anywhere text-text">
                  {f.title}
                </h3>
              </div>
              <p className="m-0 font-sans text-sm leading-[1.55] text-text-muted">
                {f.desc}
              </p>
            </m.div>
          ))}
        </div>
      </div>
    </m.section>
  )
}
