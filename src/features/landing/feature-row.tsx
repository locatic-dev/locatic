import { motion } from 'motion/react'
import type { Variants } from 'motion/react'
import { cn } from '@/lib/utils'
import { ArrowRight, Heart, MapPin } from '@/lib/icons'
import { durations, easeOutExpo, viewportOnce } from '@/lib/motion'

const FEATURES = [
  {
    num: '01',
    title: 'discover',
    desc: 'See projects shipped by people in your city, your stack, your tier of weird.',
    Icon: MapPin,
  },
  {
    num: '02',
    title: 'like & star',
    desc: 'A heart for taste, a star for code. Both signals matter — they go to different places.',
    Icon: Heart,
  },
  {
    num: '03',
    title: 'connect',
    desc: 'Follow builders whose work you admire. Their next push shows up at the top of your feed.',
    Icon: ArrowRight,
  },
]

const container: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12 },
  },
}

const card: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: durations.slow, ease: easeOutExpo },
  },
}

const numLabel: Variants = {
  hidden: { opacity: 0, x: -6 },
  visible: {
    opacity: 1,
    x: 0,
    transition: { duration: durations.base, ease: easeOutExpo, delay: 0.06 },
  },
}

export function FeatureRow() {
  return (
    <motion.section
      id="features"
      className="relative z-1 mx-auto mt-16 grid max-w-296 grid-cols-1 gap-5 border-y border-line px-(--lx-gutter) py-10 md:grid-cols-3 md:gap-0 md:px-0"
      variants={container}
      initial="hidden"
      whileInView="visible"
      viewport={viewportOnce}
    >
      {FEATURES.map((f, i) => (
        <motion.div
          key={f.title}
          variants={card}
          className={cn(
            'px-0 py-2 md:px-8',
            i > 0 && 'border-t border-line md:border-l md:border-t-0',
          )}
        >
          <motion.div
            variants={numLabel}
            className="mb-3.5 font-mono text-[11px] text-text-faint"
          >
            {f.num}
          </motion.div>
          <div className="mb-3.5 flex h-9 w-9 items-center justify-center rounded-control border border-line text-brand">
            <f.Icon size={18} strokeWidth={1.4} />
          </div>
          <h3 className="mb-2 mt-0 font-mono text-lg font-semibold tracking-[-0.01em] text-text">
            {f.title}
          </h3>
          <p className="m-0 max-w-70 font-sans text-sm leading-[1.55] text-text-muted">
            {f.desc}
          </p>
        </motion.div>
      ))}
    </motion.section>
  )
}
