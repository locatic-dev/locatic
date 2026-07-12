import { useMotionValue, useSpring, useTransform } from 'motion/react'
import * as m from 'motion/react-m'
import type { PointerEvent } from 'react'
import { Heart, MessageSquare, Star } from '@/lib/icons'
import { useReducedMotion } from '@/lib/motion'

// Desktop-only floating repo preview: subtle 3D tilt toward the cursor, a
// deeper shadow/lift on hover, and a gently floating "+12" reaction chip.
// Hidden on mobile by the parent (`hidden md:block`).
export function RepoPreviewCard() {
  const reducedMotion = useReducedMotion()
  const pointerX = useMotionValue(0.5)
  const pointerY = useMotionValue(0.5)
  const rotateX = useSpring(useTransform(pointerY, [0, 1], [6, -6]), {
    stiffness: 260,
    damping: 22,
  })
  const rotateY = useSpring(useTransform(pointerX, [0, 1], [-7, 7]), {
    stiffness: 260,
    damping: 22,
  })

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (reducedMotion) {
      return
    }
    const bounds = event.currentTarget.getBoundingClientRect()
    pointerX.set((event.clientX - bounds.left) / bounds.width)
    pointerY.set((event.clientY - bounds.top) / bounds.height)
  }

  function handlePointerLeave() {
    pointerX.set(0.5)
    pointerY.set(0.5)
  }

  return (
    <div
      className="relative hidden h-80 md:block"
      style={{ perspective: 900 }}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    >
      <div className="lx-float-slow absolute top-5 left-5 right-3 h-45 rotate-[2.5deg] rounded-[6px] border border-line bg-surface opacity-40" />

      <m.div
        className="absolute top-9 inset-x-0 rounded-[6px] border border-line bg-surface px-5 py-4.5 shadow-[0_24px_60px_rgba(0,0,0,0.5)]"
        style={{
          rotateX: reducedMotion ? 0 : rotateX,
          rotateY: reducedMotion ? 0 : rotateY,
          transformStyle: 'preserve-3d',
        }}
        initial={{ rotate: -1.5 }}
        whileHover={
          reducedMotion
            ? undefined
            : { y: -6, boxShadow: '0 34px 78px rgba(0,0,0,0.6)' }
        }
        transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="mb-1.5 font-mono text-[14.5px] font-semibold">
          <span className="font-normal text-text-faint">sonia/</span>
          wisp.tsx
        </div>
        <p className="mb-3 mt-0 font-sans text-[13px] leading-normal text-text-muted">
          Tiny React state primitive — signals without the ceremony.
        </p>
        <div className="flex gap-4 font-mono text-[11.5px] text-text-faint">
          <span className="flex items-center gap-1">
            <Star size={11} strokeWidth={1.4} /> 8.1k
          </span>
          <span className="flex items-center gap-1 text-brand">
            <Heart size={11} fill="currentColor" strokeWidth={1.4} /> 612
          </span>
          <span className="flex items-center gap-1">
            <MessageSquare size={11} strokeWidth={1.4} /> 48
          </span>
        </div>
      </m.div>

      <m.div
        className="absolute top-2 right-6 flex items-center gap-2 rounded-control border border-line bg-surface px-2.5 py-1.5 font-mono text-[11px] text-brand shadow-[0_8px_24px_rgba(0,0,0,0.4)]"
        initial={{ rotate: 4, y: 0 }}
        animate={
          reducedMotion ? { rotate: 4, y: 0 } : { rotate: 4, y: [0, -5, 0] }
        }
        transition={{
          duration: 3.4,
          repeat: reducedMotion ? 0 : Infinity,
          ease: 'easeInOut',
        }}
      >
        <Heart size={11} fill="currentColor" /> +12
      </m.div>
    </div>
  )
}
