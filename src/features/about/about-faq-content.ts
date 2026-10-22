// The /about questions, kept apart from about-content.ts: route heads import
// the definition, and this text should stay out of the initial client bundle.
// Each answer reads on its own and must match what ships today.

import { LOCATIC_DEFINITION } from '@/features/about/about-content'

export const ABOUT_FAQ = [
  {
    question: 'What is Locatic?',
    answer: LOCATIC_DEFINITION,
  },
  {
    question: 'Can I browse Locatic without an account?',
    answer:
      'Yes. Explore, city pages, public profiles and project pages are open to everyone. You need an account to follow builders, like, comment, save projects or send messages.',
  },
  {
    question: 'How does Locatic use my GitHub account?',
    answer:
      'You sign in with GitHub. Locatic lists only your public repositories, and shows the ones you choose with their README, languages, topics and releases. It reads from GitHub and never posts to GitHub for you.',
  },
  {
    question: 'What does Locatic show about my location?',
    answer:
      'You choose: your exact city, only your region and country, or nothing. Locatic applies that choice on the server to every public page, count and map dot. Only builders who show their exact city appear in that city’s lists and counts.',
  },
  {
    question: 'How is Locatic different from GitHub?',
    answer:
      'GitHub hosts code. Locatic is about the people behind it: who is building what, and where. It sits on top of your public GitHub work and adds city pages, follows, comments, posts and direct messages. There are no rankings or leaderboards; builders are ordered by their most recent public work.',
  },
  {
    question: 'My city is not listed. Can I still join?',
    answer:
      'Yes. Choose “can’t find my city” during onboarding and you still get global Explore. You join a city’s page once you set a city in your settings.',
  },
] as const
