import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  Inject,
  forwardRef,
  Logger,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Post, PostDocument } from './schemas/post.schema';
import { PostUrl, PostUrlDocument } from './schemas/post-url.schema';
import { PostView, PostViewDocument } from './schemas/post-view.schema';
import { Model, PipelineStage, Types } from 'mongoose';
import { CreatePostDto } from './dto/create-post.dto';
import { UpdatePostDto } from './dto/update-post.dto';
import { UpdatePrivacyDto } from 'src/common/dto/update-privacy.dto';
import { PrivacyUtil } from 'src/common/utils/privacy.util';
import { PrivacyType } from 'src/shared/enums/privacy_type';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { AppEvents } from 'src/shared/enums/app-events.enum';
import { PostResponseDto } from './dto/post-response.dto';
import { PostListDto } from './dto/post-list.dto';
import { plainToInstance } from 'class-transformer';
import UserResponseDto from '../user/dto/user.response.dto';
import { omitBy, isUndefined } from 'lodash';
import { v2 as cloudinary } from 'cloudinary';
import { PostReport, PostReportDocument } from './schemas/post-report.schema';
import { ReportPostDto } from './dto/report-post.dto';
import { NotificationService } from '../notification/notification.service';
import { NotificationType } from 'src/shared/enums/notification_type';
import { GoogleTranslationService } from 'src/shared/translation/google-translation.service';
import { File } from 'multer';
import * as fs from 'fs';
import { ImageModerationService } from '../../shared/services/image-moderation.service';
import { TextModerationService } from '../../shared/services/text-moderation.service';
import { langsMatch } from 'src/shared/translation/lang-compare.util';
import { CommunityPostStatus } from './schemas/post.schema';
import {
  PostCategoryClassifierService,
  PostCategoryClassificationResult,
} from 'src/modules/recommendations/services/post-category-classifier.service';
import { PostCategorySource } from 'src/common/enums/post-category-source.enum';
import { RecommendationInteractionService } from 'src/modules/recommendations/services/recommendation-interaction.service';
import { PostInteractionType } from 'src/common/enums/post-interaction-type.enum';
import { RECOMMENDATION_FEED_GET_EVENT } from 'src/modules/recommendations/services/recommendation-feed.service';

@Injectable()
export class PostService {
  private readonly logger = new Logger(PostService.name);

  constructor(
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    @InjectModel(PostUrl.name) private postUrlModel: Model<PostUrlDocument>,
    @InjectModel(PostReport.name)
    private postReportModel: Model<PostReportDocument>,
    @InjectModel(PostView.name) private postViewModel: Model<PostViewDocument>,
    private readonly eventEmitter: EventEmitter2,
    @Inject(forwardRef(() => NotificationService))
    private readonly notificationService: NotificationService,
    private readonly imageModerationService: ImageModerationService,
    private readonly googleTranslationService: GoogleTranslationService,
    private readonly textModerationService: TextModerationService,
    private readonly postCategoryClassifierService: PostCategoryClassifierService,
    private readonly recommendationInteractionService: RecommendationInteractionService,
  ) {}

  private async recordUniquePostView(
    postId: Types.ObjectId,
    userId: Types.ObjectId,
  ): Promise<boolean> {
    const result = await this.postViewModel.updateOne(
      { postId, userId },
      { $setOnInsert: { postId, userId } },
      { upsert: true },
    );

    // Nếu insert mới thì Mongo sẽ trả về upsertedId (tuỳ phiên bản Mongoose)
    return Boolean((result as any)?.upsertedId);
  }

  async viewPost(
    postId: string,
    userId: string,
  ): Promise<{ viewCount: number; isFirstTimeView: boolean }> {
    const canView = await this.canViewPost({
      postId: postId.toString(),
      viewerId: userId.toString(),
    });
    if (!canView) {
      throw new ForbiddenException('Bạn không có quyền xem bài viết này');
    }

    if (!Types.ObjectId.isValid(postId)) {
      throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
    }
    if (!Types.ObjectId.isValid(userId)) {
      throw new HttpException('Invalid userId', HttpStatus.BAD_REQUEST);
    }

    const postObjectId = new Types.ObjectId(postId);
    const userObjectId = new Types.ObjectId(userId);

    const post = await this.postModel
      .findOne({ _id: postObjectId, isHidden: { $ne: true }, communityStatus: { $ne: CommunityPostStatus.REJECTED } })
      .select('viewCount')
      .lean()
      .exec();
    if (!post) {
      throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
    }

    const isFirstTimeView = await this.recordUniquePostView(
      postObjectId,
      userObjectId,
    );
    if (isFirstTimeView) {
      const updated = await this.postModel
        .findByIdAndUpdate(
          postObjectId,
          { $inc: { viewCount: 1 } },
          { new: true },
        )
        .select('viewCount')
        .lean()
        .exec();

      await this.trackRecommendationView(userId, postId);

      return {
        viewCount: (updated as any)?.viewCount ?? (post as any)?.viewCount ?? 0,
        isFirstTimeView,
      };
    }

    return { viewCount: (post as any)?.viewCount ?? 0, isFirstTimeView };
  }

  private async trackRecommendationView(
    userId: string,
    postId: string,
  ): Promise<void> {
    try {
      await this.recommendationInteractionService.trackInteraction(
        userId,
        postId,
        PostInteractionType.VIEW,
      );
    } catch (error) {
      this.logger.warn(
        `Không thể ghi nhận recommendation view cho post ${postId}: ${error.message}`,
      );
    }
  }

  async getPostDetail(
    postId: string,
    userId: string,
  ): Promise<PostResponseDto> {
    const canView = await this.canViewPost({
      postId: postId.toString(),
      viewerId: userId.toString(),
    });
    if (canView) {
      if (!Types.ObjectId.isValid(postId)) {
        throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
      }

      const postObjectId = new Types.ObjectId(postId);

      const post = await this.postModel
        .findOne({ _id: postObjectId, isHidden: { $ne: true }, communityStatus: { $ne: CommunityPostStatus.REJECTED } })
        .populate('userId', 'username fullName avatarUrl')
        .populate('taggedUserIds', 'username fullName avatarUrl')
        .populate({ path: 'urls', options: { sort: { order: 1 } } })
        .populate('communityId', 'name avatar')
        .exec();
      if (!post) {
        throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
      }

      const userResponseDto: UserResponseDto = plainToInstance(
        UserResponseDto,
        post.userId,
        {
          excludeExtraneousValues: true,
        },
      );
      const cleanedUser = omitBy(
        userResponseDto,
        isUndefined,
      ) as UserResponseDto;

      // Lấy danh sách react của từng post thông qua event emitter
      const [reactsMap] = await this.eventEmitter.emitAsync(
        AppEvents.REACT_POST_GET,
        { postIds: [postId], viewerId: userId },
      );
      const [reactMap] = await this.eventEmitter.emitAsync(
        AppEvents.REACT_POST_FIND_BY_USER,
        { userId: userId, postIds: [postId] },
      );

      return {
        ...post.toObject(),
        userId: cleanedUser,
        taggedUsers: post.taggedUserIds?.map((u) =>
          omitBy(
            plainToInstance(UserResponseDto, u, {
              excludeExtraneousValues: true,
            }),
            isUndefined,
          ),
        ),
        reacts: reactsMap[postId] || [],
        isReact: reactMap[postId] || null,
      } as unknown as PostResponseDto;
    }
    return null as unknown as PostResponseDto;
  }

  async getAllPostsByUser(
    ownerId: string,
    viewerId: string,
    page: number = 1,
    limit: number = 5,
  ) {
    if (!Types.ObjectId.isValid(ownerId)) {
      throw new HttpException('Invalid ownerId', HttpStatus.BAD_REQUEST);
    }

    // nếu là admin thì ko cần check privacy
    if (Types.ObjectId.isValid(viewerId)) {
      const [isAdmin] = await this.eventEmitter.emitAsync(
        AppEvents.USER_IS_ADMIN,
        { userId: viewerId },
      );
      if (isAdmin) {
        viewerId = ownerId;
      }
    }

    // nếu không có viewerId thì mặc định viewer chính là owner
    const effectiveViewerId = viewerId ?? ownerId;
    //  console.log('effectiveViewerId', effectiveViewerId);
    if (!Types.ObjectId.isValid(effectiveViewerId)) {
      throw new HttpException('Invalid viewerId', HttpStatus.BAD_REQUEST);
    }

    const [userExist] = await this.eventEmitter.emitAsync(
      AppEvents.USER_CHECK_EXISTS,
      { userId: ownerId },
    );
    if (!userExist) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const skip = (page - 1) * limit;

    const ownerObjectId = new Types.ObjectId(ownerId);

    const viewerObjectId = new Types.ObjectId(effectiveViewerId);
    const isOwnProfile = ownerId === effectiveViewerId;
    const query = {
      $or: [
        { userId: ownerObjectId },
        { visibleOnProfileUserIds: ownerObjectId },
      ],
      isHidden: { $ne: true },
      communityId: null,
    };
    const visibilityStages = this.buildProfilePostVisibilityStages(
      viewerObjectId,
      isOwnProfile,
    );
    const hiddenRecommendationFieldsProjection = {
      category: 0,
      categoryConfidence: 0,
      categorySource: 0,
      isRecommendable: 0,
      viewerFriendship: 0,
    };

    const [rawPosts, countResult] = await Promise.all([
      this.postModel
        .aggregate([
          { $match: query },
          ...visibilityStages,
          { $project: hiddenRecommendationFieldsProjection },
          { $sort: { createdAt: -1 } },
          { $skip: skip },
          { $limit: limit },
        ] as PipelineStage[])
        .exec(),
      this.postModel
        .aggregate([
          { $match: query },
          ...visibilityStages,
          { $count: 'total' },
        ] as PipelineStage[])
        .exec(),
    ]);

    const totalPosts = countResult[0]?.total ?? 0;
    const posts = await this.populateProfilePosts(rawPosts);

    const filteredPosts = posts.map((post: any) => {
      if (
        post &&
        post.userId &&
        typeof post.userId === 'object' &&
        post.userId._id
      ) {
        post.userId = {
          userId: post.userId._id,
          fullName: post.userId.fullName,
          avatarUrl: post.userId.avatarUrl,
          username: post.userId.username,
        };
      }
      if (post && post.taggedUserIds && Array.isArray(post.taggedUserIds)) {
        post.taggedUsers = post.taggedUserIds.map((u: any) => ({
          userId: u._id,
          fullName: u.fullName,
          avatarUrl: u.avatarUrl,
          username: u.username,
        }));
      }
      return post;
    });

    const hasNext = skip + posts.length < totalPosts;

    // Lấy danh sách react của từng post thông qua event emitter
    const [reactsMap] = await this.eventEmitter.emitAsync(
      AppEvents.REACT_POST_GET,
      {
        postIds: filteredPosts.map((p) => p._id.toString()),
        viewerId: effectiveViewerId,
      },
    );
    const [reactMap] = await this.eventEmitter.emitAsync(
      AppEvents.REACT_POST_FIND_BY_USER,
      { userId: ownerId, postIds: filteredPosts.map((p) => p._id.toString()) },
    );

    // Thêm thông tin react vào từng post
    const postsWithReacts = filteredPosts.map((post) => ({
      ...post,
      reacts: reactsMap[post._id.toString()] || [],
      isReact: reactMap[post._id.toString()] || null,
    }));

    return {
      data: postsWithReacts,
      page,
      limit,
      total: postsWithReacts.length,
      hasNext,
    };
  }

  private buildProfilePostVisibilityStages(
    viewerObjectId: Types.ObjectId,
    isOwnProfile: boolean,
  ): PipelineStage[] {
    if (isOwnProfile) {
      return [];
    }

    return [
      {
        $lookup: {
          from: 'friends',
          let: { authorId: '$userId' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ['$user_id', '$$authorId'] },
                    { $eq: ['$friend_id', viewerObjectId] },
                  ],
                },
              },
            },
            { $limit: 1 },
          ],
          as: 'viewerFriendship',
        },
      },
      {
        $match: {
          $or: [
            { privacy_type: PrivacyType.PUBLIC },
            { userId: viewerObjectId },
            {
              privacy_type: PrivacyType.FRIENDS,
              viewerFriendship: { $ne: [] },
            },
            {
              privacy_type: PrivacyType.FRIENDS_EXCEPT,
              viewerFriendship: { $ne: [] },
              friends_except: { $nin: [viewerObjectId] },
            },
            {
              privacy_type: PrivacyType.FRIENDS_DETAIL,
              friends_detail: viewerObjectId,
            },
          ],
        },
      },
    ];
  }

  private populateProfilePosts(posts: any[]): Promise<any[]> {
    return this.postModel.populate(posts, [
      { path: 'userId', select: 'username fullName avatarUrl' },
      { path: 'taggedUserIds', select: 'username fullName avatarUrl' },
      { path: 'communityId', select: 'name avatar' },
      { path: 'urls', options: { sort: { order: 1 } } },
    ]);
  }

  async getUserCommunityPosts(
    userId: string,
    page: number = 1,
    limit: number = 10,
    status: string = 'all',
  ) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new HttpException('Invalid userId', HttpStatus.BAD_REQUEST);
    }

    const skip = (page - 1) * limit;
    const userObjectId = new Types.ObjectId(userId);

    // Build filter
    let filter: any = {
      userId: userObjectId,
      communityId: { $ne: null },
      isHidden: { $ne: true },
    };

    if (status === 'pending') {
      filter.communityStatus = 'pending';
    } else if (status === 'approved') {
      filter.communityStatus = 'approved';
    } else {
      filter.communityStatus = { $ne: CommunityPostStatus.REJECTED };
    }
    // if status === 'all', include all posts with any communityStatus except rejected

    const [posts, total] = await Promise.all([
      this.postModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'username fullName avatarUrl')
        .populate('communityId', 'name avatar')
        .populate({ path: 'urls', options: { sort: { order: 1 } } })
        .lean()
        .exec(),
      this.postModel.countDocuments(filter),
    ]);

    // Lấy react info
    const postIds = posts.map((p: any) => p._id.toString());
    const [reactsMap] = await this.eventEmitter.emitAsync(
      AppEvents.REACT_POST_GET,
      { postIds, viewerId: userId },
    );
    const [reactMap] = await this.eventEmitter.emitAsync(
      AppEvents.REACT_POST_FIND_BY_USER,
      { userId, postIds },
    );

    const postsWithReacts = posts.map((post: any) => ({
      ...post,
      reacts: reactsMap?.[post._id.toString()] || [],
      isReact: reactMap?.[post._id.toString()] || null,
    }));

    return {
      data: postsWithReacts,
      page,
      limit,
      total,
      hasNext: skip + posts.length < total,
    };
  }

  async getAllPostsHomePage(
    viewerId: string,
    page: number = 1,
    limit: number = 5,
  ): Promise<PostListDto> {
    if (!Types.ObjectId.isValid(viewerId)) {
      throw new HttpException('Invalid viewerId', HttpStatus.BAD_REQUEST);
    }

    try {
      const [recommendationFeed] = await this.eventEmitter.emitAsync(
        RECOMMENDATION_FEED_GET_EVENT,
        {
          userId: viewerId,
          page,
          limit,
        },
      );

      if (!recommendationFeed) {
        throw new Error('Recommendation feed event returned no result');
      }

      const postIds = recommendationFeed.data
        .map((post: any) => post?._id?.toString())
        .filter(Boolean);

      const [reactsMap] = await this.eventEmitter.emitAsync(
        AppEvents.REACT_POST_GET,
        { postIds, viewerId },
      );
      const [reactMap] = await this.eventEmitter.emitAsync(
        AppEvents.REACT_POST_FIND_BY_USER,
        { userId: viewerId, postIds },
      );

      const postsWithReacts = recommendationFeed.data.map((post: any) => ({
        ...post,
        reacts: reactsMap?.[post._id.toString()] || [],
        isReact: reactMap?.[post._id.toString()] || null,
      }));

      return {
        data: postsWithReacts,
        page,
        limit,
        total: postsWithReacts.length,
        hasNext: recommendationFeed.meta.totalReturned >= limit,
      };
    } catch (error) {
      this.logger.error(
        `Không thể lấy recommendation feed cho /post/home: ${error.message}`,
      );
    }

    // Lấy danh sách bạn bè
    const [friends] = await this.eventEmitter.emitAsync(AppEvents.FRIENDS_GET, {
      userId: viewerId,
    });
    const friendIds = friends.map((f) => f._id);

    const skip = (page - 1) * limit;

    // Query post của bạn bè
    let friendsPosts: PostDocument[] = await this.postModel
      .find({ userId: { $in: friendIds }, isHidden: { $ne: true }, communityStatus: { $nin: [CommunityPostStatus.REJECTED, CommunityPostStatus.PENDING] } })
      .populate('userId', 'username fullName avatarUrl')
      .populate('taggedUserIds', 'username fullName avatarUrl')
      .populate('communityId', 'name avatar')
      .populate({ path: 'urls', options: { sort: { order: 1 } } })
      .sort({ createdAt: -1 })
      // .skip(skip)
      // .limit(limit)
      .lean()
      .exec();

    // lọc theo quyền riêng tư
    const filteredPosts: PostDocument[] = (
      await Promise.all(
        friendsPosts.map(async (post) => {
          const canView = await this.canUserViewPost(
            post._id.toString(),
            viewerId,
          );
          return canView ? post : null;
        }),
      )
    ).filter((p) => p !== null);

    // query post của mình
    const myPosts: PostDocument[] = await this.postModel
      .find({ userId: new Types.ObjectId(viewerId), isHidden: { $ne: true }, communityStatus: { $nin: [CommunityPostStatus.REJECTED, CommunityPostStatus.PENDING] } })
      .populate('userId', 'username fullName avatarUrl')
      .populate('taggedUserIds', 'username fullName avatarUrl')
      .populate('communityId', 'name avatar')
      .populate({ path: 'urls', options: { sort: { order: 1 } } })
      .sort({ createdAt: -1 })
      // .skip(skip)
      // .limit(limit)
      .lean()
      .exec();

    // Gộp tất cả posts và sắp xếp theo createdAt
    let allPosts: PostDocument[] = [...filteredPosts, ...myPosts];
    //     allPosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Nếu chưa đủ để fill trang hiện tại + check next page
    const neededCount = skip + limit + 1;
    if (allPosts.length < neededCount) {
      // Lấy các ID đã có để loại trừ
      const existingPostIds = allPosts.map((p) => p._id.toString());
      const existingUserIds = [
        ...friendIds.map((id) => id.toString()),
        viewerId,
      ];

      // Bổ sung post public
      let publicPosts: PostDocument[] = await this.postModel
        .find({
          privacy_type: PrivacyType.PUBLIC,
          userId: { $nin: existingUserIds.map((id) => new Types.ObjectId(id)) },
          _id: { $nin: existingPostIds.map((id) => new Types.ObjectId(id)) },
          isHidden: { $ne: true },
          communityStatus: { $nin: [CommunityPostStatus.REJECTED, CommunityPostStatus.PENDING] },
        })
        .populate('userId', 'username fullName avatarUrl')
        .populate('taggedUserIds', 'username fullName avatarUrl')
        .populate({ path: 'urls', options: { sort: { order: 1 } } })
        .sort({ createdAt: -1 })
        .lean()
        .exec();

      allPosts = [...allPosts, ...publicPosts];
      // Sắp xếp lại sau khi thêm public posts
      //    allPosts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }

    // Random shuffle array sử dụng Fisher-Yates algorithm
    for (let i = allPosts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [allPosts[i], allPosts[j]] = [allPosts[j], allPosts[i]];
    }

    // Lấy posts cho trang hiện tại (limit + 1 để check hasNext)
    const postsWithExtra = allPosts.slice(skip, skip + limit + 1);

    // hasNext = true nếu có nhiều hơn limit items
    const hasNext = postsWithExtra.length > limit;

    // Chỉ lấy đúng limit items để trả về
    const pageItems: PostResponseDto[] = postsWithExtra
      .slice(0, limit)
      .map((post: any) => {
        if (
          post &&
          post.userId &&
          typeof post.userId === 'object' &&
          post.userId._id
        ) {
          post.userId = {
            userId: post.userId._id,
            fullName: post.userId.fullName,
            avatarUrl: post.userId.avatarUrl,
            username: post.userId.username,
          };
        }
        if (post && post.taggedUserIds && Array.isArray(post.taggedUserIds)) {
          post.taggedUsers = post.taggedUserIds.map((u: any) => ({
            userId: u._id,
            fullName: u.fullName,
            avatarUrl: u.avatarUrl,
            username: u.username,
          }));
        }
        return post;
      });

    // Lấy danh sách react của từng post thông qua event emitter
    const [reactsMap] = await this.eventEmitter.emitAsync(
      AppEvents.REACT_POST_GET,
      { postIds: pageItems.map((p) => p._id.toString()), viewerId },
    );
    const [reactMap] = await this.eventEmitter.emitAsync(
      AppEvents.REACT_POST_FIND_BY_USER,
      { userId: viewerId, postIds: pageItems.map((p) => p._id.toString()) },
    );

    // Thêm thông tin react vào từng post
    const postsWithReacts: PostResponseDto[] = pageItems.map((post) => ({
      ...post,
      reacts: reactsMap[post._id.toString()] || [],
      isReact: reactMap[post._id.toString()] || null,
    }));

    // return {
    //     data: pageItems,
    //     page,
    //     limit,
    //     total: pageItems.length,
    //     hasNext,
    // };
    const result: PostListDto = {
      data: postsWithReacts,
      page,
      limit,
      total: postsWithReacts.length,
      hasNext,
    };

    return result;
  }

  async createPost(
    createPostDto: CreatePostDto,
    userId: string,
    files?: File[],
  ): Promise<{ message: string }> {
    const {
      caption,
      titles = [],
      orders = [],
      layout,
      privacy_type,
      friends_except,
      friends_detail,
      communityId,
      taggedUserIds,
      location,
      latitude,
      longitude,
    } = createPostDto;

    let communityPostStatus: CommunityPostStatus | null = null;
    if (communityId) {
      const [memberInfo] = await this.eventEmitter.emitAsync(
        AppEvents.COMMUNITY_GET_MEMBER_ROLE,
        {
          communityId,
          userId,
        },
      );

      communityPostStatus =
        memberInfo?.role === 'admin'
          ? CommunityPostStatus.APPROVED
          : CommunityPostStatus.PENDING;
    }

    // Kiểm duyệt nội dung caption trước
    if (caption && caption.trim().length > 0) {
      const textResult = await this.textModerationService.checkText(caption);
      if (!textResult.is_safe) {
        // Xóa file tạm nếu có
        if (files && files.length > 0) {
          this.cleanupTempFiles(files);
        }
        throw new BadRequestException(
          'Nội dung bài viết vi phạm tiêu chuẩn cộng đồng! Vui lòng chỉnh sửa nội dung.',
        );
      }
    }

    // Kiểm duyệt hình ảnh trước khi upload
    if (files && files.length > 0) {
      const moderationResults =
        await this.imageModerationService.checkImages(files);
      const violatedImage = moderationResults.find((r) => !r.is_safe);

      if (violatedImage) {
        // Xóa tất cả file tạm trên disk
        this.cleanupTempFiles(files);
        throw new BadRequestException(
          `Hình ảnh vi phạm tiêu chuẩn cộng đồng! Vui lòng chọn hình ảnh khác.`,
        );
      }
    }

    // Kiểm duyệt video và blur các đoạn vi phạm (nếu có)
    const blurredVideoPaths: string[] = [];
    if (files && files.length > 0) {
      const videoFiles = files.filter((f) => f.mimetype?.startsWith('video/'));
      for (const videoFile of videoFiles) {
        try {
          const videoResult =
            await this.imageModerationService.checkVideo(videoFile);

          if (!videoResult.is_safe) {
            // Nếu video bị chặn hoàn toàn (vi phạm > 90%)
            if (videoResult.block_completely) {
              this.logger.warn(
                `Video "${videoFile.originalname}" vi phạm hơn 90% nội dung. Chặn hoàn toàn!`,
              );
              this.cleanupTempFiles(files);
              throw new BadRequestException(
                `Video của bạn vi phạm nghiêm trọng tiêu chuẩn cộng đồng! Vui lòng chọn video khác.`,
              );
            }

            if (
              videoResult.has_blurred_video &&
              videoResult.blurred_video_path
            ) {
              // Xóa ngay video gốc (vi phạm) để giải phóng bộ nhớ, tránh file rác vì ta đã có bản blur
              try {
                if (fs.existsSync(videoFile.path)) {
                  fs.unlinkSync(videoFile.path);
                  this.logger.debug(
                    `Đã xóa file video gốc (vi phạm): ${videoFile.path}`,
                  );
                }
              } catch (err) {
                this.logger.warn(`Lỗi khi xóa video gốc: ${err.message}`);
              }

              // Thay thế đường dẫn file gốc bằng video đã blur
              this.logger.warn(
                `Video "${videoFile.originalname}" đã được blur do vi phạm tiêu chuẩn cộng đồng`,
              );
              (videoFile as any).path = videoResult.blurred_video_path;
              blurredVideoPaths.push(videoResult.blurred_video_path);
            }
          }
        } catch (error) {
          if (error instanceof BadRequestException) {
            throw error; // Bắn thẳng lỗi này ra ngoài cho user biết
          }
          this.logger.error(
            `Lỗi kiểm duyệt video "${videoFile.originalname}": ${error.message}`,
          );
          // Cho phép upload nếu AI service lỗi
        }
      }
    }

    const classification = await this.classifyCaptionForRecommendation(caption);

    const post = await this.postModel.create({
      caption,
      location,
      latitude,
      longitude,
      userId: new Types.ObjectId(userId),
      category: classification.category,
      categoryConfidence: classification.confidence,
      categorySource: classification.source,
      isRecommendable: classification.isRecommendable,
      layout,
      privacy_type,
      friends_except: friends_except
        ? friends_except.map((id) => new Types.ObjectId(id))
        : undefined,
      friends_detail: friends_detail
        ? friends_detail.map((id) => new Types.ObjectId(id))
        : undefined,
      taggedUserIds: taggedUserIds
        ? taggedUserIds.map((id) => new Types.ObjectId(id))
        : undefined,
      // Nếu có communityId thì set trạng thái pending cần duyệt
      ...(communityId
        ? {
            communityId: new Types.ObjectId(communityId),
            communityStatus: communityPostStatus,
          }
        : {}),
    });

    // Upload file từ disk lên Cloudinary
    if (files && files.length > 0) {
      try {
        const postId = post._id.toString();
        const uploadedUrls: any[] = [];

        const uploadResults = await Promise.all(
          files.map((file, index) => {
            const isVideo = file.mimetype?.startsWith('video/');
            const isImage = file.mimetype?.startsWith('image/');

            const allowedFormats = [
              'jpg',
              'png',
              'jpeg',
              'gif',
              'webp',
              'mp4',
              'mov',
              'avi',
              'webm',
              'mkv',
              'flv',
              'wmv',
            ];

            const uploadOptions: any = {
              folder: `uploads/${postId}`,
              allowed_formats: allowedFormats,
            };

            if (isVideo) {
              uploadOptions.resource_type = 'video';
              uploadOptions.transformation = [
                {
                  width: 1920,
                  height: 1080,
                  crop: 'limit',
                  quality: 'auto',
                  fetch_format: 'auto',
                },
              ];
            } else if (isImage) {
              uploadOptions.resource_type = 'image';
              uploadOptions.transformation = [
                { width: 1080, height: 1080, crop: 'limit' },
              ];
            } else {
              uploadOptions.resource_type = 'auto';
            }

            return cloudinary.uploader
              .upload(file.path, uploadOptions)
              .then((result) => ({
                url: result.secure_url,
                title: titles[index],
                order: orders[index] ?? index,
              }));
          }),
        );

        uploadedUrls.push(...uploadResults);

        // Lưu URLs vào bảng post_urls
        const postUrls = await this.postUrlModel.insertMany(
          uploadedUrls.map((u, index) => ({
            url: u.url,
            title: u.title,
            order: orders[index] ?? index,
          })),
        );

        // Gán vào post
        post.urls = postUrls.map((url) => url._id as Types.ObjectId);
        await post.save();
      } finally {
        // Luôn xóa file tạm sau khi upload xong (dù thành công hay thất bại)
        this.cleanupTempFiles(files);

        // Xóa file video đã blur (nếu có)
        for (const blurredPath of blurredVideoPaths) {
          try {
            if (fs.existsSync(blurredPath)) {
              fs.unlinkSync(blurredPath);
              this.logger.debug(`Đã xóa file video blur tạm: ${blurredPath}`);
            }
          } catch (err) {
            this.logger.warn(
              `Không thể xóa file video blur tạm ${blurredPath}: ${err.message}`,
            );
          }
        }
      }
    }
    // Async: detect faces trong ảnh post và search vector DB (fire-and-forget, dùng Cloudinary URLs)
    if (files && files.length > 0) {
      const postUrls = await this.postUrlModel
        .find({ _id: { $in: post.urls } })
        .lean()
        .exec();
      const imageUrls = postUrls
        .map((u: any) => u.url as string)
        .filter((url: string) => url.match(/\.(jpg|jpeg|png|webp|gif)(\?|$)/i));

      if (imageUrls.length > 0) {
        this.eventEmitter.emit(AppEvents.FACE_SEARCH_IN_POST, {
          postId: post._id.toString(),
          posterId: userId,
          imageUrls,
          taggedUserIds: taggedUserIds ?? [],
        });
      }
    }

    if (taggedUserIds && taggedUserIds.length > 0) {
      taggedUserIds.forEach(async (id) => {
        const [canView] = await this.eventEmitter.emitAsync(
          AppEvents.POST_CAN_VIEW,
          {
            postId: post._id.toString(),
            viewerId: id,
          },
        );

        if (canView) {
          this.eventEmitter.emit(AppEvents.POST_TAGGED, {
            sender: userId,
            receiver: id,
            postId: post._id.toString(),
          });
        }
      });
    }

    console.log('>>>>>>>>>>>Created post with ID:', post._id.toString());
    console.log('>>>>>>>>>Community Post Status:', communityPostStatus);
    console.log('>>>>>>>>>Community ID:', communityId);

    // Thông báo cho admin nếu post cần duyệt trong community
    if (communityId && communityPostStatus === CommunityPostStatus.PENDING) {
      const [communityInfo] = await this.eventEmitter.emitAsync(
        AppEvents.COMMUNITY_GET_INFO,
        {
          communityId,
        },
      );

      if (communityInfo?.adminId) {
        console.log(
          'Gửi notification cho adminId:',
          communityInfo.adminId.toString(),
        );
        this.eventEmitter.emit('community.post.pending', {
          receiver: communityInfo.adminId.toString(),
          sender: userId,
          postId: post._id.toString(),
          communityId: communityId,
          communityName: communityInfo.name,
        });
      }
    } else if (communityId && communityPostStatus === CommunityPostStatus.APPROVED) {
      if (location && latitude && longitude) {
        this.eventEmitter.emit(AppEvents.COMMUNITY_ROADMAP_UPDATE, {
          communityId,
          postId: post._id.toString(),
          locationName: location,
          latitude,
          longitude,
          userId,
        });
      }
    }

    return {
      message: 'Đã tạo bài viết thành công',
    };
  }

  private async classifyCaptionForRecommendation(
    caption?: string | null,
  ): Promise<PostCategoryClassificationResult> {
    try {
      return await this.postCategoryClassifierService.classifyCaption(caption);
    } catch (error) {
      this.logger.error(
        `Không thể phân loại category cho post: ${error.message}`,
      );
      return {
        category: null,
        confidence: 0,
        source: PostCategorySource.NONE,
        isRecommendable: false,
      };
    }
  }

  // Xóa các file tạm trên disk sau khi xử lý xong
  private cleanupTempFiles(files: File[]): void {
    for (const file of files) {
      try {
        if (file.path && fs.existsSync(file.path)) {
          fs.unlinkSync(file.path);
          this.logger.debug(`Đã xóa file tạm: ${file.path}`);
        }
      } catch (error) {
        this.logger.warn(
          `Không thể xóa file tạm ${file.path}: ${error.message}`,
        );
      }
    }
  }

  async updatePost(updatePostDto: UpdatePostDto, userId: string) {
    if (!Types.ObjectId.isValid(updatePostDto.postId)) {
      throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
    }

    // convert string to ObjectId
    const postIdObject = new Types.ObjectId(updatePostDto.postId);
    const userIdObject = new Types.ObjectId(userId);

    // check post có tồn tại và thuộc về user
    const post = await this.postModel.findOne({
      _id: postIdObject,
      userId: userIdObject,
    });
    if (!post) {
      throw new HttpException(
        'Post not found or unauthorized',
        HttpStatus.NOT_FOUND,
      );
    }

    if (updatePostDto.caption) {
      // Kiểm tra nội dung vi phạm
      const textResult = await this.textModerationService.checkText(
        updatePostDto.caption,
      );

      if (!textResult.is_safe) {
        throw new BadRequestException(
          'Nội dung bài viết vi phạm tiêu chuẩn cộng đồng! Vui lòng chỉnh sửa nội dung.',
        );
      }

      post.caption = updatePostDto.caption;
    }

    if (updatePostDto.layout) {
      post.layout = updatePostDto.layout;
    }

    // Update urls
    if (updatePostDto.urls && updatePostDto.urls.length > 0) {
      // Xóa toàn bộ PostUrl cũ
      if (post.urls && post.urls.length > 0) {
        await this.postUrlModel.deleteMany({ _id: { $in: post.urls } });
      }

      // Insert urls mới
      const newUrls = await this.postUrlModel.insertMany(
        updatePostDto.urls.map((u, index) => ({
          url: u.url,
          title: u.title ?? '',
          order: u.order ?? index,
        })),
      );

      // Gán lại mảng urls
      post.urls = newUrls.map((u) => u._id as Types.ObjectId);
    }

    // Update taggedUserIds
    if (updatePostDto.taggedUserIds !== undefined) {
      const oldTaggedIds = post.taggedUserIds.map((id) => id.toString());
      const newTaggedIds = updatePostDto.taggedUserIds;
      const newTaggedObjectIds = newTaggedIds.map(
        (id) => new Types.ObjectId(id),
      );

      // Xóa visibleOnProfileUserIds của những user bị bỏ tag
      const removedUserIds = oldTaggedIds.filter(
        (id) => !newTaggedIds.includes(id),
      );
      if (removedUserIds.length > 0) {
        post.visibleOnProfileUserIds = post.visibleOnProfileUserIds.filter(
          (id) => !removedUserIds.includes(id.toString()),
        );
      }

      // Cập nhật danh sách tag
      post.taggedUserIds = newTaggedObjectIds;

      // Gửi notification cho user mới được tag
      const newlyTaggedIds = newTaggedIds.filter(
        (id) => !oldTaggedIds.includes(id),
      );
      if (newlyTaggedIds.length > 0) {
        newlyTaggedIds.forEach(async (id) => {
          const [canView] = await this.eventEmitter.emitAsync(
            AppEvents.POST_CAN_VIEW,
            {
              postId: post._id.toString(),
              viewerId: id,
            },
          );

          if (canView) {
            this.eventEmitter.emit(AppEvents.POST_TAGGED, {
              sender: userId,
              receiver: id,
              postId: post._id.toString(),
            });
          }
        });
      }
    }

    await post.save();

    // Trả về post kèm populate
    return this.postModel
      .findById(post._id)
      .populate('userId', 'username fullName avatarUrl')
      .populate('taggedUserIds', 'username fullName avatarUrl')
      .populate({ path: 'urls', options: { sort: { order: 1 } } })
      .exec();
  }

  async deletePost(postId: string, userId: string) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
    }

    if (!Types.ObjectId.isValid(userId)) {
      throw new HttpException('Invalid userId', HttpStatus.BAD_REQUEST);
    }

    const postIdObject = new Types.ObjectId(postId);

    const post = await this.postModel.findById(postIdObject);
    if (!post) {
      throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
    }

    let canDelete = false;

    if (post.userId.toString() === userId) {
      canDelete = true;
    } else if (post.communityId) {
      const [response] = await this.eventEmitter.emitAsync(
        AppEvents.COMMUNITY_GET_MEMBER_ROLE,
        { communityId: post.communityId.toString(), userId },
      );
      if (response && response.role === 'admin') {
        canDelete = true;
      }
    }

    if (!canDelete) {
      throw new ForbiddenException('You are not allowed to delete this post');
    }

    if (post.urls && post.urls.length > 0) {
      await this.postUrlModel.deleteMany({ _id: { $in: post.urls } });
    }

    if (post.communityId) {
      this.eventEmitter.emit(AppEvents.COMMUNITY_ROADMAP_REMOVE_POST, {
        communityId: post.communityId.toString(),
        postId: post._id.toString(),
      });
    }

    await post.deleteOne();

    // Thông báo cho các module khác (saved, comments, reacts, ...) biết post đã bị xóa
    this.eventEmitter.emit(AppEvents.POST_DELETED, {
      postId: post._id.toString(),
    });

    return { message: 'Post deleted successfully' };
  }

  async getPostPrivacy(postId: string) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
    }

    const postIdObject = new Types.ObjectId(postId);

    const post = await this.postModel.findById(postIdObject);
    if (!post) {
      throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
    }

    return post.privacy_type;
  }

  async updatePostPrivacy(
    postId: string,
    updatePostPrivacyDto: UpdatePrivacyDto,
  ) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
    }

    const postIdObject = new Types.ObjectId(postId);

    const post = await this.postModel.findById(postIdObject);
    if (!post) {
      throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
    }

    const setData: any = {
      privacy_type: updatePostPrivacyDto.privacy_type,
    };
    const unsetData: any = {};

    if (updatePostPrivacyDto.privacy_type === PrivacyType.FRIENDS_EXCEPT) {
      if (
        updatePostPrivacyDto.friends_except &&
        updatePostPrivacyDto.friends_except.length > 0
      ) {
        setData.friends_except = updatePostPrivacyDto.friends_except.map(
          (id) => new Types.ObjectId(id),
        );
      } else {
        setData.friends_except = [];
      }

      unsetData.friends_detail = '';
    } else if (
      updatePostPrivacyDto.privacy_type === PrivacyType.FRIENDS_DETAIL
    ) {
      if (
        updatePostPrivacyDto.friends_detail &&
        updatePostPrivacyDto.friends_detail.length > 0
      ) {
        setData.friends_detail = updatePostPrivacyDto.friends_detail.map(
          (id) => new Types.ObjectId(id),
        );
      } else {
        setData.friends_detail = [];
      }

      unsetData.friends_except = '';
    } else {
      // Các privacy type khác, xóa cả hai
      unsetData.friends_except = '';
      unsetData.friends_detail = '';
    }

    const updateQuery: any = { $set: setData };
    if (Object.keys(unsetData).length > 0) {
      updateQuery.$unset = unsetData;
    }

    await this.postModel.updateOne({ _id: postIdObject }, updateQuery);
    const updatedPost = await this.postModel.findById(postIdObject);

    return updatedPost;
  }

  // api check post privacy của user đó có thể xem được post này không
  // api kiểm tra xem mình có được quyền xem bài viết này không
  async canUserViewPost(postId: string, viewerId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(postId)) {
      throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
    }

    if (!Types.ObjectId.isValid(viewerId)) {
      throw new HttpException('Invalid viewerId', HttpStatus.BAD_REQUEST);
    }

    const post = await this.postModel
      .findOne({ _id: postId, isHidden: { $ne: true }, communityStatus: { $ne: CommunityPostStatus.REJECTED } })
      .lean();
    if (!post) return false;

    if (post.communityId) {
      if (post.userId.toString() === viewerId) return true;
      
      const [isAdmin] = await this.eventEmitter.emitAsync(
        AppEvents.USER_IS_ADMIN,
        { userId: viewerId },
      );
      if (isAdmin) return true;

      const [response] = await this.eventEmitter.emitAsync(
        AppEvents.COMMUNITY_GET_MEMBER_ROLE,
        { communityId: post.communityId.toString(), userId: viewerId },
      );
      if (response && response.role) {
        return true;
      }
      return false;
    }

    // Lấy danh sách bạn bè của chủ post
    const [friendsOfOwner] = await this.eventEmitter.emitAsync(
      AppEvents.FRIENDS_GET,
      { userId: post.userId.toString() },
    );

    return PrivacyUtil.canView(
      new Types.ObjectId(viewerId),
      post,
      friendsOfOwner.map((f) => new Types.ObjectId(f._id)),
    );
  }

  async reportPost(
    postId: string,
    userId: string,
    reportPostDto: ReportPostDto,
  ) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
    }

    if (!Types.ObjectId.isValid(userId)) {
      throw new HttpException('Invalid userId', HttpStatus.BAD_REQUEST);
    }

    const postObjectId = new Types.ObjectId(postId);
    const userObjectId = new Types.ObjectId(userId);

    const post = await this.postModel.findById(postObjectId);
    if (!post) {
      throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
    }

    // Không cho phép tự báo cáo bài viết của mình (có thể bỏ check nếu muốn)
    if (post.userId.toString() === userId) {
      throw new HttpException(
        'Bạn không thể báo cáo bài viết của chính mình',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Nếu đã tồn tại report của user này cho post này thì cập nhật lại lý do
    const existingReport = await this.postReportModel.findOne({
      postId: postObjectId,
      userId: userObjectId,
    });

    if (existingReport) {
      existingReport.reason = reportPostDto.reason;
      existingReport.description = reportPostDto.description;
      existingReport.status = 'pending';
      await existingReport.save();
    } else {
      await this.postReportModel.create({
        postId: postObjectId,
        userId: userObjectId,
        reason: reportPostDto.reason,
        description: reportPostDto.description,
      });
    }

    // Nếu có >= 100 báo cáo pending thì tự động ẩn bài viết
    const pendingReportsCount = await this.postReportModel.countDocuments({
      postId: postObjectId,
      status: 'pending',
    });

    if (pendingReportsCount >= 100 && !post.isHidden) {
      post.isHidden = true;
      await post.save();
    }

    return {
      message:
        'Báo cáo bài viết thành công. Cảm ơn bạn đã đóng góp giúp cộng đồng an toàn hơn.',
    };
  }

  async translateCaption(postId: string, targetLang: string = 'en') {
    if (!Types.ObjectId.isValid(postId)) {
      throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
    }

    const postObjectId = new Types.ObjectId(postId);
    const post = await this.postModel
      .findById(postObjectId)
      .select('caption')
      .lean();

    if (!post) {
      throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
    }

    const caption: string | undefined = (post as any).caption;

    if (!caption || !caption.trim()) {
      throw new HttpException('Post has no caption', HttpStatus.BAD_REQUEST);
    }

    try {
      const detected =
        await this.googleTranslationService.detectLanguage(caption);
      const normalizedTarget = targetLang || 'en';

      if (langsMatch(detected, normalizedTarget)) {
        return {
          originalCaption: caption,
          translatedCaption: caption,
          sourceLang: detected,
          targetLang: normalizedTarget,
          translationNotNeeded: true,
        };
      }

      const result = await this.googleTranslationService.translate(
        caption,
        normalizedTarget,
      );

      return {
        originalCaption: caption,
        translatedCaption: result.translatedText,
        sourceLang: result.sourceLang,
        targetLang: result.targetLang,
        translationNotNeeded: false,
      };
    } catch (error) {
      this.logger.error(
        `Failed to translate caption for post ${postId}`,
        error as any,
      );
      throw new HttpException(
        'Failed to translate caption',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  async getCaptionTranslationEligibility(postId: string, targetLang: string) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
    }

    const postObjectId = new Types.ObjectId(postId);
    const post = await this.postModel
      .findById(postObjectId)
      .select('caption')
      .lean();

    if (!post) {
      throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
    }

    const caption: string | undefined = (post as any).caption;

    if (!caption || !caption.trim()) {
      return {
        translationNotNeeded: true,
        sourceLang: 'und',
        targetLang: targetLang || 'en',
      };
    }

    try {
      const detected =
        await this.googleTranslationService.detectLanguage(caption);
      const normalizedTarget = targetLang || 'en';
      const translationNotNeeded = langsMatch(detected, normalizedTarget);

      return {
        translationNotNeeded,
        sourceLang: detected,
        targetLang: normalizedTarget,
      };
    } catch (error) {
      this.logger.error(
        `Failed caption translation eligibility for post ${postId}`,
        error as any,
      );
      throw new HttpException(
        'Failed to check caption translation',
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  @OnEvent(AppEvents.POST_GET_USER_ID)
  async handlePostGetUserId(payload: any) {
    const post = await this.postModel.findById(payload.postId).select('userId');
    if (!post) {
      return;
    }
    return post;
  }

  @OnEvent(AppEvents.POST_GET_ALL_BY_USER)
  async handleGetAllPostsByUser(payload: {
    ownerId: string;
    viewerId: string;
    page?: number;
    limit?: number;
  }) {
    const { ownerId, viewerId, page = 1, limit = 5 } = payload;
    return await this.getAllPostsByUser(ownerId, viewerId, page, limit);
  }

  @OnEvent(AppEvents.POST_GET_DETAIL)
  async handleGetPostDetail(payload: { postId: string; userId: string }) {
    const { postId, userId } = payload;
    return await this.getPostDetail(postId, userId);
  }

  // ===== ADMIN EVENT LISTENERS =====
  @OnEvent(AppEvents.ADMIN_POST_GET_ALL)
  async handleAdminGetAllPosts(payload: {
    page?: number;
    limit?: number;
    search?: string;
  }) {
    const { page = 1, limit = 10, search } = payload;
    const skip = (page - 1) * limit;
    const query: any = {};

    if (search && search.trim()) {
      query.caption = { $regex: search.trim(), $options: 'i' };
    }

    const [posts, total] = await Promise.all([
      this.postModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'username fullName avatarUrl')
        .populate({ path: 'urls', options: { sort: { order: 1 } } })
        .lean()
        .exec(),
      this.postModel.countDocuments(query).exec(),
    ]);

    const postResponseDtos = await Promise.all(
      posts.map(async (post: any) => {
        const userResponseDto: any = plainToInstance(
          UserResponseDto,
          post.userId,
          {
            excludeExtraneousValues: true,
          },
        );
        const cleanedUser = omitBy(
          userResponseDto,
          isUndefined,
        ) as UserResponseDto;

        const [reactsMap] = await this.eventEmitter.emitAsync(
          AppEvents.REACT_POST_GET,
          {
            postIds: [post._id.toString()],
            viewerId: post.userId._id.toString(),
          },
        );

        const [commentsResult] = await this.eventEmitter.emitAsync(
          AppEvents.COMMENT_FIND_BY_POST_ID,
          { postId: post._id.toString() },
        );
        const comments = commentsResult || [];

        return {
          ...post,
          userId: cleanedUser,
          reacts: reactsMap[post._id.toString()] || [],
          isReact: null,
          comments: comments || [],
        } as any;
      }),
    );

    return {
      data: postResponseDtos,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    };
  }

  @OnEvent(AppEvents.ADMIN_POST_DELETE)
  async handleAdminDeletePost({ postId }: { postId: string }) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
    }

    const post = await this.postModel.findById(postId).exec();
    if (!post) {
      throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
    }

    await post.deleteOne();

    // Thông báo cho các module khác biết post đã bị xóa
    this.eventEmitter.emit(AppEvents.POST_DELETED, {
      postId: post._id.toString(),
    });

    return { message: 'Post deleted successfully' };
  }

  @OnEvent(AppEvents.ADMIN_POST_HIDE)
  async handleAdminHidePost({ postId }: { postId: string }) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
    }

    const post = await this.postModel.findById(postId).exec();
    if (!post) {
      throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
    }

    post.isHidden = true;
    await post.save();

    return { message: 'Post hidden successfully' };
  }

  @OnEvent(AppEvents.ADMIN_POST_UNHIDE)
  async handleAdminUnhidePost({ postId }: { postId: string }) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
    }

    const post = await this.postModel.findById(postId).exec();
    if (!post) {
      throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
    }

    post.isHidden = false;
    await post.save();

    return { message: 'Post unhidden successfully' };
  }

  @OnEvent(AppEvents.ADMIN_POSTS_STATS)
  async handleAdminPostsStats(payload: {
    groupBy?: 'day' | 'month';
    days?: number;
  }) {
    const { groupBy = 'day', days = 30 } = payload;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const format = groupBy === 'day' ? '%Y-%m-%d' : '%Y-%m';

    const posts = await this.postModel
      .aggregate([
        {
          $match: {
            createdAt: {
              $gte: startDate,
              $lte: endDate,
            },
          },
        },
        {
          $group: {
            _id: {
              $dateToString: {
                format,
                date: '$createdAt',
              },
            },
            count: { $sum: 1 },
          },
        },
        {
          $sort: { _id: 1 },
        },
        {
          $project: {
            date: '$_id',
            count: 1,
            _id: 0,
          },
        },
      ])
      .exec();

    return posts;
  }

  // ===== ADMIN POST REPORT EVENT LISTENERS =====
  @OnEvent(AppEvents.ADMIN_POST_REPORT_GET_ALL)
  async handleAdminGetPostReports(payload: {
    page?: number;
    limit?: number;
    status?: 'pending' | 'reviewed' | 'rejected';
  }) {
    const { page = 1, limit = 10, status } = payload;
    const skip = (page - 1) * limit;
    const matchQuery: any = {};

    if (status) {
      matchQuery.status = status;
    }

    const pipeline: any[] = [
      {
        $match: matchQuery,
      },
      {
        $lookup: {
          from: 'posts',
          localField: 'postId',
          foreignField: '_id',
          as: 'postInfo',
        },
      },
      {
        $unwind: {
          path: '$postInfo',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'postInfo.userId',
          foreignField: '_id',
          as: 'postOwner',
        },
      },
      {
        $unwind: {
          path: '$postOwner',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $lookup: {
          from: 'users',
          localField: 'userId',
          foreignField: '_id',
          as: 'reporterInfo',
        },
      },
      {
        $unwind: {
          path: '$reporterInfo',
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $group: {
          _id: '$postId',
          postId: {
            $first: {
              _id: '$postInfo._id',
              caption: '$postInfo.caption',
              userId: '$postInfo.userId',
              urls: '$postInfo.urls',
              layout: '$postInfo.layout',
              privacy_type: '$postInfo.privacy_type',
              isHidden: '$postInfo.isHidden',
              createdAt: '$postInfo.createdAt',
              updatedAt: '$postInfo.updatedAt',
            },
          },
          postOwner: { $first: '$postOwner' },
          reporters: {
            $push: {
              _id: '$_id',
              userId: {
                _id: '$reporterInfo._id',
                fullName: '$reporterInfo.fullName',
                username: '$reporterInfo.username',
                avatarUrl: '$reporterInfo.avatarUrl',
                email: '$reporterInfo.email',
              },
              reason: '$reason',
              description: '$description',
              status: '$status',
              createdAt: '$createdAt',
              updatedAt: '$updatedAt',
            },
          },
          totalReports: { $sum: 1 },
          pendingCount: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] },
          },
          reviewedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'reviewed'] }, 1, 0] },
          },
          rejectedCount: {
            $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] },
          },
          latestReportDate: { $max: '$createdAt' },
        },
      },
      {
        $lookup: {
          from: 'posturls',
          let: { urlIds: '$postId.urls' },
          pipeline: [
            {
              $match: {
                $expr: {
                  $in: ['$_id', '$$urlIds'],
                },
              },
            },
            {
              $sort: { order: 1 },
            },
          ],
          as: 'postUrls',
        },
      },
      {
        $addFields: {
          'postId.urls': '$postUrls',
        },
      },
      {
        $sort: { latestReportDate: -1 },
      },
      {
        $skip: skip,
      },
      {
        $limit: limit,
      },
    ];

    const countPipeline = [
      {
        $match: matchQuery,
      },
      {
        $group: {
          _id: '$postId',
        },
      },
      {
        $count: 'total',
      },
    ];

    const [groupedReports, countResult] = await Promise.all([
      this.postReportModel.aggregate(pipeline).exec(),
      this.postReportModel.aggregate(countPipeline).exec(),
    ]);

    const total = countResult.length > 0 ? countResult[0].total : 0;

    const formattedData = groupedReports.map((item: any) => {
      const postId = item.postId?._id || item._id;
      return {
        postId: {
          ...item.postId,
          userId: item.postOwner,
          urls: item.postUrls || [],
        },
        reporters: item.reporters || [],
        reportCounts: {
          total: item.totalReports,
          pending: item.pendingCount,
          reviewed: item.reviewedCount,
          rejected: item.rejectedCount,
        },
        latestReportDate: item.latestReportDate,
      };
    });

    return {
      data: formattedData,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: limit,
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    };
  }

  @OnEvent(AppEvents.ADMIN_POST_REPORT_GET_BY_ID)
  async handleAdminGetPostReportById({ reportId }: { reportId: string }) {
    if (!Types.ObjectId.isValid(reportId)) {
      throw new HttpException('Invalid reportId', HttpStatus.BAD_REQUEST);
    }

    const report = await this.postReportModel
      .findById(reportId)
      .populate({
        path: 'postId',
        populate: [
          {
            path: 'userId',
            select: 'username fullName avatarUrl',
          },
          {
            path: 'urls',
            options: { sort: { order: 1 } },
          },
        ],
      })
      .populate('userId', 'username fullName email avatarUrl')
      .lean()
      .exec();

    if (!report) {
      throw new HttpException('Post report not found', HttpStatus.NOT_FOUND);
    }

    return report;
  }

  @OnEvent(AppEvents.ADMIN_POST_REPORT_UPDATE_STATUS)
  async handleAdminUpdatePostReportStatus(payload: {
    reportId: string;
    status: 'pending' | 'reviewed' | 'rejected';
    note?: string;
  }) {
    const { reportId, status, note } = payload;
    if (!Types.ObjectId.isValid(reportId)) {
      throw new HttpException('Invalid reportId', HttpStatus.BAD_REQUEST);
    }

    const report = await this.postReportModel.findById(reportId).exec();
    if (!report) {
      throw new HttpException('Post report not found', HttpStatus.NOT_FOUND);
    }

    report.status = status;
    await report.save();

    const post = await this.postModel
      .findById(report.postId)
      .populate('userId', 'username fullName avatarUrl')
      .exec();
    if (post) {
      if (status === 'reviewed') {
        post.isHidden = true;
        await post.save();
      } else if (status === 'rejected') {
        post.isHidden = false;
        await post.save();
      }

      // Gửi thông báo đến người sở hữu bài viết khi admin xử lý báo cáo
      if (status === 'reviewed') {
        const postOwnerId =
          (post.userId as any)?._id?.toString() ||
          (post.userId as any)?.toString();

        if (postOwnerId) {
          try {
            // Lấy caption của bài viết, truncate nếu quá dài
            const postCaption = post.caption || '';
            const truncatedCaption =
              postCaption.length > 50
                ? postCaption.substring(0, 50) + '...'
                : postCaption;

            // Tạo message với tên bài viết
            const postTitle = truncatedCaption || 'bài viết của bạn';
            const message = `Báo cáo về "${postTitle}" đã bị ẩn do vi phạm tiêu chuẩn cộng đồng`;

            // Gửi thông báo trong ứng dụng
            await this.notificationService.createAndEmit({
              receiver: postOwnerId,
              sender: undefined, // Admin không có sender
              type: NotificationType.POST_REPORT_REVIEWED,
              targetId: post._id.toString(),
              message: message,
              content: note || undefined,
            });
          } catch (error) {
            this.logger.error(
              `Failed to send notification for post report ${reportId}:`,
              error,
            );
          }
        }
      }
    }

    return {
      message: 'Post report status updated successfully',
      status: report.status,
    };
  }

  @OnEvent(AppEvents.ADMIN_POST_REPORT_BULK_UPDATE_STATUS)
  async handleAdminBulkUpdatePostReportStatus(payload: {
    reportIds: string[];
    status: 'pending' | 'reviewed' | 'rejected';
    note?: string;
  }) {
    const { reportIds, status, note } = payload;
    const validReportIds = reportIds.filter((id) => Types.ObjectId.isValid(id));
    if (validReportIds.length === 0) {
      throw new HttpException(
        'No valid report IDs provided',
        HttpStatus.BAD_REQUEST,
      );
    }

    const objectIds = validReportIds.map((id) => new Types.ObjectId(id));

    const updateResult = await this.postReportModel.updateMany(
      { _id: { $in: objectIds } },
      { status },
    );

    if (updateResult.matchedCount === 0) {
      throw new HttpException('No reports found', HttpStatus.NOT_FOUND);
    }

    const reports = await this.postReportModel
      .find({ _id: { $in: objectIds } })
      .select('postId')
      .lean()
      .exec();

    const uniquePostIds = [...new Set(reports.map((r) => r.postId.toString()))];

    if (status === 'reviewed') {
      await this.postModel.updateMany(
        { _id: { $in: uniquePostIds.map((id) => new Types.ObjectId(id)) } },
        { isHidden: true },
      );
    } else if (status === 'rejected') {
      for (const postId of uniquePostIds) {
        const allReportsForPost = await this.postReportModel
          .find({ postId: new Types.ObjectId(postId) })
          .lean()
          .exec();

        const allRejected = allReportsForPost.every(
          (r) => r.status === 'rejected',
        );
        if (allRejected) {
          await this.postModel.findByIdAndUpdate(postId, { isHidden: false });
        }
      }
    }

    // Gửi thông báo đến người sở hữu bài viết khi admin xử lý báo cáo (bulk)
    if (status === 'reviewed') {
      const posts = await this.postModel
        .find({
          _id: { $in: uniquePostIds.map((id) => new Types.ObjectId(id)) },
        })
        .populate('userId', 'username fullName avatarUrl')
        .exec();

      // Gửi thông báo cho từng bài viết (tránh gửi trùng cho cùng một user)
      const notifiedUsers = new Set<string>();

      for (const post of posts) {
        const postOwnerId =
          (post.userId as any)?._id?.toString() ||
          (post.userId as any)?.toString();

        if (postOwnerId) {
          try {
            // Lấy caption của bài viết, truncate nếu quá dài
            const postCaption = post.caption || '';
            const truncatedCaption =
              postCaption.length > 50
                ? postCaption.substring(0, 50) + '...'
                : postCaption;

            // Tạo message với tên bài viết
            const postTitle = truncatedCaption || 'bài viết của bạn';
            const message = `Báo cáo về "${postTitle}" đã bị ẩn do vi phạm tiêu chuẩn cộng đồng`;

            // Gửi thông báo trong ứng dụng (gửi riêng cho từng bài viết)
            await this.notificationService.createAndEmit({
              receiver: postOwnerId,
              sender: undefined, // Admin không có sender
              type: NotificationType.POST_REPORT_REVIEWED,
              targetId: post._id.toString(),
              message: message,
              content: note || undefined,
            });
          } catch (error) {
            this.logger.error(
              `Failed to send notification for bulk post report update:`,
              error,
            );
          }
        }
      }
    }

    return {
      message: `Successfully updated ${updateResult.modifiedCount} report(s)`,
      updatedCount: updateResult.modifiedCount,
      matchedCount: updateResult.matchedCount,
    };
  }

  @OnEvent(AppEvents.ADMIN_DASHBOARD_STATS)
  async handleAdminDashboardStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalPosts, newPostsThisMonth] = await Promise.all([
      this.postModel.countDocuments().exec(),
      this.postModel
        .countDocuments({ createdAt: { $gte: startOfMonth } })
        .exec(),
    ]);

    return {
      totalPosts,
      newPostsThisMonth,
    };
  }

  @OnEvent(AppEvents.POST_CAN_VIEW)
  async canViewPost(payload: any): Promise<boolean> {
    const post = await this.postModel.findById(payload.postId).lean();
    if (!post) return false;

 	// Chủ bài viết luôn có quyền xem bài viết của chính mình
    if (post.userId.toString() === payload.viewerId) return true;

    // kiểm tra có phải admin không
    const [isAdmin] = await this.eventEmitter.emitAsync(
      AppEvents.USER_IS_ADMIN,
      { userId: payload.viewerId },
    );
    if (isAdmin) return true;

    if (post.communityId) {
      const [response] = await this.eventEmitter.emitAsync(
        AppEvents.COMMUNITY_GET_MEMBER_ROLE,
        { communityId: post.communityId.toString(), userId: payload.viewerId },
      );
      if (response && response.role) {
        return true;
      }
      return false;
    }

    if (post.privacy_type === PrivacyType.PUBLIC) return true;
    if (post.privacy_type === PrivacyType.PRIVATE) {
      return post.userId.toString() === payload.viewerId;
    }
    if (post.privacy_type === PrivacyType.FRIENDS) {
      const [friendsOfOwner] = await this.eventEmitter.emitAsync(
        AppEvents.FRIENDS_GET,
        { userId: post.userId.toString() },
      );
      const isFriend = friendsOfOwner.some(
        (f: any) => f._id.toString() === payload.viewerId,
      );
      if (isFriend) return true;
    }
    if (post.privacy_type === PrivacyType.FRIENDS_EXCEPT) {
      if (post.friends_except && post.friends_except.length > 0) {
        const isExcepted = post.friends_except.some(
          (id: Types.ObjectId) => id.toString() === payload.viewerId,
        );
        if (isExcepted) return false;
      }
      return true;
    }
    if (post.privacy_type === PrivacyType.FRIENDS_DETAIL) {
      if (post.friends_detail && post.friends_detail.length > 0) {
        const isAllowed = post.friends_detail.some(
          (id: Types.ObjectId) => id.toString() === payload.viewerId,
        );
        return isAllowed;
      }
      return false;
    }
    return false;
  }

  // ===== COMMUNITY EVENT LISTENERS =====

  @OnEvent(AppEvents.COMMUNITY_GET_APPROVED_POSTS)
  async handleGetCommunityApprovedPosts(payload: {
    communityId: string;
    userId: string;
    page: number;
    limit: number;
  }) {
    const { communityId, userId, page = 1, limit = 10 } = payload;
    const skip = (page - 1) * limit;
    const communityObjectId = new Types.ObjectId(communityId);

    const [posts, total] = await Promise.all([
      this.postModel
        .find({
          communityId: communityObjectId,
          communityStatus: 'approved',
          isHidden: { $ne: true },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'username fullName avatarUrl')
        .populate('communityId', 'name avatar')
        .populate({ path: 'urls', options: { sort: { order: 1 } } })
        .lean()
        .exec(),
      this.postModel.countDocuments({
        communityId: communityObjectId,
        communityStatus: 'approved',
        isHidden: { $ne: true },
      }),
    ]);

    // Lấy react info
    const postIds = posts.map((p: any) => p._id.toString());
    const [reactsMap] = await this.eventEmitter.emitAsync(
      AppEvents.REACT_POST_GET,
      { postIds, viewerId: userId },
    );
    const [reactMap] = await this.eventEmitter.emitAsync(
      AppEvents.REACT_POST_FIND_BY_USER,
      { userId, postIds },
    );

    const postsWithReacts = posts.map((post: any) => ({
      ...post,
      reacts: reactsMap?.[post._id.toString()] || [],
      isReact: reactMap?.[post._id.toString()] || null,
    }));

    return {
      data: postsWithReacts,
      page,
      limit,
      total,
      hasNext: skip + posts.length < total,
    };
  }

  @OnEvent(AppEvents.COMMUNITY_GET_PENDING_POSTS)
  async handleGetCommunityPendingPosts(payload: {
    communityId: string;
    page: number;
    limit: number;
  }) {
    const { communityId, page = 1, limit = 10 } = payload;
    const skip = (page - 1) * limit;
    const communityObjectId = new Types.ObjectId(communityId);

    const [posts, total] = await Promise.all([
      this.postModel
        .find({ communityId: communityObjectId, communityStatus: 'pending' })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'username fullName avatarUrl')
        .populate('communityId', 'name avatar')
        .populate({ path: 'urls', options: { sort: { order: 1 } } })
        .lean()
        .exec(),
      this.postModel.countDocuments({
        communityId: communityObjectId,
        communityStatus: 'pending',
      }),
    ]);

    return {
      data: posts,
      page,
      limit,
      total,
      hasNext: skip + posts.length < total,
    };
  }

  @OnEvent('community.post.updateStatus')
  async handleCommunityPostUpdateStatus(payload: {
    postId: string;
    communityId: string;
    status: string;
  }) {
    const { postId, communityId, status } = payload;
    const post = await this.postModel.findOne({
      _id: new Types.ObjectId(postId),
      communityId: new Types.ObjectId(communityId),
    });
    if (!post) return null;

    post.communityStatus = status as any;
    await post.save();

    if (status === CommunityPostStatus.APPROVED) {
      if (post.location && post.latitude && post.longitude) {
        this.eventEmitter.emit(AppEvents.COMMUNITY_ROADMAP_UPDATE, {
          communityId,
          postId: post._id.toString(),
          locationName: post.location,
          latitude: post.latitude,
          longitude: post.longitude,
          userId: post.userId.toString(),
        });
      }
    }

    return { userId: post.userId };
  }

  @OnEvent('post.community.delete-post')
  async handleCommunityPostDelete(payload: { communityId: string }) {
    await this.postModel.deleteMany({
      communityId: new Types.ObjectId(payload.communityId),
    });
  }
  async updateTagVisibility(
    postId: string,
    userId: string,
    isVisible: boolean,
  ) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
    }

    const post = await this.postModel.findById(postId);
    if (!post) {
      throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
    }

    const userObjectId = new Types.ObjectId(userId);

    // Kiểm tra xem user có được tag không
    const isTagged = post.taggedUserIds.some((id) => id.toString() === userId);
    if (!isTagged) {
      throw new HttpException(
        'Bạn không được gắn thẻ trong bài viết này',
        HttpStatus.FORBIDDEN,
      );
    }

    if (isVisible) {
      // Thêm vào danh sách hiển thị nếu chưa có
      if (
        !post.visibleOnProfileUserIds.some((id) => id.toString() === userId)
      ) {
        post.visibleOnProfileUserIds.push(userObjectId);
      }
    } else {
      // Xóa khỏi danh sách hiển thị
      post.visibleOnProfileUserIds = post.visibleOnProfileUserIds.filter(
        (id) => id.toString() !== userId,
      );
    }

    await post.save();
    return {
      message: isVisible
        ? 'Đã hiển thị trên trang cá nhân'
        : 'Đã ẩn khỏi trang cá nhân',
    };
  }

  async removeTag(postId: string, userId: string) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
    }

    const post = await this.postModel.findById(postId);
    if (!post) {
      throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
    }

    // Xóa khỏi danh sách tag
    post.taggedUserIds = post.taggedUserIds.filter(
      (id) => id.toString() !== userId,
    );
    // Xóa khỏi danh sách hiển thị
    post.visibleOnProfileUserIds = post.visibleOnProfileUserIds.filter(
      (id) => id.toString() !== userId,
    );

    await post.save();
    return { message: 'Đã gỡ gắn thẻ' };
  }

  @OnEvent(AppEvents.COMMUNITY_ROADMAP_GET_POSTS)
  async handleCommunityRoadmapGetPosts(payload: {
    postIds: string[];
    page: number;
    limit: number;
    reqUserId: string;
  }) {
    const { postIds, page, limit, reqUserId } = payload;
    const skip = (page - 1) * limit;

    const objectIds = postIds.map((id) => new Types.ObjectId(id));

    // Lấy bài viết và populate thông tin
    const posts = await this.postModel
      .find({ _id: { $in: objectIds } })
      .populate('userId', 'fullName username avatarUrl')
      .populate('communityId', 'name avatar')
      .populate({ path: 'urls', options: { sort: { order: 1 } } })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec();

    // Định dạng dữ liệu trả về giống với các API lấy bài viết khác
    const postIdsStr = posts.map((p: any) => p._id.toString());
    const [reactsMap] = await this.eventEmitter.emitAsync(
      AppEvents.REACT_POST_GET,
      { postIds: postIdsStr, viewerId: reqUserId },
    );
    const [reactMap] = await this.eventEmitter.emitAsync(
      AppEvents.REACT_POST_FIND_BY_USER,
      { userId: reqUserId, postIds: postIdsStr },
    );

    const formattedPosts = posts.map((post: any) => ({
      ...post,
      id: post._id,
      reacts: reactsMap?.[post._id.toString()] || [],
      isReact: reactMap?.[post._id.toString()] || null,
    }));

    const total = await this.postModel.countDocuments({ _id: { $in: objectIds } });

    return {
      data: formattedPosts,
      total,
      hasNext: skip + posts.length < total,
    };
  }

  @OnEvent(AppEvents.COMMUNITY_USER_REMOVED)
  async handleCommunityUserRemoved(payload: { communityId: string; userId: string }) {
    const { communityId, userId } = payload;
    
    // Tìm tất cả bài viết của user trong community
    const posts = await this.postModel.find({
      communityId: new Types.ObjectId(communityId),
      userId: new Types.ObjectId(userId)
    }).select('_id').lean();

    for (const post of posts) {
      try {
        await this.deletePost(post._id.toString(), userId);
      } catch (error) {
        this.logger.error(`Lỗi khi xóa bài viết ${post._id} của user ${userId} khi rời cộng đồng:`, error);
      }
    }
  }

  @OnEvent(AppEvents.ACTIVITY_POST_DATA)
  async handleActivityPostData(payload: { userId: string; startDate?: Date; endDate?: Date }): Promise<{ caption: string, createdAt: Date }[]> {
    const filter: any = { userId: new Types.ObjectId(payload.userId), isHidden: { $ne: true } };
    if (payload.startDate || payload.endDate) {
      filter.createdAt = {};
      if (payload.startDate) filter.createdAt.$gte = payload.startDate;
      if (payload.endDate) filter.createdAt.$lte = payload.endDate;
    }
    const posts = await this.postModel.find(filter).select('caption createdAt').sort({ createdAt: -1 }).limit(30).exec();
    return posts.map(p => ({ caption: p.caption, createdAt: (p as any).createdAt }));
  }
}
