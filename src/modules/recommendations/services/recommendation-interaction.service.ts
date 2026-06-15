import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { POST_INTERACTION_WEIGHTS } from 'src/common/constants/interaction-weights.constant';
import { PostInteractionType } from 'src/common/enums/post-interaction-type.enum';
import { PostViewSource } from 'src/common/enums/post-view-source.enum';
import { isMongoDuplicateKeyError } from 'src/common/utils/mongo-duplicate-key.util';
import { Post, PostDocument } from 'src/modules/post/schemas/post.schema';
import {
  UserCategoryPreference,
  UserCategoryPreferenceDocument,
} from '../schemas/user-category-preference.schema';
import {
  UserPostView,
  UserPostViewDocument,
} from '../schemas/user-post-view.schema';

@Injectable()
export class RecommendationInteractionService {
  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<PostDocument>,
    @InjectModel(UserCategoryPreference.name)
    private readonly userCategoryPreferenceModel: Model<UserCategoryPreferenceDocument>,
    @InjectModel(UserPostView.name)
    private readonly userPostViewModel: Model<UserPostViewDocument>,
  ) {}

  async trackInteraction(
    userId: string,
    postId: string,
    interactionType: PostInteractionType,
  ): Promise<any> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid userId');
    }

    if (!Types.ObjectId.isValid(postId)) {
      throw new BadRequestException('Invalid postId');
    }

    const userObjectId = new Types.ObjectId(userId);
    const postObjectId = new Types.ObjectId(postId);

    const post = await this.postModel
      .findOne({ _id: postObjectId, isHidden: { $ne: true } })
      .select('+category')
      .lean()
      .exec();

    if (!post) {
      throw new NotFoundException('Post not found');
    }

    if (interactionType === PostInteractionType.VIEW) {
      await this.createUserPostView(
        userObjectId,
        postObjectId,
        PostViewSource.RECOMMENDATION,
      );
    }

    if (!post.category) {
      return {
        preference: null,
        trackedCategoryPreference: false,
      };
    }

    const weight = POST_INTERACTION_WEIGHTS[interactionType];
    const countField = this.getCountField(interactionType);
    const now = new Date();

    const updatedPreference = await this.userCategoryPreferenceModel
      .findOneAndUpdate(
        {
          userId: userObjectId,
          category: post.category,
        },
        {
          $inc: {
            score: weight,
            [countField]: 1,
          },
          $set: {
            lastInteractedAt: now,
          },
          $setOnInsert: {
            userId: userObjectId,
            category: post.category,
          },
        },
        {
          new: true,
          upsert: true,
        },
      )
      .lean()
      .exec();

    return updatedPreference;
  }

  private getCountField(interactionType: PostInteractionType): string {
    switch (interactionType) {
      case PostInteractionType.VIEW:
        return 'viewCount';
      case PostInteractionType.VIDEO_WATCH_OVER_5S:
        return 'videoWatchCount';
      case PostInteractionType.REACT:
        return 'reactCount';
      case PostInteractionType.COMMENT:
        return 'commentCount';
      case PostInteractionType.SHARE:
        return 'shareCount';
      case PostInteractionType.SAVE:
        return 'saveCount';
      case PostInteractionType.HIDE:
        return 'hideCount';
      default:
        return 'viewCount';
    }
  }

  private async createUserPostView(
    userId: Types.ObjectId,
    postId: Types.ObjectId,
    source: PostViewSource,
  ): Promise<void> {
    try {
      await this.userPostViewModel.updateOne(
        { userId, postId },
        {
          $setOnInsert: {
            userId,
            postId,
            source,
            viewedAt: new Date(),
          },
        },
        { upsert: true },
      );
    } catch (error) {
      if (!isMongoDuplicateKeyError(error)) {
        throw error;
      }
    }
  }
}
