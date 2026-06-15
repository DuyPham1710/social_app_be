import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { FilterQuery, Model, Types } from 'mongoose';
import { PostCategory } from 'src/common/enums/post-category.enum';
import { PostViewSource } from 'src/common/enums/post-view-source.enum';
import { isMongoDuplicateKeyError } from 'src/common/utils/mongo-duplicate-key.util';
import { shuffle } from 'src/common/utils/shuffle.util';
import { Post, PostDocument } from 'src/modules/post/schemas/post.schema';
import { PrivacyType } from 'src/shared/enums/privacy_type';
import { AppEvents } from 'src/shared/enums/app-events.enum';
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

    const [topCategories, viewedPostIds, friendIds] = await Promise.all([
      this.getTopCategories(userObjectId),
      this.getViewedPostIds(userObjectId),
      this.getFriendIds(userId),
    ]);

    const strategy: RecommendationStrategy =
      topCategories.length > 0 ? 'personalized' : 'cold_start';
    const counts = this.getStrategyCounts(strategy, limit);
    const viewedObjectIds = viewedPostIds.map((id) => new Types.ObjectId(id));
    const friendObjectIds = friendIds.map((id) => new Types.ObjectId(id));

    this.logger.log(
      `[recommend-feed] context userId=${userId}, strategy=${strategy}, topCategories=${topCategories.join(',') || 'none'}, viewedCount=${viewedPostIds.length}, friendCount=${friendIds.length}, counts=${JSON.stringify(counts)}`,
    );

    const [recommendedPosts, friendPosts, explorePosts] = await Promise.all([
      this.fetchRecommendedPosts(
        userObjectId,
        topCategories,
        viewedObjectIds,
        counts.recommendedCount,
        strategy,
      ),
      this.fetchFriendPosts(
        userObjectId,
        friendObjectIds,
        viewedObjectIds,
        counts.friendCount,
      ),
      this.fetchExplorePosts(
        userObjectId,
        topCategories,
        viewedObjectIds,
        counts.exploreCount,
        strategy,
      ),
    ]);

    const visibleFriendPosts = await this.filterVisiblePosts(
      friendPosts,
      userId,
    );
    let mergedPosts = this.dedupePosts([
      ...recommendedPosts.map((post) => ({
        post,
        source: PostViewSource.RECOMMENDATION,
      })),
      ...visibleFriendPosts.map((post) => ({
        post,
        source: PostViewSource.FRIEND,
      })),
      ...explorePosts.map((post) => ({ post, source: PostViewSource.EXPLORE })),
    ]);

    this.logger.log(
      `[recommend-feed] fetched userId=${userId}, recommended=${recommendedPosts.length}, friendRaw=${friendPosts.length}, friendVisible=${visibleFriendPosts.length}, explore=${explorePosts.length}, mergedBeforeShuffle=${mergedPosts.length}`,
    );

    mergedPosts = shuffle(mergedPosts).slice(0, limit);

    if (mergedPosts.length < limit) {
      const additionalPosts = await this.fetchAdditionalPosts({
        userObjectId,
        friendObjectIds,
        viewedObjectIds,
        existingPostIds: mergedPosts.map(({ post }) => post._id.toString()),
        limit: limit - mergedPosts.length,
        viewerId: userId,
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

  private async getTopCategories(
    userId: Types.ObjectId,
  ): Promise<PostCategory[]> {
    const preferences = await this.userCategoryPreferenceModel
      .find({
        userId,
        score: { $gt: 0 },
      })
      .sort({ score: -1 })
      .limit(5)
      .select('category')
      .lean()
      .exec();

    return preferences.map((preference) => preference.category);
  }

  private async getViewedPostIds(userId: Types.ObjectId): Promise<string[]> {
    const views = await this.userPostViewModel
      .find({ userId })
      .select('postId')
      .lean()
      .exec();

    return views.map((view) => view.postId.toString());
  }

  private async getFriendIds(userId: string): Promise<string[]> {
    try {
      const [friends] = await this.eventEmitter.emitAsync(
        AppEvents.FRIENDS_GET,
        { userId },
      );
      return (friends || [])
        .map((friend: any) => friend?._id?.toString())
        .filter(
          (id: string | undefined) => id && Types.ObjectId.isValid(id),
        ) as string[];
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
    topCategories: PostCategory[],
    viewedPostIds: Types.ObjectId[],
    limit: number,
    strategy: RecommendationStrategy,
  ): Promise<any[]> {
    if (limit <= 0) {
      return Promise.resolve([]);
    }

    const filter: FilterQuery<PostDocument> = {
      isRecommendable: true,
      userId: { $ne: userObjectId },
      _id: { $nin: viewedPostIds },
      isHidden: { $ne: true },
      privacy_type: PrivacyType.PUBLIC,
    };

    if (strategy === 'personalized') {
      filter.category = { $in: topCategories };
    }

    return this.fetchPosts(filter, limit);
  }

  private fetchFriendPosts(
    userObjectId: Types.ObjectId,
    friendObjectIds: Types.ObjectId[],
    viewedPostIds: Types.ObjectId[],
    limit: number,
  ): Promise<any[]> {
    if (limit <= 0 || friendObjectIds.length === 0) {
      return Promise.resolve([]);
    }

    return this.fetchPosts(
      {
        userId: { $in: friendObjectIds, $ne: userObjectId },
        _id: { $nin: viewedPostIds },
        isHidden: { $ne: true },
      },
      Math.max(limit * 2, limit),
    ).then((posts) => posts.slice(0, limit));
  }

  private fetchExplorePosts(
    userObjectId: Types.ObjectId,
    topCategories: PostCategory[],
    viewedPostIds: Types.ObjectId[],
    limit: number,
    strategy: RecommendationStrategy,
  ): Promise<any[]> {
    if (limit <= 0) {
      return Promise.resolve([]);
    }

    const filter: FilterQuery<PostDocument> = {
      isRecommendable: true,
      userId: { $ne: userObjectId },
      _id: { $nin: viewedPostIds },
      isHidden: { $ne: true },
      privacy_type: PrivacyType.PUBLIC,
    };

    if (strategy === 'personalized' && topCategories.length > 0) {
      filter.category = { $nin: topCategories };
    }

    return this.fetchPosts(filter, limit);
  }

  private async fetchAdditionalPosts(params: {
    userObjectId: Types.ObjectId;
    friendObjectIds: Types.ObjectId[];
    viewedObjectIds: Types.ObjectId[];
    existingPostIds: string[];
    limit: number;
    viewerId: string;
  }): Promise<SourcedPost[]> {
    if (params.limit <= 0) {
      return [];
    }

    const excludedPostIds = [
      ...params.viewedObjectIds,
      ...params.existingPostIds.map((id) => new Types.ObjectId(id)),
    ];

    const posts = await this.fetchPosts(
      {
        userId: { $ne: params.userObjectId },
        _id: { $nin: excludedPostIds },
        isHidden: { $ne: true },
        $or: [
          { privacy_type: PrivacyType.PUBLIC },
          { userId: { $in: params.friendObjectIds } },
        ],
      },
      Math.max(params.limit * 3, params.limit),
    );

    const visiblePosts = await this.filterVisiblePosts(posts, params.viewerId);
    const friendIdSet = new Set(
      params.friendObjectIds.map((id) => id.toString()),
    );

    return visiblePosts.slice(0, params.limit).map((post) => ({
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
  ): Promise<any[]> {
    if (limit <= 0) {
      return Promise.resolve([]);
    }

    return this.postModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('userId', 'username fullName avatarUrl')
      .populate('taggedUserIds', 'username fullName avatarUrl')
      .populate('communityId', 'name avatar')
      .populate({ path: 'urls', options: { sort: { order: 1 } } })
      .lean()
      .exec();
  }

  private async filterVisiblePosts(
    posts: any[],
    viewerId: string,
  ): Promise<any[]> {
    const visiblePosts = await Promise.all(
      posts.map(async (post) => {
        try {
          const [canView] = await this.eventEmitter.emitAsync(
            AppEvents.POST_CAN_VIEW,
            {
              postId: post._id.toString(),
              viewerId,
            },
          );

          return canView ? post : null;
        } catch {
          return null;
        }
      }),
    );

    return visiblePosts.filter(Boolean);
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

    return formatted;
  }
}
