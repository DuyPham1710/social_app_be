import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateReactPostDto } from './dto/create-react-post.dto';
import { UpdateReactPostDto } from './dto/update-react-post.dto';
import { ReactPostResponseDto } from './dto/react-post-response.dto';
import { OnEvent } from '@nestjs/event-emitter';
import { AppEvents } from 'src/shared/enums/app-events.enum';
import { EmojiResponseDto } from '../emoji/dto/emoji_response.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { BaseReactionService } from '../reaction/base-reaction.service';
import { Reaction, ReactionDocument } from '../reaction/schemas/reaction.schema';

@Injectable()
export class ReactPostService extends BaseReactionService {
  constructor(
    @InjectModel(Reaction.name)
    reactionModel: Model<ReactionDocument>,
    eventEmitter: EventEmitter2,
  ) {
    super(reactionModel, eventEmitter);
  }

  protected get targetIdField(): string { return 'postId'; }
  protected get reactionType(): string { return 'post'; }

  //Thêm hoặc đổi emoji
  async createOrUpdate(userId: string, dto: CreateReactPostDto) {
    const { postId, emojiId } = dto;
    const { result, isDeleted } = await this.createOrUpdateReaction(userId, postId, emojiId);

    if (!isDeleted) {
      this.eventEmitter.emit('react.created', {
        postId: postId,
        sender: userId,
        reactId: result._id.toString(),
        content: result.emojiId['label'],
        user: {
          fullName: result.userId['fullName'],
          username: result.userId['username'],
        }
      });
    }

    const mapped = this.mapToTargetField(result);
    return ReactPostResponseDto.fromReactPosts([mapped])[0];
  }

  //Lấy người dùng react bài post, kèm số bạn chung (nếu có viewerId)
  async findByPost(postId: string, viewerId?: string): Promise<ReactPostResponseDto[]> {
    const reacts = await this.findReactionsByTarget(postId);
    const mapped = this.mapManyToTargetField(reacts);
    let reactDtos = ReactPostResponseDto.fromReactPosts(mapped);

    if (viewerId && Types.ObjectId.isValid(viewerId)) {
      reactDtos = await this.enrichWithMutualFriends(reactDtos, viewerId);
    }

    return reactDtos;
  }

  //kiểm tra user hiện tại có react bài post không
  async findUserReactOnPost(userId: string, postId: string): Promise<EmojiResponseDto | null> {
    return this.findUserReactionOnTarget(userId, postId);
  }

  //Cập nhật emoji
  async update(userId: string, postId: string, dto: UpdateReactPostDto) {
    return this.updateReaction(userId, postId, dto.emojiId);
  }

  //xóa react
  async remove(userId: string, postId: string) {
    return this.removeReaction(userId, postId);
  }

  @OnEvent(AppEvents.REACT_POST_GET)
  async onGetReactsEvent(payload: { postIds: string[], viewerId?: string }) {
    return this.getReactionsMapForTargets(
      payload.postIds,
      payload.viewerId,
      (id, viewerId) => this.findByPost(id, viewerId),
    );
  }

  @OnEvent(AppEvents.REACT_POST_FIND_BY_USER)
  async onFindByUserEvent(payload: { userId: string, postIds: string[] }): Promise<{ [key: string]: EmojiResponseDto | null }> {
    return this.findUserReactionsOnTargets(payload.userId, payload.postIds);
  }

  @OnEvent(AppEvents.REACT_POST_FIND_BY_POST)
  async onFindByPostEvent(payload: { postId: string, viewerId?: string }) {
    return this.findByPost(payload.postId, payload.viewerId);
  }

  // ===== ADMIN EVENT LISTENERS =====
  @OnEvent(AppEvents.ADMIN_REACT_POST_FIND_BY_USER)
  async handleAdminFindByUser({ userId }: { userId: string }) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid userId');
    }

    const reactions = await this.reactionModel
      .find({ userId: new Types.ObjectId(userId), type: 'post' })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('postId', 'caption')
      .populate('emojiId', 'label icon')
      .lean()
      .exec();

    return reactions || [];
  }
}
