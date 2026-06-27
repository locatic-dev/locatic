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
- Public contribution and activity data

Repository and contribution data is sourced from the public GitHub API. We do not access private repositories or write to your GitHub account.

### 2b. Profile, Preference, and Activity Data

We collect and store information you add or generate on Locatic, including:

- Profile details such as bio, build status, city, social links, and selected or showcased repositories
- Explore and discovery preferences, such as selected cities and technology interests
- Posts, comments, likes, follows, profile visibility settings, and other account preferences
- Direct messages sent through the inbox feature

By default, public profile activity may be visible to other users. You can restrict the visibility of your liked projects, comment history, and follow graph through your privacy settings (see Section 5).

Locatic does not support uploading photos, videos, or other media files. Images shown from GitHub repositories, such as README images, are rendered from public GitHub sources and are not uploaded to Locatic by users.

### 2c. Direct Messages (Private)

Messages sent through Locatic's inbox feature are intended to be visible only to the sender and recipient(s) of the conversation. We do not use private messages for advertising, analytics, or sale. We may access message content only as needed to operate the Service, investigate abuse or security issues, respond to reports, or comply with law.

### 2d. Technical Data

Our infrastructure and service providers may process technical request data, such as IP addresses, as part of normal server operation, security, fraud prevention, and debugging. We do not currently run behavioral advertising or cross-site tracking.

## 3. How We Use Your Data

We use the data we collect to:

- Authenticate you and maintain your session
- Populate and display your Locatic profile
- Power developer and project discovery features
- Display public activity, such as likes, follows, posts, comments, and showcased projects, on the platform
- Send you in-app notifications related to your activity
- Detect and prevent spam, abuse, and unauthorized access
- Operate, maintain, and improve the Service

We do not currently sell your personal data or use it for targeted advertising. If our data practices materially change, we will update this Policy and provide notice where required or appropriate.

## 4. Data Sharing

We do not sell your personal data. We share data only with:

- **Service providers** — third-party providers we use for authentication, hosting, database infrastructure, security, and related operations
- **GitHub** — as the OAuth provider and source of public profile and repository data
- **Law enforcement or legal obligations** — if required by a valid legal request, subpoena, or court order
- **Project or business transfers** — if Locatic is incorporated, acquired, merged, reorganized, transferred to a new operator, or its assets are sold, your data may be transferred as part of that transaction with notice to you where required

## 5. Visibility Controls & Privacy Settings

Locatic gives you control over what others can see on your profile. Through your account settings you can currently:

- **Hide your liked projects** — your likes are stored but not shown to other users
- **Hide your comment history** — your comments are stored but not browsable on your profile
- **Hide your follow graph** — your follower and following counts and lists are not shown to others

| Data Type | Default Visibility | Can Be Hidden? |
| --- | --- | --- |
| Profile (name, username, avatar, bio) | Public | Planned |
| Showcased projects | Public | Yes (remove from showcase) |
| Project update posts | Public | Yes (inherits project visibility) |
| Likes | Public | Yes |
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

If Indian data protection law applies to your use of Locatic, you may also have rights available to data principals under applicable Indian law, including rights to access information, correct or erase certain personal data, and raise grievances.

## 8. Children's Privacy

Locatic requires a GitHub account to use the Service. GitHub requires users to be at least 13 years old. We do not knowingly collect personal data from children under 13. If you believe a child under 13 has registered, contact us at ${LEGAL_CONTACT_EMAIL} and we will delete the account.

## 9. Third-Party Services

Locatic relies on third-party service providers for authentication, hosting, database infrastructure, security, and related operations. Those providers process data under their own privacy terms.

Locatic also integrates with GitHub as the OAuth identity provider and source of public profile and repository data. We encourage you to review GitHub's privacy practices.

## 10. Security

We implement reasonable security measures to protect your data, including encrypted data transmission, authentication token management, access controls, and infrastructure-level protections.

No system is 100% secure. If you discover a security vulnerability, please report it responsibly to ${LEGAL_CONTACT_EMAIL}.

## 11. Changes to This Policy

We may update this Privacy Policy from time to time. We will post the updated Policy on this page with a new "Last Updated" date. For material changes, we will provide additional notice (e.g., an in-app notification). Continued use of the Service after changes constitutes acceptance of the updated Policy.

## 12. Contact

For privacy-related questions, data requests, or to report a concern:

**${LEGAL_CONTACT_EMAIL}**
`
