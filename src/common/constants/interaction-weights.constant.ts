import { PostInteractionType } from '../enums/post-interaction-type.enum';

export const POST_INTERACTION_WEIGHTS: Record<PostInteractionType, number> = {
    [PostInteractionType.VIEW]: 1,
    [PostInteractionType.VIDEO_WATCH_OVER_5S]: 2,
    [PostInteractionType.REACT]: 3,
    [PostInteractionType.COMMENT]: 5,
    [PostInteractionType.SHARE]: 6,
    [PostInteractionType.SAVE]: 7,
    [PostInteractionType.HIDE]: -5,
};
