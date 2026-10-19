/**
 * Stands in for each recipient's unsubscribe URL in a rendered campaign.
 * Enqueueing replaces it per recipient; a test send replaces it with the
 * Settings page. Admins may also use it as a Markdown link target in the
 * body. Kept apart from the React template so mutations can import it.
 */
export const UNSUBSCRIBE_URL_PLACEHOLDER = '{{UNSUBSCRIBE_URL}}'
