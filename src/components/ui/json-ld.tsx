import { jsonLdScript, type JsonLdNode } from '@/lib/structured-data'

/**
 * Structured data for the page, rendered with the page component rather
 * than in `head()`: route heads ship in the initial client bundle, page
 * components in their route's chunk. Search engines read JSON-LD anywhere in
 * the document. The JSON is escaped, so user text cannot end the element.
 */
export function JsonLd({ nodes }: { nodes: JsonLdNode | JsonLdNode[] }) {
  const { type, children } = jsonLdScript(nodes)
  return <script type={type} dangerouslySetInnerHTML={{ __html: children }} />
}
