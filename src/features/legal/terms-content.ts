// Terms of Service copy rendered by the /terms route via <MarkdownProse>.
// The document title and effective/last-updated line are rendered by the page
// chrome, so this body starts at the first numbered section (h2).
import { LEGAL_CONTACT_EMAIL } from './legal-contact'

export const TERMS_MARKDOWN = `## 1. Acceptance of Terms

By accessing or using Locatic ("the Service," "we," "us," or "our") at locatic.dev, you agree to be bound by these Terms of Service ("Terms"). If you do not agree to these Terms, do not use the Service.

We may update these Terms from time to time. We will notify you of material changes by posting the new Terms on this page and updating the "Last Updated" date. Continued use of the Service after changes constitutes acceptance of the updated Terms.

## 2. Eligibility

You must be at least 13 years old to use Locatic. By using the Service, you represent that you meet this requirement. Because Locatic requires a GitHub account, you must also comply with GitHub's Terms of Service, including their age requirements.

## 3. Account Registration

Locatic uses GitHub OAuth for authentication, managed through Clerk. By signing in, you authorize Locatic to access your public GitHub profile data, including your username, display name, avatar, public email address, and public repositories. You are responsible for all activity that occurs under your account.

You may not create accounts using automated means or impersonate another person.

## 4. User Content & License Grant

You retain ownership of any content you create or post on Locatic ("User Content"), including posts, comments, and direct messages.

By submitting User Content to the Service, you grant Locatic a worldwide, non-exclusive, royalty-free license to store, display, and distribute that content as necessary to operate the Service.

**Public content** — including project update posts, comments, likes, follows, contribution activity, and project showcases — is visible to other users by default. You may adjust the visibility of your likes, contribution activity, comment history, and follow graph through your account privacy settings. See our Privacy Policy for details.

**Private content** (direct messages) is visible only to the participants of that conversation. We do not read, sell, or share private messages except as required by law.

You are solely responsible for your User Content and represent that you have the rights to post it.

## 5. GitHub Data

Locatic imports publicly available data from GitHub — including repositories, profile information, and contribution history — to power the discovery features of the Service. This data is sourced through the GitHub API in a **read-only** manner. Locatic never writes to, modifies, deletes, or posts anything to your GitHub account or repositories on your behalf.

You may control which projects you showcase on your Locatic profile. Removing a project from your showcase does not delete the underlying public GitHub data.

## 6. Prohibited Conduct

You agree not to use the Service to:

- **Spam or operate bots** — sending unsolicited messages, creating automated accounts, or artificially inflating engagement
- **Harass or abuse others** — targeting, threatening, or discriminating against any user based on any characteristic
- **Post NSFW or explicit content** — including pornography, graphic violence, or content that is sexually explicit
- **Infringe intellectual property** — posting code, content, or materials you do not have the right to share
- **Scrape or abuse the platform** — bulk data extraction, reverse engineering, or circumventing rate limits
- **Violate any applicable law** — including privacy laws, export controls, or regulations in your jurisdiction

Violation of these rules may result in content removal, suspension, or permanent termination of your account.

## 7. Third-Party Services

The Service relies on the following third-party processors to operate:

- **Clerk** — authentication and session management
- **Convex** — database and backend infrastructure
- **Cloudflare** — content delivery and edge hosting
- **GitHub** — OAuth identity provider and public data source

Your use of Locatic is also subject to the terms and privacy policies of these providers. We are not responsible for the practices of third-party services.

## 8. Intellectual Property

All rights in the Locatic platform, brand, design, and codebase (excluding User Content) are owned by or licensed to Locatic. Nothing in these Terms transfers any intellectual property rights to you.

"Locatic," the Locatic logo, and associated marks are trademarks of Locatic. You may not use them without prior written permission.

## 9. Termination & Account Deletion

You may delete your account at any time through your account settings. Upon deletion, your account enters a 30-day soft-delete period during which you may restore it. After 30 days, your account and associated personal data will be permanently purged from our systems.

Some residual data may persist in backups for a limited period consistent with our data retention practices.

We reserve the right to suspend or terminate your access to the Service at any time, with or without cause, with or without notice.

## 10. Disclaimers

THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.

We do not warrant that the Service will be uninterrupted, error-free, or free of harmful components.

## 11. Limitation of Liability

TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, LOCATIC AND ITS AFFILIATES, OFFICERS, EMPLOYEES, AND AGENTS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR RELATED TO YOUR USE OF THE SERVICE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.

OUR TOTAL LIABILITY TO YOU FOR ANY CLAIM ARISING OUT OF OR RELATING TO THESE TERMS OR THE SERVICE SHALL NOT EXCEED $100 USD.

## 12. Governing Law & Dispute Resolution

These Terms are governed by the laws of the State of Delaware, USA, without regard to its conflict of law principles. Any disputes arising under these Terms shall be resolved exclusively in the state or federal courts located in Delaware, and you consent to personal jurisdiction in those courts.

## 13. Contact

If you have questions about these Terms or wish to report a violation, contact us at:

**${LEGAL_CONTACT_EMAIL}**
`
