import { NotFoundException } from '@nestjs/common';
import { Model, Types } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppEvents } from 'src/shared/enums/app-events.enum';
import { EmojiResponseDto } from '../emoji/dto/emoji_response.dto';
import { ReactionDocument } from './schemas/reaction.schema';

/**
 * BaseReactionService - Lớp cha chứa logic chung cho react-post, react-comment, react-story.
 * Sử dụng Reaction schema duy nhất, phân biệt loại bằng field `type`.
 * Field `targetId` trong schema được dùng chung để lưu targetId (postId/commentId/storyId).
 */
export abstract class BaseReactionService {
  constructor(
    protected readonly reactionModel: Model<ReactionDocument>,
    protected readonly eventEmitter: EventEmitter2,
  ) {}

  /** Tên field target trong DTO/response: 'postId' | 'commentId' | 'storyId' */
  protected abstract get targetIdField(): string;

  /** Loại reaction: 'post' | 'comment' | 'story' */
  protected abstract get reactionType(): string;

  /**
   * Tạo/cập nhật/toggle reaction.
   * - Nếu đã tồn tại cùng emoji → xóa (toggle off)
   * - Nếu khác emoji → cập nhật
   * - Nếu chưa có → tạo mới
   */
  protected async createOrUpdateReaction(
    userId: string,
    targetId: string,
    emojiId: string,
  ): Promise<{ result: any; isDeleted: boolean; isCreated: boolean }> {
    if (!Types.ObjectId.isValid(targetId) || !Types.ObjectId.isValid(emojiId)) {
      throw new NotFoundException(`Invalid ${this.targetIdField} or emojiId`);
    }

    const userIdObjectId = new Types.ObjectId(userId);
    const targetObjectId = new Types.ObjectId(targetId);
    const emojiObjectId = new Types.ObjectId(emojiId);

    const filter = {
      userId: userIdObjectId,
      targetId: targetObjectId,
      type: this.reactionType,
    };

    const existing = await this.reactionModel.findOne(filter);

    let result;
    let isDeleted = false;
    let isCreated = false;

    if (existing) {
      if (existing.emojiId.toString() === emojiObjectId.toString()) {
        result = await this.reactionModel.findOneAndDelete(filter);
        isDeleted = true;
      } else {
        existing.emojiId = emojiObjectId;
        result = await existing.save();
      }
    } else {
      const created = new this.reactionModel({
        userId: userIdObjectId,
        targetId: targetObjectId,
        emojiId: emojiObjectId,
        type: this.reactionType,
      });
      result = await created.save();
      isCreated = true;
    }

    if (result) {
      result = await result.populate('userId', 'fullName username avatarUrl');
      result = await result.populate('emojiId', 'label icon');
    }

    return { result, isDeleted, isCreated };
  }

  /** Lấy danh sách reactions theo target ID */
  protected async findReactionsByTarget(targetId: string): Promise<any[]> {
    if (!Types.ObjectId.isValid(targetId)) {
      throw new NotFoundException(`Invalid ${this.targetIdField}`);
    }

    const targetObjectId = new Types.ObjectId(targetId);
    return this.reactionModel
      .find({ targetId: targetObjectId, type: this.reactionType })
      .populate('userId', 'fullName username avatarUrl')
      .populate('emojiId', 'label icon');
  }

  /** Kiểm tra user có react target không, trả về emoji nếu có */
  protected async findUserReactionOnTarget(
    userId: string,
    targetId: string,
  ): Promise<EmojiResponseDto | null> {
    if (!Types.ObjectId.isValid(targetId)) {
      throw new NotFoundException(`Invalid ${this.targetIdField}`);
    }

    const react = await this.reactionModel
      .findOne({
        userId: new Types.ObjectId(userId),
        targetId: new Types.ObjectId(targetId),
        type: this.reactionType,
      })
      .populate('emojiId', 'label icon')
      .lean()
      .exec();

    if (!react) return null;
    return react.emojiId as unknown as EmojiResponseDto;
  }

  /** Cập nhật emoji */
  protected async updateReaction(userId: string, targetId: string, emojiId: string) {
    const react = await this.reactionModel.findOne({
      userId,
      targetId: targetId,
      type: this.reactionType,
    });
    if (!react) throw new NotFoundException('React not found');

    react.emojiId = new Types.ObjectId(emojiId);
    return react.save();
  }

  /** Xóa reaction */
  protected async removeReaction(userId: string, targetId: string) {
    const deleted = await this.reactionModel.findOneAndDelete({
      userId,
      targetId: targetId,
      type: this.reactionType,
    });
    if (!deleted) throw new NotFoundException('React not found');
    return deleted;
  }

  /**
   * Map Reaction document → plain object với target field đúng tên.
   * VD: postId trong schema → commentId trong response cho react-comment.
   */
  protected mapToTargetField(doc: any): any {
    if (!doc) return doc;
    const obj = doc.toObject ? doc.toObject() : { ...doc };
    if (this.targetIdField !== 'targetId') {
      obj[this.targetIdField] = obj.targetId;
    }
    return obj;
  }

  protected mapManyToTargetField(docs: any[]): any[] {
    return docs.map((doc) => this.mapToTargetField(doc));
  }

  /** Tính mutual friends và gán vào DTOs */
  protected async enrichWithMutualFriends(reactDtos: any[], viewerId: string): Promise<any[]> {
    if (!viewerId || !Types.ObjectId.isValid(viewerId)) return reactDtos;

    try {
      const [viewerFriends] = await this.eventEmitter.emitAsync(AppEvents.FRIENDS_GET, { userId: viewerId });
      const viewerFriendIds: string[] = ((viewerFriends || []).map((f: any) => f._id?.toString()).filter(Boolean)) as string[];
      const viewerFriendSet = new Set<string>(viewerFriendIds);

      const uniqueReactorIds: string[] = Array.from(
        new Set(reactDtos.map((r) => r.userId?.userId?.toString()).filter(Boolean)),
      ) as string[];

      const reactorFriendsMap: { [key: string]: Set<string> } = {};
      await Promise.all(
        uniqueReactorIds.map(async (reactorId) => {
          const [friends] = await this.eventEmitter.emitAsync(AppEvents.FRIENDS_GET, { userId: reactorId });
          const friendIds: string[] = ((friends || []).map((f: any) => f._id?.toString()).filter(Boolean)) as string[];
          reactorFriendsMap[reactorId] = new Set<string>(friendIds);
        }),
      );

      reactDtos = reactDtos.map((dto) => {
        const reactorId = dto.userId?.userId?.toString();
        if (!reactorId) return dto;

        const reactorFriendSet = reactorFriendsMap[reactorId] || new Set<string>();
        let count = 0;
        viewerFriendSet.forEach((id: string) => {
          if (reactorFriendSet.has(id)) count++;
        });

        if (reactorId !== viewerId) {
          dto.mutualFriendsCount = count;
          dto.isFriend = viewerFriendSet.has(reactorId);
        }

        return dto;
      });

      return reactDtos;
    } catch (e) {
      return reactDtos;
    }
  }

  /** Sắp xếp reactions: viewer → bạn bè → người khác, rồi theo createdAt giảm dần */
  protected sortReactions(reacts: any[], viewerIdStr: string | null, viewerFriendSet: Set<string> | null): any[] {
    if (!viewerIdStr || !viewerFriendSet) return reacts;

    return [...reacts].sort((a, b) => {
      const aId = a.userId?.userId?.toString() || '';
      const bId = b.userId?.userId?.toString() || '';

      const aRank = aId === viewerIdStr ? 0 : viewerFriendSet!.has(aId) ? 1 : 2;
      const bRank = bId === viewerIdStr ? 0 : viewerFriendSet!.has(bId) ? 1 : 2;

      if (aRank !== bRank) return aRank - bRank;

      const aCreated = (a as any).createdAt ? new Date((a as any).createdAt).getTime() : 0;
      const bCreated = (b as any).createdAt ? new Date((b as any).createdAt).getTime() : 0;
      return bCreated - aCreated;
    });
  }

  /** Lấy viewerFriendSet để dùng cho sorting */
  protected async getViewerFriendSet(viewerId?: string): Promise<{
    viewerIdStr: string | null;
    viewerFriendSet: Set<string> | null;
  }> {
    const viewerIdStr = viewerId && Types.ObjectId.isValid(viewerId) ? viewerId.toString() : null;
    if (!viewerIdStr) return { viewerIdStr: null, viewerFriendSet: null };

    try {
      const [viewerFriends] = await this.eventEmitter.emitAsync(AppEvents.FRIENDS_GET, { userId: viewerIdStr });
      const viewerFriendIds: string[] = ((viewerFriends || []).map((f: any) => f._id?.toString()).filter(Boolean)) as string[];
      return { viewerIdStr, viewerFriendSet: new Set<string>(viewerFriendIds) };
    } catch {
      return { viewerIdStr, viewerFriendSet: null };
    }
  }

  /** Lấy reactions cho nhiều targets (dùng cho event handlers) */
  protected async getReactionsMapForTargets(
    targetIds: string[],
    viewerId: string | undefined,
    findByTargetFn: (targetId: string, viewerId?: string) => Promise<any[]>,
  ): Promise<{ [key: string]: any[] }> {
    const reactsMap = {};
    const { viewerIdStr, viewerFriendSet } = await this.getViewerFriendSet(viewerId);

    await Promise.all(
      targetIds.map(async (targetId) => {
        const reacts = await findByTargetFn(targetId, viewerId);
        reactsMap[targetId] = this.sortReactions(reacts, viewerIdStr, viewerFriendSet);
      }),
    );

    return reactsMap;
  }

  /** Tìm reactions của user trên nhiều targets (dùng cho event handlers) */
  protected async findUserReactionsOnTargets(
    userId: string,
    targetIds: string[],
  ): Promise<{ [key: string]: EmojiResponseDto | null }> {
    const reactMap: { [key: string]: EmojiResponseDto | null } = {};

    await Promise.all(
      targetIds.map(async (targetId) => {
        reactMap[targetId] = (await this.findUserReactionOnTarget(userId, targetId)) || null;
      }),
    );

    return reactMap;
  }
}
