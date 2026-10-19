// Privacy Policy copy rendered by the /privacy route via <MarkdownProse>.
// The document title and effective/last-updated line are rendered by the page
// chrome, so this body starts at the first numbered section (h2).
import { LEGAL_CONTACT_EMAIL } from './legal-contact'

export const PRIVACY_MARKDOWN = `## 1. Introduction

Locatic ("we," "us," or "our") operates locatic.dev, a developer and project discovery platform. This Privacy Policy explains what data we collect, how we use it, and your rights regarding your information.

Locatic is accessible globally, but these practices are governed by the laws of India. See our Terms of Service for details on governing law and dispute resolution.

By using Locatic, you agree to the practices described in this Policy. If you do not agree, please do not use the Service.

## 2. Data We Collect

### 2a. GitHub OAuth Data

When you sign in with GitHub, we receive:

- GitHub username and display name
- Profile avatar URL
- Email address provided through GitHub or our authentication provider
- Public repository list and metadata (names, descriptions, languages, stars, topics)
- Public contribution and activity data, including your contribution calendar (daily contribution counts)

Repository and contribution data is sourced from the public GitHub API. We do not access private repositories or write to your GitHub account.

### 2b. Profile, Preference, and Activity Data

We collect and store information you add or generate on Locatic, including:

- Profile details such as bio, build status, city, social links, and selected or showcased repositories
- Explore and discovery preferences, such as selected cities and technology interests
- Explore history: which projects and posts were shown to you in Explore and which you dismissed, so we don't show them again
- Posts, comments, likes, follows, profile visibility settings, and other account preferences
- Direct messages sent through the inbox feature
- Reports you submit about content or users
- Email preferences, and delivery status for emails we send you (for example, delivered, bounced, or unsubscribed)

By default, public profile activity may be visible to other users. You can restrict the visibility of your liked projects, comment history, contributions, follow graph, and location through your privacy settings (see Section 5).

Locatic does not support uploading photos, videos, or other media files. Images shown from GitHub repositories, such as README images, are rendered from public GitHub sources and are not uploaded to Locatic by users.

### 2c. Direct Messages (Private)

Messages sent through Locatic's inbox feature are intended to be visible only to the sender and recipient(s) of the conversation. We do not use private messages for advertising, analytics, or sale. We may access message content only as needed to operate the Service, investigate abuse or security issues, respond to reports, or comply with law.

### 2d. Technical Data

Our infrastructure and service providers may process technical request data, such as IP addresses, as part of normal server operation, security, fraud prevention, and debugging. We do not currently run behavioral advertising or cross-site tracking.

We use Cloudflare Web Analytics to measure aggregate page views and page performance. It does not use cookies or local storage and does not build a profile of you across sites. We also count a few product actions (such as follows, saves, and comments) as daily totals that do not identify who performed them.

## 3. How We Use Your Data

We use the data we collect to:

- Authenticate you and maintain your session
- Populate and display your Locatic profile
- Power developer and project discovery features
- Display public activity, such as likes, follows, posts, comments, and showcased projects, on the platform
- Send you in-app notifications related to your activity
- Send service emails about your account and, if you opt in, community and product update emails (see Section 6)
- Detect and prevent spam, abuse, and unauthorized access
- Operate, maintain, and improve the Service

We do not currently sell your personal data or use it for targeted advertising. If our data practices materially change, we will update this Policy and provide notice where required or appropriate.

## 4. Data Sharing

We do not sell your personal data. We share data only with:

- **Service providers** — third-party providers we use for authentication, hosting, database infrastructure, email delivery, security, and related operations (listed in Section 11)
- **GitHub** — as the OAuth provider and source of public profile and repository data
- **Law enforcement or legal obligations** — if required by a valid legal request, subpoena, or court order
- **Project or business transfers** — if Locatic is incorporated, acquired, merged, reorganized, transferred to a new operator, or its assets are sold, your data may be transferred as part of that transaction with notice to you where required

## 5. Visibility Controls & Privacy Settings

Locatic gives you control over what others can see on your profile. Through your account settings you can currently:

- **Hide your liked projects** — your likes are stored but not shown to other users
- **Hide your comment history** — your comments are stored but not browsable on your profile
- **Hide your follow graph** — your follower and following counts and lists are not shown to others
- **Hide your contributions** — your contribution calendar and contributed projects are not shown to others
- **Choose how precisely your location is shown** — your exact city, only your region and country, or no location at all
- **Leave discovery** — stop appearing, with your projects, in Explore, on city pages, and in builder lists

| Data Type | Default Visibility | Can Be Hidden? |
| --- | --- | --- |
| Profile (name, username, avatar, bio) | Public | Planned (members-only setting) |
| Showcased projects | Public | Yes (remove from showcase) |
| Project update posts | Public | Yes (inherits project visibility) |
| Likes | Public | Yes |
| Comment history | Public | Yes |
| Follower / following lists | Public | Yes |
| Contributions | Public | Yes |
| City | Public (exact city) | Yes (region only or hidden) |
| Appearing in Explore and city pages | On | Yes |
| Direct messages | Private (parties only) | N/A |
| Email address | Never publicly displayed | N/A |

Our systems already support restricting a profile to signed-in members, but the setting is not yet available in your account settings; a members-only profile is shown only to signed-in members and kept out of search engines. We also store a preference for appearing in activity feeds that does not yet change what others see. When you restrict visibility, the data is still stored in our systems (so you can un-restrict it later) but is not surfaced to other users.

## 6. Emails

We may send service emails needed to run your account, such as security notices or changes to these terms. You cannot opt out of these while you have an account.

Community and product update emails, such as the fortnightly digest of projects and discussions on Locatic, are sent only if you turn on "community and product updates" in your settings and your email address is verified. You can turn them off in settings or with the unsubscribe link in any update email. We send these emails through Resend, which reports delivery events (such as delivered, bounced, or marked as spam) back to us; addresses that permanently bounce, are marked as spam, or are suppressed by Resend are not emailed again.

## 7. Cookies

Locatic uses only cookies that are strictly necessary to run the Service, so we do not show a cookie consent banner. We do not use advertising or cross-site tracking cookies.

- **Authentication cookies** — set by Clerk, our authentication provider (for example, \`__session\` and \`__client_uat\`), to keep you signed in and protect your account
- **Security cookies** — our hosting provider, Cloudflare, may set cookies to detect bots and protect the Service from abuse

We also store a few settings in your browser's local storage and session storage. They are not used for advertising or cross-site tracking:

- **Local storage** — your theme choice and whether the sidebar is collapsed; these stay on your device
- **Session storage** — your Explore position and filters, cleared when you close the tab; filters are sent to our servers only to load the matching results
- **Session storage** — a short-lived marker of the page to return to after signing in, which also lets us count, in aggregate, how many visitors sign in from a discovery page

You can clear cookies and site data in your browser settings at any time. If you block authentication cookies, you will not be able to sign in.

## 8. Data Retention

We retain your data for as long as your account is active.

When you delete your account:

1. Your account is **soft-deleted** and hidden from the platform immediately.
2. You have a **30-day window** to restore your account and all data.
3. After 30 days, your account and associated personal data are **permanently purged** from our systems.

Residual copies may persist in encrypted backups for up to 90 days before being overwritten. Direct messages may be retained in the other party's inbox unless they also delete their account or delete the conversation.

Aggregated or anonymized data (e.g., usage statistics) may be retained indefinitely.

## 9. Your Rights

You have the right to:

- **Access** the personal data we hold about you
- **Correct** inaccurate personal data
- **Delete** your account and personal data (see Section 8)
- **Object** to certain uses of your data
- **Data portability** — request an export of your data

To exercise any of these rights, contact us at **${LEGAL_CONTACT_EMAIL}**. We will respond within 30 days.

If you are in the European Economic Area (EEA), you may also lodge a complaint with your local data protection authority. Note that Locatic is not currently established in the EU, and GDPR may or may not apply to your use of the Service depending on your circumstances.

If Indian data protection law applies to your use of Locatic, you may also have rights available to data principals under applicable Indian law, including rights to access information, correct or erase certain personal data, and raise grievances.

## 10. Children's Privacy

Locatic requires a GitHub account to use the Service. GitHub requires users to be at least 13 years old. We do not knowingly collect personal data from children under 13. If you believe a child under 13 has registered, contact us at ${LEGAL_CONTACT_EMAIL} and we will delete the account.

## 11. Third-Party Services

Locatic relies on these service providers, which process data on our behalf under their own privacy terms:

- **Clerk** — sign-in, sessions, and account email addresses
- **Convex** — database and backend, where your profile, activity, and messages are stored
- **Cloudflare** — hosting, request logs, security, and Web Analytics
- **Resend** — delivery of community and product update emails
- **GitHub** — sign-in identity and public profile, repository, and contribution data; avatars and README images are loaded from GitHub's servers

Locatic also integrates with GitHub as the OAuth identity provider and source of public profile and repository data. We encourage you to review GitHub's privacy practices.

## 12. Security

We implement reasonable security measures to protect your data, including encrypted data transmission, authentication token management, access controls, and infrastructure-level protections.

No system is 100% secure. If you discover a security vulnerability, please report it responsibly to ${LEGAL_CONTACT_EMAIL}.

## 13. Changes to This Policy

We may update this Privacy Policy from time to time. We will post the updated Policy on this page with a new "Last Updated" date. For material changes, we will provide additional notice (e.g., an in-app notification). Continued use of the Service after changes constitutes acceptance of the updated Policy.

## 14. Contact

For privacy-related questions, data requests, or to report a concern:

**${LEGAL_CONTACT_EMAIL}**
`
