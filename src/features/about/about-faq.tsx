import { ABOUT_FAQ } from '@/features/about/about-faq-content'

/**
 * Plain questions and self-contained answers for /about: each answer reads
 * on its own, so search snippets and AI answers can quote it.
 */
export function AboutFaq() {
  return (
    <section aria-labelledby="about-faq-heading" className="grid gap-5">
      <h2 id="about-faq-heading" className="text-headline text-text">
        questions
      </h2>
      {ABOUT_FAQ.map((item) => (
        <div key={item.question} className="grid gap-1.5">
          <h3 className="text-title text-text">{item.question}</h3>
          <p className="text-body text-text-muted">{item.answer}</p>
        </div>
      ))}
    </section>
  )
}
