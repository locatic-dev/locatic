import { useAction } from 'convex/react'
import { api } from '../../../convex/_generated/api'

export const useListGithubRepositories = () =>
  useAction(api.github_actions.listRepositories)

export const useImportSelectedRepositories = () =>
  useAction(api.github_actions.importSelectedRepositories)
