import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { FilterQuery, Model, PipelineStage, Types } from 'mongoose';
import { PostCategory } from 'src/common/enums/post-category.enum';
import { PostViewSource } from 'src/common/enums/post-view-source.enum';
import { isMongoDuplicateKeyError } from 'src/common/utils/mongo-duplicate-key.util';
import { shuffle } from 'src/common/utils/shuffle.util';
import { Post, PostDocument } from 'src/modules/post/schemas/post.schema';
import { AppEvents } from 'src/shared/enums/app-events.enum';
import { PrivacyType } from 'src/shared/enums/privacy_type';
import { GetRecommendationFeedQueryDto } from '../dto/get-recommendation-feed-query.dto';
import {
  UserCategoryPreference,
  UserCategoryPreferenceDocument,
} from '../schemas/user-category-preference.schema';
import {
  UserPostView,
  UserPostViewDocument,
} from '../schemas/user-post-view.schema';

type RecommendationStrategy = 'personalized' | 'cold_start';
export const RECOMMENDATION_FEED_GET_EVENT = 'recommendation.feed.get';

interface CategoryPreference {
  category: PostCategory;
  score: number;
}

interface SourcedPost {
  post: any;
  source: PostViewSource;
}

@Injectable()
export class RecommendationFeedService {
  private readonly logger = new Logger(RecommendationFeedService.name);

  constructor(
    @InjectModel(Post.name) private readonly postModel: Model<PostDocument>,
    @InjectModel(UserCategoryPreference.name)
    private readonly userCategoryPreferenceModel: Model<UserCategoryPreferenceDocument>,
    @InjectModel(UserPostView.name)
    private readonly userPostViewModel: Model<UserPostViewDocument>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  async getRecommendedFeed(
    userId: string,
    query: GetRecommendationFeedQueryDto,
  ): Promise<{
    data: any[];
    meta: {
      page: number;
      limit: number;
      totalReturned: number;
      topCategories: PostCategory[];
      strategy: RecommendationStrategy;
    };
  }> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new BadRequestException('Invalid userId');
    }

    const page = query.page ?? 1;
    const limit = Math.min(query.limit ?? 10, 30);
    const userObjectId = new Types.ObjectId(userId);

    this.logger.log(
      `[recommend-feed] start userId=${userId}, page=${page}, limit=${limit}, userPostViewCollection=${this.userPostViewModel.collection.name}`,
    );

    const [topCategoryPreferences, friendIds] = await Promise.all([
      this.getTopCategoryPreferences(userObjectId),
      this.getFriendIds(userObjectId),
    ]);
    const topCategories = topCategoryPreferences.map(
      (preference) => preference.category,
    );

    const strategy: RecommendationStrategy =
      topCategories.length > 0 ? 'personalized' : 'cold_start';
    const counts = this.getStrategyCounts(strategy, limit);
    const friendObjectIds = friendIds.map((id) => new Types.ObjectId(id));

    this.logger.log(
      `[recommend-feed] context userId=${userId}, strategy=${strategy}, topCategories=${topCategories.join(',') || 'none'}, friendCount=${friendIds.length}, counts=${JSON.stringify(counts)}`,
    );

    const [recommendedPosts, friendPosts, explorePosts] = await Promise.all([
      this.fetchRecommendedPosts(
        userObjectId,
        topCategoryPreferences,
        counts.recommendedCount,
        strategy,
      ),
      this.fetchFriendPosts(userObjectId, friendObjectIds, counts.friendCount),
      this.fetchExplorePosts(
        userObjectId,
        topCategories,
        counts.exploreCount,
        strategy,
      ),
    ]);

    let mergedPosts = this.dedupePosts([
      ...recommendedPosts.map((post) => ({
        post,
        source: PostViewSource.RECOMMENDATION,
      })),
      ...friendPosts.map((post) => ({
        post,
        source: PostViewSource.FRIEND,
      })),
      ...explorePosts.map((post) => ({ post, source: PostViewSource.EXPLORE })),
    ]);

    this.logger.log(
      `[recommend-feed] fetched userId=${userId}, recommended=${recommendedPosts.length}, friend=${friendPosts.length}, explore=${explorePosts.length}, mergedBeforeShuffle=${mergedPosts.length}`,
    );

    mergedPosts = shuffle(mergedPosts).slice(0, limit);

    if (mergedPosts.length < limit) {
      const additionalPosts = await this.fetchAdditionalPosts({
        userObjectId,
        friendObjectIds,
        existingPostIds: mergedPosts.map(({ post }) => post._id.toString()),
        limit: limit - mergedPosts.length,
      });

      mergedPosts = this.dedupePosts([
        ...mergedPosts,
        ...additionalPosts,
      ]).slice(0, limit);

      this.logger.log(
        `[recommend-feed] additional userId=${userId}, additional=${additionalPosts.length}, mergedAfterAdditional=${mergedPosts.length}`,
      );
    }

    await this.recordReturnedPostViews(userObjectId, mergedPosts);

    return {
      data: mergedPosts.map(({ post, source }) => ({
        ...this.formatPostForClient(post),
        source,
      })),
      meta: {
        page,
        limit,
        totalReturned: mergedPosts.length,
        topCategories,
        strategy,
      },
    };
  }

  @OnEvent(RECOMMENDATION_FEED_GET_EVENT)
  async handleGetRecommendedFeed(payload: {
    userId: string;
    page?: number;
    limit?: number;
  }) {
    return this.getRecommendedFeed(payload.userId, {
      page: payload.page,
      limit: payload.limit,
    });
  }

  private async getTopCategoryPreferences(
    userId: Types.ObjectId,
  ): Promise<CategoryPreference[]> {
    const preferences = await this.userCategoryPreferenceModel
      .find({
        userId,
        score: { $gt: 0 },
      })
      .sort({ score: -1 })
      .limit(5)
      .select('category score')
      .lean()
      .exec();

    return preferences.map((preference) => ({
      category: preference.category,
      score: preference.score,
    }));
  }

  private async getFriendIds(userId: Types.ObjectId): Promise<string[]> {
    try {
      const [friendIds] = await this.eventEmitter.emitAsync(
        AppEvents.FRIEND_IDS_GET,
        { userId: userId.toString() },
      );

      return (friendIds || []).filter((id: string | undefined) =>
        Boolean(id && Types.ObjectId.isValid(id)),
      );
    } catch {
      return [];
    }
  }

  private getStrategyCounts(
    strategy: RecommendationStrategy,
    limit: number,
  ): {
    recommendedCount: number;
    friendCount: number;
    exploreCount: number;
  } {
    if (strategy === 'personalized') {
      const recommendedCount = Math.ceil(limit * 0.6);
      const friendCount = Math.ceil(limit * 0.2);
      return {
        recommendedCount,
        friendCount,
        exploreCount: Math.max(0, limit - recommendedCount - friendCount),
      };
    }

    const friendCount = Math.ceil(limit * 0.5);
    const recommendedCount = Math.ceil(limit * 0.3);
    return {
      recommendedCount,
      friendCount,
      exploreCount: Math.max(0, limit - friendCount - recommendedCount),
    };
  }

  private fetchRecommendedPosts(
    userObjectId: Types.ObjectId,
    topCategoryPreferences: CategoryPreference[],
    limit: number,
    strategy: RecommendationStrategy,
  ): Promise<any[]> {
    if (limit <= 0) {
      return Promise.resolve([]);
    }

    const filter: FilterQuery<PostDocument> = {
      isRecommendable: true,
      userId: { $ne: userObjectId },
      isHidden: { $ne: true },
      privacy_type: PrivacyType.PUBLIC,
    };

    if (strategy === 'personalized') {
      const topCategories = topCategoryPreferences.map(
        (preference) => preference.category,
      );
      filter.category = { $in: topCategories };
    }

    return this.fetchPosts(filter, limit, userObjectId, {
      scoreByCategoryPreferences:
        strategy === 'personalized' ? topCategoryPreferences : [],
    });
  }

  private fetchFriendPosts(
    userObjectId: Types.ObjectId,
    friendObjectIds: Types.ObjectId[],
    limit: number,
  ): Promise<any[]> {
    if (limit <= 0 || friendObjectIds.length === 0) {
      return Promise.resolve([]);
    }

    return this.fetchPosts(
      {
        $and: [
          {
            userId: { $in: friendObjectIds, $ne: userObjectId },
            isHidden: { $ne: true },
          },
          this.buildVisiblePostFilter(userObjectId, friendObjectIds),
        ],
      },
      limit,
      userObjectId,
    );
  }

  private fetchExplorePosts(
    userObjectId: Types.ObjectId,
    topCategories: PostCategory[],
    limit: number,
    strategy: RecommendationStrategy,
  ): Promise<any[]> {
    if (limit <= 0) {
      return Promise.resolve([]);
    }

    const filter: FilterQuery<PostDocument> = {
      isRecommendable: true,
      userId: { $ne: userObjectId },
      isHidden: { $ne: true },
      privacy_type: PrivacyType.PUBLIC,
    };

    if (strategy === 'personalized' && topCategories.length > 0) {
      filter.category = { $nin: topCategories };
    }

    return this.fetchPosts(filter, limit, userObjectId);
  }

  private async fetchAdditionalPosts(params: {
    userObjectId: Types.ObjectId;
    friendObjectIds: Types.ObjectId[];
    existingPostIds: string[];
    limit: number;
  }): Promise<SourcedPost[]> {
    if (params.limit <= 0) {
      return [];
    }

    const excludedPostIds = params.existingPostIds.map(
      (id) => new Types.ObjectId(id),
    );

    const posts = await this.fetchPosts(
      {
        $and: [
          {
            userId: { $ne: params.userObjectId },
            _id: { $nin: excludedPostIds },
            isHidden: { $ne: true },
          },
          {
            $or: [
              { privacy_type: PrivacyType.PUBLIC },
              { userId: { $in: params.friendObjectIds } },
            ],
          },
          this.buildVisiblePostFilter(
            params.userObjectId,
            params.friendObjectIds,
          ),
        ],
      },
      params.limit,
      params.userObjectId,
    );

    const friendIdSet = new Set(
      params.friendObjectIds.map((id) => id.toString()),
    );

    return posts.map((post) => ({
      post,
      source: friendIdSet.has(
        post.userId?._id?.toString?.() || post.userId?.toString?.(),
      )
        ? PostViewSource.FRIEND
        : PostViewSource.EXPLORE,
    }));
  }

  private fetchPosts(
    filter: FilterQuery<PostDocument>,
    limit: number,
    viewerObjectId: Types.ObjectId,
    options: {
      scoreByCategoryPreferences?: CategoryPreference[];
    } = {},
  ): Promise<any[]> {
    if (limit <= 0) {
      return Promise.resolve([]);
    }

    const categoryScoreStages = this.buildCategoryScoreStages(
      options.scoreByCategoryPreferences ?? [],
    );
    const pipeline: PipelineStage[] = [
      { $match: filter as any },
      ...this.buildNotViewedStages(viewerObjectId),
      ...categoryScoreStages,
      {
        $sort:
          categoryScoreStages.length > 0
            ? { recommendationCategoryScore: -1, createdAt: -1 }
            : { createdAt: -1 },
      },
      { $limit: limit },
      ...(categoryScoreStages.length > 0
        ? [{ $project: { recommendationCategoryScore: 0 } } as PipelineStage]
        : []),
    ];

    return this.postModel
      .aggregate(pipeline)
      .exec()
      .then((posts) => this.populatePosts(posts));
  }

  private buildCategoryScoreStages(
    categoryPreferences: CategoryPreference[],
  ): PipelineStage[] {
    if (categoryPreferences.length === 0) {
      return [];
    }

    return [
      {
        $addFields: {
          recommendationCategoryScore: {
            $switch: {
              branches: categoryPreferences.map((preference) => ({
                case: { $eq: ['$category', preference.category] },
                then: preference.score,
              })),
              default: 0,
            },
          },
        },
      },
    ];
  }

  private populatePosts(posts: any[]): Promise<any[]> {
    return this.postModel.populate(posts, [
      { path: 'userId', select: 'username fullName avatarUrl' },
      { path: 'taggedUserIds', select: 'username fullName avatarUrl' },
      { path: 'communityId', select: 'name avatar' },
      { path: 'urls', options: { sort: { order: 1 } } },
    ]);
  }

  private buildNotViewedStages(
    viewerObjectId: Types.ObjectId,
  ): PipelineStage[] {
    return [
      {
        $lookup: {
          from: this.userPostViewModel.collection.name,
          let: { postId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$userId', viewerObjectId] },
                    { $eq: ['$postId', '$$postId'] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: 'viewedByUser',
        },
      },
      { $match: { viewedByUser: { $eq: [] } } },
      { $project: { viewedByUser: 0 } },
    ];
  }

  private buildVisiblePostFilter(
    viewerObjectId: Types.ObjectId,
    friendObjectIds: Types.ObjectId[],
  ): FilterQuery<PostDocument> {
    return {
      $or: [
        { privacy_type: PrivacyType.PUBLIC },
        { userId: viewerObjectId },
        {
          privacy_type: PrivacyType.FRIENDS,
          userId: { $in: friendObjectIds },
        },
        {
          privacy_type: PrivacyType.FRIENDS_EXCEPT,
          userId: { $in: friendObjectIds },
          friends_except: { $nin: [viewerObjectId] },
        },
        {
          privacy_type: PrivacyType.FRIENDS_DETAIL,
          friends_detail: viewerObjectId,
        },
      ],
    };
  }

  private dedupePosts(posts: SourcedPost[]): SourcedPost[] {
    const seen = new Set<string>();
    const result: SourcedPost[] = [];

    for (const item of posts) {
      const postId = item.post?._id?.toString();
      if (!postId || seen.has(postId)) {
        continue;
      }

      seen.add(postId);
      result.push(item);
    }

    return result;
  }

  private async recordReturnedPostViews(
    userId: Types.ObjectId,
    posts: SourcedPost[],
  ): Promise<void> {
    if (posts.length === 0) {
      this.logger.warn(
        `[recommend-feed] skip UserPostView insert userId=${userId.toString()}, reason=no_posts`,
      );
      return;
    }

    const now = new Date();
    const operations = posts.map(({ post, source }) => ({
      updateOne: {
        filter: {
          userId,
          postId: new Types.ObjectId(post._id),
        },
        update: {
          $setOnInsert: {
            userId,
            postId: new Types.ObjectId(post._id),
            viewedAt: now,
            source,
          },
        },
        upsert: true,
      },
    }));

    this.logger.log(
      `[recommend-feed] upsert UserPostView userId=${userId.toString()}, collection=${this.userPostViewModel.collection.name}, attempted=${operations.length}, postIds=${posts.map(({ post }) => post._id.toString()).join(',')}`,
    );

    try {
      const result: any = await this.userPostViewModel.bulkWrite(operations, {
        ordered: false,
      });
      const totalForUser = await this.userPostViewModel
        .countDocuments({ userId })
        .exec();

      this.logger.log(
        `[recommend-feed] upsert UserPostView done userId=${userId.toString()}, inserted=${result?.upsertedCount ?? 0}, matched=${result?.matchedCount ?? 0}, modified=${result?.modifiedCount ?? 0}, totalForUser=${totalForUser}`,
      );
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) {
        const totalForUser = await this.userPostViewModel
          .countDocuments({ userId })
          .exec();
        this.logger.warn(
          `[recommend-feed] UserPostView duplicate ignored userId=${userId.toString()}, attempted=${operations.length}, totalForUser=${totalForUser}`,
        );
        return;
      }

      this.logger.error(
        `[recommend-feed] UserPostView upsert failed userId=${userId.toString()}, error=${error.message}`,
      );
      throw error;
    }
  }

  private formatPostForClient(post: any): any {
    const formatted = { ...post };

    if (
      formatted.userId &&
      typeof formatted.userId === 'object' &&
      formatted.userId._id
    ) {
      formatted.userId = {
        userId: formatted.userId._id,
        fullName: formatted.userId.fullName,
        avatarUrl: formatted.userId.avatarUrl,
        username: formatted.userId.username,
      };
    }

    if (Array.isArray(formatted.taggedUserIds)) {
      formatted.taggedUsers = formatted.taggedUserIds.map((user: any) => ({
        userId: user._id,
        fullName: user.fullName,
        avatarUrl: user.avatarUrl,
        username: user.username,
      }));
    }

    delete formatted.category;
    delete formatted.categoryConfidence;
    delete formatted.categorySource;
    delete formatted.isRecommendable;
    delete formatted.recommendationCategoryScore;

    return formatted;
  }
}
