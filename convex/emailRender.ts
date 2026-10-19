'use node'

import { ConvexError, v } from 'convex/values'

import { internal } from './_generated/api'
import { action } from './_generated/server'
import { assertCampaignDraft, assertEmailSize } from './lib/email_campaigns'
import {
  getEmailConfig,
  getSiteUrl,
  isCampaignSendingEnabled,
  isTestRecipient,
  isTestSendingEnabled,
} from './lib/email_provider'
import { settingsUrl } from './lib/emails/community_update'
import { UNSUBSCRIBE_URL_PLACEHOLDER } from './lib/emails/placeholders'
import { renderCampaignHtml, renderCampaignText } from './lib/emails/render'
import { enforceRateLimit } from './lib/rate_limits'
import {
  emailCampaignContentValidator,
  emailCopyChoiceValidator,
} from './lib/validators'

// Live preview of unsaved editor content. Nothing is stored; the client
// ignores any response older than its latest request number.
export const previewCampaign = action({
  args: {
    requestId: v.number(),
    subject: v.string(),
    preheader: v.string(),
    content: emailCampaignContentValidator,
  },
  returns: v.object({ requestId: v.number(), html: v.string() }),
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.emailCampaigns.assertAdmin, {})
    assertCampaignDraft(args)
    const props = {
      subject: args.subject,
      preheader: args.preheader,
      content: args.content,
      siteUrl: getSiteUrl(),
      postalAddress: getEmailConfig()?.postalAddress ?? null,
    }
    const html = await renderCampaignHtml(props)
    assertEmailSize(html, await renderCampaignText(props))
    return { requestId: args.requestId, html }
  },
})

/**
 * Renders the saved version once, with an unsubscribe placeholder, and hands
 * it to scheduleSend, which re-checks everything in one transaction.
 */
export const requestSend = action({
  args: {
    campaignId: v.id('email_campaigns'),
    expectedRevision: v.number(),
    // Send later; absent for Send (the 30-second undo window).
    sendAt: v.optional(v.number()),
    copy: emailCopyChoiceValidator,
  },
  returns: v.object({ sendAt: v.number() }),
  // Annotated: the result comes from `internal`, whose types include this
  // module.
  handler: async (ctx, args): Promise<{ sendAt: number }> => {
    const campaign = await ctx.runQuery(internal.emailCampaigns.getForSend, {
      campaignId: args.campaignId,
      expectedRevision: args.expectedRevision,
    })
    if (!isCampaignSendingEnabled()) {
      throw new ConvexError('Email sending is disabled in this environment')
    }
    const config = getEmailConfig()
    if (!config) throw new ConvexError('Email configuration is incomplete')
    const props = {
      ...campaign,
      siteUrl: config.siteUrl,
      postalAddress: config.postalAddress,
    }
    const html = await renderCampaignHtml(props)
    const text = await renderCampaignText(props)
    assertEmailSize(html, text)
    return await ctx.runMutation(internal.emailCampaigns.scheduleSend, {
      ...args,
      html,
      text,
    })
  },
})

/**
 * Sends the current, unsaved editor content to one allowlisted address with
 * "[test]" in the subject. Its unsubscribe link points at Settings.
 */
export const sendTest = action({
  args: {
    subject: v.string(),
    preheader: v.string(),
    content: emailCampaignContentValidator,
    recipient: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const adminId = await ctx.runQuery(internal.emailCampaigns.assertAdmin, {})
    if (!isTestSendingEnabled()) {
      throw new ConvexError('Test sending is disabled in this environment')
    }
    const recipient = args.recipient.trim()
    if (!isTestRecipient(recipient)) {
      throw new ConvexError('Test emails can only go to allowlisted addresses')
    }
    const config = getEmailConfig()
    if (!config) throw new ConvexError('Email configuration is incomplete')
    assertCampaignDraft(args)
    const props = {
      subject: args.subject,
      preheader: args.preheader,
      content: args.content,
      siteUrl: config.siteUrl,
      postalAddress: config.postalAddress,
    }
    const html = await renderCampaignHtml(props)
    const text = await renderCampaignText(props)
    assertEmailSize(html, text)
    await enforceRateLimit(ctx, 'emailTestSend', adminId)
    const unsubscribeUrl = settingsUrl(config.siteUrl)
    await ctx.runMutation(internal.emailSends.enqueueTestEmail, {
      to: recipient,
      subject: `[test] ${args.subject}`,
      html: html.replaceAll(UNSUBSCRIBE_URL_PLACEHOLDER, unsubscribeUrl),
      text: text.replaceAll(UNSUBSCRIBE_URL_PLACEHOLDER, unsubscribeUrl),
    })
    return null
  },
})
