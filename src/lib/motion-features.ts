import { domMax } from 'motion/react'

// Keep Motion's full feature set out of the initial route chunk. Layout IDs,
// gestures, SVG, and scroll motion require domMax rather than domAnimation.
export default domMax
