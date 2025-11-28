import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../user/schemas/user.schema';
import { Post, PostDocument } from '../post/schemas/post.schema';
import { Story, StoryDocument } from '../story/schemas/story.schema';
import { Comment, CommentDocument } from '../comment/schemas/comment.schema';
import { ReactPost, ReactPostDocument } from '../react-post/schemas/react-post.schema';
import { ReactStory, ReactStoryDocument } from '../react-story/schemas/react-story.schema';
import { PostService } from '../post/post.service';
import { StoryService } from '../story/story.service';
import { CommentService } from '../comment/comment.service';
import { ReactPostService } from '../react-post/react-post.service';
import { ReactStoryService } from '../react-story/react-story.service';
import { FriendsService } from '../friends/friends.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppEvents } from 'src/shared/enums/app-events.enum';
import { plainToInstance } from 'class-transformer';
import UserResponseDto from '../user/dto/user.response.dto';
import { StoryResponseDto } from '../story/dto/story-response.dto';
import { PostResponseDto } from '../post/dto/post-response.dto';
import { omitBy, isUndefined } from 'lodash';

@Injectable()
export class AdminService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Post.name) private postModel: Model<PostDocument>,
    @InjectModel(Story.name) private storyModel: Model<StoryDocument>,
    @InjectModel(Comment.name) private commentModel: Model<CommentDocument>,
    @InjectModel(ReactPost.name) private reactPostModel: Model<ReactPostDocument>,
    @InjectModel(ReactStory.name) private reactStoryModel: Model<ReactStoryDocument>,
    private readonly postService: PostService,
    private readonly storyService: StoryService,
    private readonly commentService: CommentService,
    private readonly reactPostService: ReactPostService,
    private readonly reactStoryService: ReactStoryService,
    private readonly friendsService: FriendsService,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ===== User Management Methods =====
  async getAllUsers(
    page: number = 1,
    limit: number = 10,
    search?: string,
    role?: string,
    isActive?: boolean,
  ) {
    const skip = (page - 1) * limit;
    const query: any = {};

    // Tìm kiếm theo email, username, fullName
    if (search && search.trim()) {
      query.$or = [
        { email: { $regex: search.trim(), $options: 'i' } },
        { username: { $regex: search.trim(), $options: 'i' } },
        { fullName: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    // Lọc theo role
    if (role) {
      query.role = role;
    }

    // Lọc theo isActive
    if (isActive !== undefined) {
      query.isActive = isActive;
    }

    const [users, total] = await Promise.all([
      this.userModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      this.userModel.countDocuments(query).exec(),
    ]);

    const userResponseDtos = users.map((user: any) =>
      plainToInstance(UserResponseDto, user, {
        excludeExtraneousValues: true,
      }),
    );

    return {
      data: userResponseDtos,
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

  async getUserById(userId: string): Promise<UserResponseDto> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new HttpException('Invalid userId', HttpStatus.BAD_REQUEST);
    }

    const user = await this.userModel.findById(userId).lean().exec();
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    return plainToInstance(UserResponseDto, user, {
      excludeExtraneousValues: true,
    });
  }

  async deleteUser(userId: string): Promise<{ message: string }> {
    if (!Types.ObjectId.isValid(userId)) {
      throw new HttpException('Invalid userId', HttpStatus.BAD_REQUEST);
    }

    const user = await this.userModel.findById(userId).exec();
    if (!user) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    // Soft delete: set isActive = false
    user.isActive = false;
    await user.save();

    return { message: 'User deleted successfully' };
  }

  async getUserFriends(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new HttpException('Invalid userId', HttpStatus.BAD_REQUEST);
    }

    const userExists = await this.userModel.exists({ _id: userId }).exec();
    if (!userExists) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    // Sử dụng FriendsService để lấy danh sách bạn bè
    const [friends] = await this.eventEmitter.emitAsync(AppEvents.FRIENDS_GET, {
      userId,
    });

    return friends || [];
  }

  async getUserActivity(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new HttpException('Invalid userId', HttpStatus.BAD_REQUEST);
    }

    const userExists = await this.userModel.exists({ _id: userId }).exec();
    if (!userExists) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    // Lấy dữ liệu thô: posts, stories, comments, postReactions, storyReactions
    const [posts, stories, user, postReactionsRaw, storyReactionsRaw] =
      await Promise.all([
        this.postService.getAllPostsByUser(userId, userId, 1, 5),
        this.storyService.getStories(userId, userId),
        this.userModel.findById(userId).select('updatedAt').lean().exec(),
        this.reactPostModel
          .find({ userId: new Types.ObjectId(userId) })
          .sort({ createdAt: -1 })
          .limit(10)
          .populate('postId', 'caption')
          .populate('emojiId', 'label icon')
          .lean()
          .exec(),
        this.reactStoryModel
          .find({ userId: new Types.ObjectId(userId) })
          .sort({ createdAt: -1 })
          .limit(10)
          .populate('storyId')
          .populate('emojiId', 'label icon')
          .lean()
          .exec(),
      ]);

    // Transform reactions
    const postReactions = postReactionsRaw || [];
    const storyReactions = storyReactionsRaw || [];

    // Lấy comments gần đây của user này
    const userComments = await this.commentModel
      .find({ userId: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('postId', 'caption')
      .populate('userId', 'username fullName avatarUrl')
      .lean()
      .exec();

    const postActivities =
      (posts.data || []).map((post: any) => ({
        type: 'post',
        id: post._id?.toString() || post.id,
        createdAt: post.createdAt || post.updatedAt || new Date(),
        payload: post,
      })) || [];

    const storyActivities = (stories || []).map((story: any) => ({
      type: 'story',
      id: story._id?.toString() || story.id,
      createdAt: story.createdAt || story.updatedAt || new Date(),
      payload: story,
    }));

    const commentActivities = (userComments || []).map((comment: any) => ({
      type: 'comment',
      id: comment._id?.toString(),
      createdAt: comment.createdAt || comment.updatedAt || new Date(),
      payload: comment,
    }));

    const reactionActivities = [
      ...postReactions.map((reaction) => ({
        type: 'reaction',
        id: reaction._id.toString(),
        createdAt: reaction.createdAt,
        payload: {
          targetType: 'post',
          targetId:
            reaction.postId?._id?.toString() ?? reaction.postId?.toString(),
          emoji: reaction.emojiId,
          target: reaction.postId,
        },
      })),
      ...storyReactions.map((reaction: any) => ({
        type: 'reaction',
        id: reaction._id.toString(),
        createdAt: reaction.createdAt || reaction.updatedAt || new Date(),
        payload: {
          targetType: 'story',
          targetId:
            reaction.storyId?._id?.toString() ?? reaction.storyId?.toString(),
          emoji: reaction.emojiId,
          target: reaction.storyId,
        },
      })),
    ];

    const activityTimeline = [
      ...postActivities,
      ...storyActivities,
      ...commentActivities,
      ...reactionActivities,
    ]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      )
      .map((activity) => ({
        ...activity,
        createdAt: new Date(activity.createdAt).toISOString(),
      }));

    return {
      posts: posts.data || [],
      stories: stories || [],
      comments: userComments || [],
      reactions: {
        posts: postReactions,
        stories: storyReactions,
      },
      activity: activityTimeline,
      lastActive:
        (user as any)?.updatedAt ||
        activityTimeline[0]?.createdAt ||
        null,
    };
  }

  // ===== Existing User Content Endpoints =====
  getUserPosts(userId: string, page: number = 1, limit: number = 10) {
    // Sử dụng ownerId làm viewerId để bỏ qua kiểm tra quyền riêng tư
    return this.postService.getAllPostsByUser(userId, userId, page, limit);
  }

  getUserStories(userId: string) {
    return this.storyService.getStories(userId, userId);
  }

  // ===== Post Management Methods =====
  async getAllPosts(
    page: number = 1,
    limit: number = 10,
    search?: string,
    userId?: string,
  ) {
    const skip = (page - 1) * limit;
    const query: any = {};

    // Tìm kiếm theo caption
    if (search && search.trim()) {
      query.caption = { $regex: search.trim(), $options: 'i' };
    }

    // Lọc theo userId
    if (userId && Types.ObjectId.isValid(userId)) {
      query.userId = new Types.ObjectId(userId);
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

    // Transform posts
    const postResponseDtos = await Promise.all(
      posts.map(async (post: any) => {
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

        // Lấy reacts
        const [reactsMap] = await this.eventEmitter.emitAsync(
          AppEvents.REACT_POST_GET,
          {
            postIds: [post._id.toString()],
            viewerId: post.userId._id.toString(),
          },
        );

        // Lấy comments
        const comments = await this.commentService.findByPostId(
          post._id.toString(),
        );

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

  async getPostById(postId: string): Promise<PostResponseDto> {
    if (!Types.ObjectId.isValid(postId)) {
      throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
    }

    // Admin có thể xem post mà không cần userId
    const post = await this.postService.getPostDetail(postId, postId);
    const comments = await this.commentService.findByPostId(postId);
    return { ...post, comments: comments || [] } as any;
  }

  async deletePost(postId: string): Promise<{ message: string }> {
    if (!Types.ObjectId.isValid(postId)) {
      throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
    }

    const post = await this.postModel.findById(postId).exec();
    if (!post) {
      throw new HttpException('Post not found', HttpStatus.NOT_FOUND);
    }

    // Admin có quyền xóa bất kỳ post nào, không cần kiểm tra userId
    await post.deleteOne();

    return { message: 'Post deleted successfully' };
  }

  async hidePost(postId: string): Promise<{ message: string }> {
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

  async unhidePost(postId: string): Promise<{ message: string }> {
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

  // ===== Story Management Methods =====
  async getAllStories(
    page: number = 1,
    limit: number = 10,
    userId?: string,
    dateFrom?: Date,
    dateTo?: Date,
  ) {
    const skip = (page - 1) * limit;
    const query: any = {};

    // Lọc theo userId
    if (userId && Types.ObjectId.isValid(userId)) {
      query.userId = new Types.ObjectId(userId);
    }

    // Lọc theo ngày
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) {
        query.createdAt.$gte = dateFrom;
      }
      if (dateTo) {
        query.createdAt.$lte = dateTo;
      }
    }

    const [stories, total] = await Promise.all([
      this.storyModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'username fullName avatarUrl')
        .lean()
        .exec(),
      this.storyModel.countDocuments(query).exec(),
    ]);

    // Transform stories
    const storyResponseDtos = stories.map((story: any) => {
      const userResponseDto: UserResponseDto = plainToInstance(
        UserResponseDto,
        story.userId,
        {
          excludeExtraneousValues: true,
        },
      );
      const cleanedUser = omitBy(userResponseDto, isUndefined) as UserResponseDto;

      return plainToInstance(
        StoryResponseDto,
        {
          ...story,
          userId: cleanedUser,
        },
        { excludeExtraneousValues: true },
      );
    });

    return {
      data: storyResponseDtos,
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

  async getStoryById(storyId: string): Promise<StoryResponseDto> {
    if (!Types.ObjectId.isValid(storyId)) {
      throw new HttpException('Invalid storyId', HttpStatus.BAD_REQUEST);
    }

    // Admin có thể xem story mà không cần kiểm tra quyền riêng tư
    const story = await this.storyModel
      .findById(storyId)
      .populate('userId', 'username fullName avatarUrl')
      .lean()
      .exec();

    if (!story) {
      throw new HttpException('Story not found', HttpStatus.NOT_FOUND);
    }

    const userResponseDto: UserResponseDto = plainToInstance(
      UserResponseDto,
      story.userId,
      {
        excludeExtraneousValues: true,
      },
    );
    const cleanedUser = omitBy(userResponseDto, isUndefined) as UserResponseDto;

    return plainToInstance(
      StoryResponseDto,
      {
        ...story,
        userId: cleanedUser,
      },
      { excludeExtraneousValues: true },
    );
  }

  async deleteStory(storyId: string): Promise<{ message: string }> {
    if (!Types.ObjectId.isValid(storyId)) {
      throw new HttpException('Invalid storyId', HttpStatus.BAD_REQUEST);
    }

    const story = await this.storyModel.findById(storyId).exec();
    if (!story) {
      throw new HttpException('Story not found', HttpStatus.NOT_FOUND);
    }

    // Admin có quyền xóa bất kỳ story nào, không cần kiểm tra userId
    await story.deleteOne();

    return { message: 'Story deleted successfully' };
  }

  // ===== Comment Management Methods =====
  async getAllComments(
    page: number = 1,
    limit: number = 10,
    search?: string,
    postId?: string,
    userId?: string,
  ) {
    const skip = (page - 1) * limit;
    const query: any = {};

    // Tìm kiếm theo content
    if (search && search.trim()) {
      query.content = { $regex: search.trim(), $options: 'i' };
    }

    // Lọc theo postId
    if (postId && Types.ObjectId.isValid(postId)) {
      query.postId = new Types.ObjectId(postId);
    }

    // Lọc theo userId
    if (userId && Types.ObjectId.isValid(userId)) {
      query.userId = new Types.ObjectId(userId);
    }

    const [comments, total] = await Promise.all([
      this.commentModel
        .find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', 'username fullName avatarUrl email')
        .populate('postId', 'caption')
        .populate({
          path: 'parentId',
          select: 'content userId createdAt',
          populate: {
            path: 'userId',
            select: 'username fullName avatarUrl',
          },
        })
        .lean()
        .exec(),
      this.commentModel.countDocuments(query).exec(),
    ]);

    return {
      data: comments,
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

  async getCommentById(commentId: string) {
    if (!Types.ObjectId.isValid(commentId)) {
      throw new HttpException('Invalid commentId', HttpStatus.BAD_REQUEST);
    }

    const comment = await this.commentModel
      .findById(commentId)
      .populate('userId', 'username fullName avatarUrl email')
      .populate('postId', 'caption')
      .populate({
        path: 'parentId',
        select: 'content userId createdAt',
        populate: {
          path: 'userId',
          select: 'username fullName avatarUrl',
        },
      })
      .lean()
      .exec();

    if (!comment) {
      throw new HttpException('Comment not found', HttpStatus.NOT_FOUND);
    }

    return comment;
  }

  async deleteComment(commentId: string): Promise<{ message: string }> {
    if (!Types.ObjectId.isValid(commentId)) {
      throw new HttpException('Invalid commentId', HttpStatus.BAD_REQUEST);
    }

    const comment = await this.commentModel.findById(commentId).exec();
    if (!comment) {
      throw new HttpException('Comment not found', HttpStatus.NOT_FOUND);
    }

    // Admin có quyền xóa bất kỳ comment nào, không cần kiểm tra userId
    await comment.deleteOne();

    return { message: 'Comment deleted successfully' };
  }

  // ===== Dashboard Stats Methods =====
  async getDashboardStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalUsers,
      totalPosts,
      totalStories,
      totalComments,
      newUsersThisMonth,
      newPostsThisMonth,
    ] = await Promise.all([
      this.userModel.countDocuments().exec(),
      this.postModel.countDocuments().exec(),
      this.storyModel.countDocuments().exec(),
      this.commentModel.countDocuments().exec(),
      this.userModel
        .countDocuments({ createdAt: { $gte: startOfMonth } })
        .exec(),
      this.postModel
        .countDocuments({ createdAt: { $gte: startOfMonth } })
        .exec(),
    ]);

    return {
      totalUsers,
      totalPosts,
      totalStories,
      totalComments,
      newUsersThisMonth,
      newPostsThisMonth,
    };
  }

  async getUsersGrowth(days: number = 30) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const users = await this.userModel
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
                format: '%Y-%m-%d',
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

    return users;
  }

  async getPostsStats(groupBy: 'day' | 'month' = 'day', days: number = 30) {
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

  getPostReacts(postId: string) {
    return this.reactPostService.findByPost(postId);
  }

  getPostComments(postId: string) {
    return this.commentService.findByPostId(postId);
  }

  getStoryReacts(storyId: string) {
    return this.reactStoryService.findByStory(storyId);
  }
}
