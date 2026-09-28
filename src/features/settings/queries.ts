import { convexQuery } from '@convex-dev/react-query'

import { emailClientRefs } from '@/integrations/convex/email-function-refs'

export const emailContactStatusQueryOptions = () =>
  convexQuery(emailClientRefs.contacts.myStatus, {})
