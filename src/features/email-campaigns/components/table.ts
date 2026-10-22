// The email tables share one narrow-screen policy: the table keeps a minimum
// width and scrolls inside its card (`overflow-x-auto` on the wrapper)
// instead of squeezing columns until the body's `wrap-anywhere` breaks words
// into single letters. Headings and fixed labels never wrap; cells with
// people's text get a minimum width and wrap within it.
export const tableClassName = 'w-full min-w-xl text-left'
export const headCellClassName = 'py-2 pr-4 font-normal whitespace-nowrap'
