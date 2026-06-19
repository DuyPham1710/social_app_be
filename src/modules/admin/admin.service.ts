import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Types } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppEvents } from 'src/shared/enums/app-events.enum';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserAdminDto } from './dto/update-user-admin.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly eventEmitter: EventEmitter2,
  ) {}

  // ===== User Management Methods =====
  async getAllUsers(
    page: number = 1,
    limit: number = 10,
    search?: string,
    isActive?: boolean,
    isBan?: boolean,
    dateFrom?: Date,
    dateTo?: Date,
    nameInitial?: string,
  ) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.ADMIN_USER_GET_ALL, {
      page,
      limit,
      search,
      isActive,
      isBan,
      dateFrom,
      dateTo,
    });
    return result;
  }

  async getUserById(userId: string) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.ADMIN_USER_GET_BY_ID, {
      userId,
    });
    return result;
  }

  async createUser(createUserDto: CreateUserDto) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.ADMIN_USER_CREATE, {
      createUserDto,
    });
    return result;
  }

  async updateUser(
    userId: string,
    updateUserDto: UpdateUserAdminDto,
  ) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.ADMIN_USER_UPDATE, {
      userId,
      updateUserDto,
    });
    return result;
  }

  async deleteUser(userId: string) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.ADMIN_USER_DELETE, {
      userId,
    });
    return result;
  }

  async getUserFriends(userId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new HttpException('Invalid userId', HttpStatus.BAD_REQUEST);
    }

    const [userExists] = await this.eventEmitter.emitAsync(AppEvents.USER_CHECK_EXISTS, { userId });
    if (!userExists) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    // Sử dụng FriendsService để lấy danh sách bạn bè
    const [friends] = await this.eventEmitter.emitAsync(AppEvents.FRIENDS_GET, {
      userId,
    });

    return friends || [];
  }

  async getUserActivity(userId: string, adminId: string) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new HttpException('Invalid userId', HttpStatus.BAD_REQUEST);
    }

    const [userExists] = await this.eventEmitter.emitAsync(AppEvents.USER_CHECK_EXISTS, { userId });
    if (!userExists) {
      throw new HttpException('User not found', HttpStatus.NOT_FOUND);
    }

    const [postsResult, storiesResult, user, postReactionsRaw, storyReactionsRaw, userCommentsRaw] =
      await Promise.all([
        this.eventEmitter.emitAsync(AppEvents.POST_GET_ALL_BY_USER, { ownerId: userId, viewerId: adminId, page: 1, limit: 5 }),
        this.eventEmitter.emitAsync(AppEvents.STORY_GET, { ownerId: userId, viewerId: adminId }),
        this.eventEmitter.emitAsync(AppEvents.USER_FIND_ONE, { userId }),
        this.eventEmitter.emitAsync(AppEvents.ADMIN_REACT_POST_FIND_BY_USER, { userId }),
        this.eventEmitter.emitAsync(AppEvents.ADMIN_REACT_STORY_FIND_BY_USER, { userId }),
        this.eventEmitter.emitAsync(AppEvents.ADMIN_COMMENT_FIND_BY_USER, { userId }),
      ]);

    // Lấy phần tử đầu tiên từ mảng kết quả của emitAsync
    // emitAsync trả về mảng, nếu phần tử đầu tiên là mảng thì lấy nó, nếu không thì lấy chính kết quả đó
    const getFirstResult = (result: any) => {
      if (Array.isArray(result) && result.length > 0) {
        // Nếu phần tử đầu tiên là mảng, lấy nó; nếu không, lấy chính phần tử đó
        return Array.isArray(result[0]) ? result[0] : result[0];
      }
      // Nếu không phải mảng hoặc mảng rỗng, trả về chính nó hoặc mảng rỗng
      return Array.isArray(result) ? result : [];
    };

    const postReactions = getFirstResult(postReactionsRaw) || [];
    const storyReactions = getFirstResult(storyReactionsRaw) || [];
    const userComments = getFirstResult(userCommentsRaw) || [];
    const posts = postsResult[0] || { data: [] };
    const stories = storiesResult[0] || [];

    // Tạo post activities và filter các items không hợp lệ
    const postActivities = (posts.data || [])
      .filter((post: any) => post && (post._id || post.id))
      .map((post: any) => ({
        type: 'post',
        id: post._id?.toString() || post.id?.toString(),
        createdAt: post.createdAt || post.updatedAt || new Date(),
        payload: post,
      }));

    // Tạo story activities và filter các items không hợp lệ
    const storyActivities = (stories || [])
      .filter((story: any) => story && (story._id || story.id))
      .map((story: any) => ({
        type: 'story',
        id: story._id?.toString() || story.id?.toString(),
        createdAt: story.createdAt || story.updatedAt || new Date(),
        payload: story,
      }));

    // Tạo comment activities và filter các items không hợp lệ, đảm bảo có postId
    const commentActivities = (Array.isArray(userComments) ? userComments : [])
      .filter((comment: any) => {
        // Filter các comment hợp lệ: phải có _id và postId
        if (!comment || !comment._id) return false;
        const postId = comment.postId?._id || comment.postId?.id || comment.postId;
        return !!postId;
      })
      .map((comment: any) => ({
        type: 'comment',
        id: comment._id?.toString(),
        createdAt: comment.createdAt || comment.updatedAt || new Date(),
        payload: comment,
      }));

    // Tạo reaction activities và filter các items không hợp lệ, đảm bảo có targetId
    const reactionActivities = [
      ...(Array.isArray(postReactions) ? postReactions : [])
        .filter((reaction: any) => {
          // Filter các reaction hợp lệ: phải có _id và postId
          if (!reaction || !reaction._id) return false;
          const postId = reaction.postId?._id || reaction.postId?.id || reaction.postId;
          return !!postId;
        })
        .map((reaction: any) => {
          const postId = reaction.postId?._id || reaction.postId?.id || reaction.postId;
          return {
            type: 'reaction',
            id: reaction._id?.toString(),
            createdAt: reaction.createdAt || reaction.updatedAt || new Date(),
            payload: {
              targetType: 'post',
              targetId: postId?.toString(),
              emoji: reaction.emojiId,
              target: reaction.postId,
            },
          };
        }),
      ...(Array.isArray(storyReactions) ? storyReactions : [])
        .filter((reaction: any) => {
          // Filter các reaction hợp lệ: phải có _id và storyId
          if (!reaction || !reaction._id) return false;
          const storyId = reaction.storyId?._id || reaction.storyId?.id || reaction.storyId;
          return !!storyId;
        })
        .map((reaction: any) => {
          const storyId = reaction.storyId?._id || reaction.storyId?.id || reaction.storyId;
          return {
            type: 'reaction',
            id: reaction._id?.toString(),
            createdAt: reaction.createdAt || reaction.updatedAt || new Date(),
            payload: {
              targetType: 'story',
              targetId: storyId?.toString(),
              emoji: reaction.emojiId,
              target: reaction.storyId,
            },
          };
        }),
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
      .map((activity) => {
        const date = new Date(activity.createdAt);
        return {
          ...activity,
          createdAt: isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString(),
        };
      });

    console.log('activityTimeline:', activityTimeline);

    const userData = user && !(user as any).error ? (user as any) : null;

    return {
      posts: posts.data || [],
      stories: stories || [],
      comments: Array.isArray(userComments) ? userComments : [],
      reactions: {
        posts: Array.isArray(postReactions) ? postReactions : [],
        stories: Array.isArray(storyReactions) ? storyReactions : [],
      },
      activity: activityTimeline,
      lastActive:
        (userData as any)?.updatedAt ||
        activityTimeline[0]?.createdAt ||
        null,
    };
  }

  // ===== Post Management Methods =====
  async getAllPosts(
    page: number = 1,
    limit: number = 10,
    search?: string,
  ) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.ADMIN_POST_GET_ALL, {
      page,
      limit,
      search,
    });
    return result;
  }

  async getPostById(postId: string) {
    if (!Types.ObjectId.isValid(postId)) {
      throw new HttpException('Invalid postId', HttpStatus.BAD_REQUEST);
    }
    const [adminUsers] = await this.eventEmitter.emitAsync(AppEvents.GET_ADMIN_ID, );

    const [postResult] = await this.eventEmitter.emitAsync(AppEvents.POST_GET_DETAIL, { postId, userId: adminUsers[0].toString()});
    const [commentsResult] = await this.eventEmitter.emitAsync(AppEvents.COMMENT_FIND_BY_POST_ID, { postId });
    const post = postResult || {};
    const comments = commentsResult || [];
    return { ...post, comments } as any;
  }

  async deletePost(postId: string) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.ADMIN_POST_DELETE, { postId });
    return result;
  }

  async hidePost(postId: string) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.ADMIN_POST_HIDE, { postId });
    return result;
  }

  async unhidePost(postId: string) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.ADMIN_POST_UNHIDE, { postId });
    return result;
  }

  // ===== Story Management Methods =====
  async getAllStories(
    page: number = 1,
    limit: number = 10,
    dateFrom?: Date,
    dateTo?: Date,
  ) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.ADMIN_STORY_GET_ALL, {
      page,
      limit,
      dateFrom,
      dateTo,
    });
    return result;
  }

  async getStoryById(storyId: string) {
    if (!Types.ObjectId.isValid(storyId)) {
      throw new HttpException('Invalid storyId', HttpStatus.BAD_REQUEST);
    }

    const [adminUsers] = await this.eventEmitter.emitAsync(AppEvents.GET_ADMIN_ID);
    const adminId = adminUsers[0].toString();

    const [storyInfo] = await this.eventEmitter.emitAsync(AppEvents.STORY_GET_USER_ID, { storyId });
    if (!storyInfo) {
      throw new HttpException('Story not found', HttpStatus.NOT_FOUND);
    }

    const ownerId = storyInfo.userId.toString();

    const [storyResult] = await this.eventEmitter.emitAsync(AppEvents.STORY_GET, {
      ownerId,
      viewerId: adminId,
      storyId,
    });
    
    if (!storyResult) {
      throw new HttpException('Story not found', HttpStatus.NOT_FOUND);
    }

    return storyResult;
  }

  async deleteStory(storyId: string) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.ADMIN_STORY_DELETE, { storyId });
    return result;
  }

  // ===== Comment Management Methods =====
  async getAllComments(
    page: number = 1,
    limit: number = 10,
    search?: string,
    postId?: string,
    userId?: string,
  ) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.ADMIN_COMMENT_GET_ALL, {
      page,
      limit,
      search,
      postId,
      userId,
    });
    return result;
  }

  async getCommentById(commentId: string) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.ADMIN_COMMENT_GET_BY_ID, { commentId });
    return result;
  }

  async deleteComment(commentId: string) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.ADMIN_COMMENT_DELETE, { commentId });
    return result;
  }

  // ===== Post Report Management Methods =====
  async getPostReports(
    page: number = 1,
    limit: number = 10,
    status?: 'pending' | 'reviewed' | 'rejected',
  ) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.ADMIN_POST_REPORT_GET_ALL, {
      page,
      limit,
      status,
    });
    return result;
  }

  async getPostReportById(reportId: string) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.ADMIN_POST_REPORT_GET_BY_ID, { reportId });
    return result;
  }

  async updatePostReportStatus(
    reportId: string,
    status: 'pending' | 'reviewed' | 'rejected',
    note?: string,
  ) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.ADMIN_POST_REPORT_UPDATE_STATUS, {
      reportId,
      status,
      note,
    });
    return result;
  }

  async bulkUpdatePostReportStatus(
    reportIds: string[],
    status: 'pending' | 'reviewed' | 'rejected',
    note?: string,
  ) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.ADMIN_POST_REPORT_BULK_UPDATE_STATUS, {
      reportIds,
      status,
      note,
    });
    return result;
  }

  // ===== User Report Management Methods =====
  async getUserReports(
    page: number = 1,
    limit: number = 10,
    status?: 'pending' | 'reviewed' | 'rejected',
  ) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.ADMIN_USER_REPORT_GET_ALL, {
      page,
      limit,
      status,
    });
    return result;
  }

  async getUserReportById(reportId: string) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.ADMIN_USER_REPORT_GET_BY_ID, { reportId });
    return result;
  }

  async updateUserReportStatus(
    reportId: string,
    status: 'pending' | 'reviewed' | 'rejected',
    banUntil?: string,
    banReason?: string,
  ) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.ADMIN_USER_REPORT_UPDATE_STATUS, {
      reportId,
      status,
      banUntil,
      banReason,
    });
    return result;
  }

  async bulkUpdateUserReportStatus(
    reportIds: string[],
    status: 'pending' | 'reviewed' | 'rejected',
    banUntil?: string,
    banReason?: string,
  ) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.ADMIN_USER_REPORT_BULK_UPDATE_STATUS, {
      reportIds,
      status,
      banUntil,
      banReason,
    });
    return result;
  }

  // ===== Dashboard Stats Methods =====
  async getDashboardStats() {
    const statsResults = await this.eventEmitter.emitAsync(AppEvents.ADMIN_DASHBOARD_STATS);
    const mergedStats = statsResults.reduce((acc, current) => ({
      ...acc,
      ...(current || {}),
    }), {} as Record<string, number>);

    return {
      totalUsers: mergedStats.totalUsers || 0,
      totalPosts: mergedStats.totalPosts || 0,
      totalStories: mergedStats.totalStories || 0,
      totalComments: mergedStats.totalComments || 0,
      newUsersThisMonth: mergedStats.newUsersThisMonth || 0,
      newPostsThisMonth: mergedStats.newPostsThisMonth || 0,
    };
  }

  async getUsersGrowth(days: number = 30) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.ADMIN_USERS_GROWTH, { days });
    return result;
  }

  async getPostsStats(groupBy: 'day' | 'month' = 'day', days: number = 30) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.ADMIN_POSTS_STATS, {
      groupBy,
      days,
    });
    return result;
  }

  async getPostReacts(postId: string) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.REACT_POST_FIND_BY_POST, { postId });
    return result || [];
  }

  async getPostComments(postId: string) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.COMMENT_FIND_BY_POST_ID, { postId });
    return result || [];
  }

  async getStoryReacts(storyId: string) {
    const [result] = await this.eventEmitter.emitAsync(AppEvents.REACT_STORY_FIND_BY_STORY, { storyId });
    return result || [];
  }
}
