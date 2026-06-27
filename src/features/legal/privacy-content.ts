// Privacy Policy copy rendered by the /privacy route via <MarkdownProse>.
// The document title and effective/last-updated line are rendered by the page
// chrome, so this body starts at the first numbered section (h2).
import { LEGAL_CONTACT_EMAIL } from './legal-contact'

export const PRIVACY_MARKDOWN = `## 1. Introduction

Locatic ("we," "us," or "our") operates locatic.dev, a developer discovery platform. This Privacy Policy explains what data we collect, how we use it, and your rights regarding your information.

By using Locatic, you agree to the practices described in this Policy. If you do not agree, please do not use the Service.

## 2. Data We Collect

### 2a. GitHub OAuth Data (via Clerk)

When you sign in with GitHub, we receive:

- GitHub username and display name
- Profile avatar URL
- Public email address associated with your GitHub account
- Public repository list and metadata (names, descriptions, languages, stars, topics)
- Public contribution and activity data

This data is sourced from the public GitHub API. We do not access private repositories or private GitHub data.

### 2b. User Activity Data

Activity you perform on Locatic — such as liking projects, following developers, posting comments, writing project update posts, contributing to projects, and selecting projects to showcase — is stored on the platform. By default, this activity is visible to other users, but you can restrict the visibility of your likes, contribution activity, comment history, and follow graph through your privacy settings (see Section 5).

### 2c. Direct Messages (Private)

Messages sent through Locatic's inbox feature are stored securely and are visible only to the sender and recipient(s) of the conversation. We do not read, analyze, sell, or share private message content except as required by law.

### 2d. Technical Data

Our infrastructure providers (Cloudflare and Convex) may process technical request data such as IP addresses as part of normal server operation and security. We do not store IP addresses, browser types, OS, or device identifiers in our own application database, and we do not run behavioral analytics or tracking.

## 3. How We Use Your Data

We use the data we collect to:

- Authenticate you and maintain your session
- Populate and display your Locatic profile
- Power developer and project discovery features
- Display public activity (likes, follows, posts, comments) on the platform
- Send you in-app notifications related to your activity
- Detect and prevent spam, abuse, and unauthorized access
- Operate, maintain, and improve the Service

We do not currently sell your personal data or use it for targeted advertising. We reserve the right to introduce interest-based advertising features in the future, in which case we will update this Policy and notify you in advance.

## 4. Data Sharing

We do not sell your personal data. We share data only with:

- **Service processors** — Clerk (auth), Convex (database/backend), Cloudflare (hosting) — solely to operate the Service on our behalf, under data processing agreements
- **GitHub** — as the OAuth provider and source of public profile/repo data
- **Law enforcement or legal obligations** — if required by a valid legal request, subpoena, or court order
- **Business transfers** — if Locatic is acquired, merged, or its assets are sold, your data may be transferred as part of that transaction with notice to you

## 5. Visibility Controls & Privacy Settings

Locatic gives you control over what others can see on your profile. Through your account settings you can currently:

- **Hide your liked projects** — your likes are stored but not shown to other users
- **Hide your contribution activity** — your contribution tab and GitHub contribution graph are stored but not shown on your public profile
- **Hide your comment history** — your comments are stored but not browsable on your profile
- **Hide your follow graph** — your follower and following counts and lists are not shown to others

| Data Type | Default Visibility | Can Be Hidden? |
| --- | --- | --- |
| Profile (name, username, avatar, bio) | Public | Planned |
| Showcased projects | Public | Yes (remove from showcase) |
| Project update posts | Public | No (inherits project visibility) |
| Likes | Public | Yes |
| Contribution activity | Public | Yes |
| Comment history | Public | Yes |
| Follower / following lists | Public | Yes |
| Direct messages | Private (parties only) | N/A |
| Email address | Never publicly displayed | N/A |

We plan to add additional controls in the future, including profile visibility restrictions. When you restrict visibility, the data is still stored in our systems (so you can un-restrict it later) but is not surfaced to other users.

## 6. Data Retention

We retain your data for as long as your account is active.

When you delete your account:

1. Your account is **soft-deleted** and hidden from the platform immediately.
2. You have a **30-day window** to restore your account and all data.
3. After 30 days, your account and associated personal data are **permanently purged** from our systems.

Residual copies may persist in encrypted backups for up to 90 days before being overwritten. Direct messages may be retained in the other party's inbox unless they also delete their account or delete the conversation.

Aggregated or anonymized data (e.g., usage statistics) may be retained indefinitely.

## 7. Your Rights

You have the right to:

- **Access** the personal data we hold about you
- **Correct** inaccurate personal data
- **Delete** your account and personal data (see Section 6)
- **Object** to certain uses of your data
- **Data portability** — request an export of your data

To exercise any of these rights, contact us at **${LEGAL_CONTACT_EMAIL}**. We will respond within 30 days.

If you are in the European Economic Area (EEA), you may also lodge a complaint with your local data protection authority. Note that Locatic is not currently established in the EU, and GDPR may or may not apply to your use of the Service depending on your circumstances.

## 8. Children's Privacy

Locatic requires a GitHub account to use the Service. GitHub requires users to be at least 13 years old. We do not knowingly collect personal data from children under 13. If you believe a child under 13 has registered, contact us at ${LEGAL_CONTACT_EMAIL} and we will delete the account.

## 9. Third-Party Services

Locatic integrates with the following services, each with their own privacy policies:

- **Clerk** — clerk.com/privacy
- **Convex** — convex.dev/privacy
- **Cloudflare** — cloudflare.com/privacypolicy
- **GitHub** — docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement

We encourage you to review the privacy policies of these providers.

## 10. Security

We implement industry-standard security measures to protect your data, including encrypted data transmission (HTTPS), authentication token management via Clerk, and infrastructure-level protections via Cloudflare.

No system is 100% secure. If you discover a security vulnerability, please report it responsibly to ${LEGAL_CONTACT_EMAIL}.

## 11. Changes to This Policy

We may update this Privacy Policy from time to time. We will post the updated Policy on this page with a new "Last Updated" date. For material changes, we will provide additional notice (e.g., an in-app notification). Continued use of the Service after changes constitutes acceptance of the updated Policy.

## 12. Contact

For privacy-related questions, data requests, or to report a concern:

**${LEGAL_CONTACT_EMAIL}**
`
