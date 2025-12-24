import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';

import { OnEvent } from '@nestjs/event-emitter';
import { AppEvents } from 'src/shared/enums/app-events.enum';
import { EmojiResponseDto } from '../emoji/dto/emoji_response.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { find } from 'rxjs';
import { ReactComment, ReactCommentDocument } from './schemas/react-comment.schema';
import { ReactCommentResponseDto } from './dto/react-comment-response';
import { UpdateReactCommentDto } from './dto/update-react-comment.dto';
import { CreateReactCommentDto } from './dto/create-react-comment.dto';

@Injectable()
export class ReactCommentService {
  constructor(
    @InjectModel(ReactComment.name)
    private readonly reactCommentModel: Model<ReactCommentDocument>,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  //Thêm hoặc đổi emoji
  async createOrUpdate(userId: string, dto: CreateReactCommentDto) {
    const { commentId, emojiId } = dto;
    if (!Types.ObjectId.isValid(commentId) || !Types.ObjectId.isValid(emojiId)) {
      throw new NotFoundException('Invalid commentId or emojiId');
    }
    const userIdObjectId = new Types.ObjectId(userId);
    const commentObjectId = new Types.ObjectId(commentId);
    const emojiObjectId = new Types.ObjectId(emojiId);
    const existing = await this.reactCommentModel.findOne({ userId: userIdObjectId, commentId: commentObjectId });

    let result;
    let isCreated = false;
    if (existing) {
      if (existing.emojiId.toString() === emojiObjectId.toString()) {
        // await existing.deleteOne();
        // return null;
        result = await this.reactCommentModel.findOneAndDelete({
          userId: userIdObjectId,
          commentId: commentObjectId,
        });
      } else {
        existing.emojiId = emojiObjectId;
        result = await existing.save();
      }
    } else {
      const created = new this.reactCommentModel({
        userId: userIdObjectId,
        commentId: commentObjectId,
        emojiId: emojiObjectId,
      });
      isCreated = true;
      result = await created.save();
    }

    result = await result.populate('userId', 'fullName username avatarUrl');
    result = await result.populate('emojiId', 'label icon');

    if (isCreated) {
      this.eventEmitter.emit('react.comment.created', {
        commentId: commentId,
        sender: userId,
        reactId: result._id.toString(),
        content: result.emojiId['label'],
        user: {
          fullName: result.userId['fullName'],
          username: result.userId['username'],
        },
      });
    }
    return ReactCommentResponseDto.fromReactComments([result])[0];
  }

  //Lấy người dùng react bài comment, kèm số bạn chung (nếu có viewerId)
  async findByComment(commentId: string, viewerId?: string): Promise<ReactCommentResponseDto[]> {
    if (!Types.ObjectId.isValid(commentId)) {
      throw new NotFoundException('Invalid commentId');
    }

    const commentObjectId = new Types.ObjectId(commentId);
    const reacts = await this.reactCommentModel
      .find({ commentId: commentObjectId })
      .populate('userId', 'fullName username avatarUrl')
      .populate('emojiId', 'label icon');

    let reactDtos = ReactCommentResponseDto.fromReactComments(reacts);
    // Tính số bạn chung nếu có viewerId
    if (viewerId && Types.ObjectId.isValid(viewerId)) {
      try {
        const [viewerFriends] = await this.eventEmitter.emitAsync(AppEvents.FRIENDS_GET, { userId: viewerId });
        const viewerFriendIds: string[] = ((viewerFriends || []).map((f: any) => f._id?.toString()).filter(Boolean)) as string[];
        const viewerFriendSet = new Set<string>(viewerFriendIds);

        // Lấy danh sách userId duy nhất từ các react
        const uniqueReactorIds: string[] = Array.from(new Set(reactDtos.map(r => r.userId?.userId?.toString()).filter(Boolean))) as string[];

        // Map userId -> friendId set
        const reactorFriendsMap: { [key: string]: Set<string> } = {};
        await Promise.all(uniqueReactorIds.map(async (reactorId) => {
          const [friends] = await this.eventEmitter.emitAsync(AppEvents.FRIENDS_GET, { userId: reactorId });
          const friendIds: string[] = ((friends || []).map((f: any) => f._id?.toString()).filter(Boolean)) as string[];
          reactorFriendsMap[reactorId] = new Set<string>(friendIds);
        }));

        // Gán mutualFriendsCount
        reactDtos = reactDtos.map(dto => {
          const reactorId = dto.userId?.userId?.toString();

          if (!reactorId) return dto;

          const reactorFriendSet = reactorFriendsMap[reactorId] || new Set<string>();
          let count = 0;

          viewerFriendSet.forEach((id: string) => { if (reactorFriendSet.has(id)) count++; });

          if (reactorId !== viewerId) {
            dto.mutualFriendsCount = count;

            // kiểm tra người này có phải bạn của viewer không
            dto.isFriend = viewerFriendSet.has(reactorId);
          }




          return dto;
        });
      } catch (e) {
        // Nếu có lỗi khi tính bạn chung, vẫn trả về danh sách reacts bình thường
        return reactDtos;
      }
    }

    return reactDtos;
  }

  //kiểm tra user hiện tại có react bài comment không
  async findUserReactOnComment(userId: string, commentId: string): Promise<EmojiResponseDto | null> {
    if (!Types.ObjectId.isValid(commentId)) {
      throw new NotFoundException('Invalid commentId');
    }

    const commentObjectId = new Types.ObjectId(commentId);
    const userIdObjectId = new Types.ObjectId(userId);

    const react = await this.reactCommentModel
      .findOne({ userId: userIdObjectId, commentId: commentObjectId })
      .populate('emojiId', 'label icon')
      .lean()
      .exec();

    if (!react) return null;

    return react.emojiId as unknown as EmojiResponseDto;
  }

  //Cập nhật emoji
  async update(userId: string, commentId: string, dto: UpdateReactCommentDto) {
    const react = await this.reactCommentModel.findOne({ userId, commentId });
    if (!react) throw new NotFoundException('React not found');

    react.emojiId = new Types.ObjectId(dto.emojiId);
    return react.save();
  }

  //xóa react
  async remove(userId: string, commentId: string) {
    const deleted = await this.reactCommentModel.findOneAndDelete({ userId, commentId });
    if (!deleted) throw new NotFoundException('React not found');
    return deleted;
  }

  @OnEvent(AppEvents.REACT_COMMENT_GET)
  async onGetReactsEvent(payload: { commentIds: string[], viewerId?: string }) {
    const { commentIds, viewerId } = payload;
    const reactsMap = {};

    // Lấy danh sách bạn bè của viewer (nếu có)
    let viewerFriendSet: Set<string> | null = null;
    const viewerIdStr = viewerId && Types.ObjectId.isValid(viewerId) ? viewerId.toString() : null;
    if (viewerIdStr) {
      try {
        const [viewerFriends] = await this.eventEmitter.emitAsync(AppEvents.FRIENDS_GET, { userId: viewerIdStr });
        const viewerFriendIds: string[] = ((viewerFriends || []).map((f: any) => f._id?.toString()).filter(Boolean)) as string[];
        viewerFriendSet = new Set<string>(viewerFriendIds);
      } catch {
        viewerFriendSet = null;
      }
    }

    await Promise.all(commentIds.map(async (commentId) => {
      const reacts = await this.findByComment(commentId, viewerId);

      // Sắp xếp: viewer trước, sau đó bạn bè, sau đó những người còn lại theo createdAt giảm dần
      let sortedReacts = reacts;
      if (viewerIdStr && viewerFriendSet) {
        sortedReacts = [...reacts].sort((a, b) => {
          const aId = a.userId?.userId?.toString() || '';
          const bId = b.userId?.userId?.toString() || '';

          const aRank = aId === viewerIdStr ? 0 : (viewerFriendSet!.has(aId) ? 1 : 2);
          const bRank = bId === viewerIdStr ? 0 : (viewerFriendSet!.has(bId) ? 1 : 2);

          if (aRank !== bRank) return aRank - bRank;
          // Cùng nhóm: sắp xếp theo createdAt giảm dần
          const aCreated = (a as any).createdAt ? new Date((a as any).createdAt).getTime() : 0;
          const bCreated = (b as any).createdAt ? new Date((b as any).createdAt).getTime() : 0;
          return bCreated - aCreated;
        });
      }

      reactsMap[commentId] = sortedReacts;
    }));

    return reactsMap;
  }

  @OnEvent(AppEvents.REACT_COMMENT_FIND_BY_USER)
  async onFindByUserEvent(payload: { userId: string, commentIds: string[] }): Promise<{ [key: string]: EmojiResponseDto | null }> {
    const { userId, commentIds } = payload;
    const reactMap: { [key: string]: EmojiResponseDto | null } = {};

    await Promise.all(commentIds.map(async (commentId) => {
      const react = await this.findUserReactOnComment(userId, commentId);
      reactMap[commentId] = react || null;
    }));

    return reactMap;
  }
}
