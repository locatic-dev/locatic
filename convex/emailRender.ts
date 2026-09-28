'use node'

import { render } from '@react-email/render'
import { ConvexError, v } from 'convex/values'
import { createElement } from 'react'

import { action } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { emailRefs } from './lib/email_function_refs'
import {
  CommunityUpdateEmail,
  renderCommunityUpdateText,
} from './lib/emails/community_update'

async function renderArtifact(
  content: Parameters<typeof CommunityUpdateEmail>[0]['content'],
) {
  const html = await render(createElement(CommunityUpdateEmail, { content }))
  return {
    html,
    text: renderCommunityUpdateText(content),
  }
}

export const prepareReview = action({
  args: {
    campaignId: v.id('email_campaigns'),
    expectedRevision: v.number(),
  },
  returns: v.id('email_campaign_runs'),
  handler: async (ctx, args): Promise<Id<'email_campaign_runs'>> => {
    const input = await ctx.runQuery(emailRefs.campaigns.getReviewInput, args)
    if (!input) {
      throw new ConvexError('Campaign not found')
    }
    const artifact = await renderArtifact(input.content)
    return await ctx.runMutation(emailRefs.campaigns.commitReview, {
      ...args,
      ...artifact,
    })
  },
})
