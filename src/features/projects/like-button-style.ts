export type ProjectLikeButtonStyle = {
  variant: 'monoOutline'
  className: string
}

export function getProjectLikeButtonStyle(
  liked: boolean,
): ProjectLikeButtonStyle {
  return {
    variant: 'monoOutline',
    className: liked ? 'font-mono text-liked hover:text-liked' : 'font-mono',
  }
}
