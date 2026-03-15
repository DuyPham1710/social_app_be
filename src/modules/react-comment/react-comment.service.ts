import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OnEvent } from '@nestjs/event-emitter';
import { AppEvents } from 'src/shared/enums/app-events.enum';
import { EmojiResponseDto } from '../emoji/dto/emoji_response.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ReactCommentResponseDto } from './dto/react-comment-response';
import { UpdateReactCommentDto } from './dto/update-react-comment.dto';
import { CreateReactCommentDto } from './dto/create-react-comment.dto';
import { BaseReactionService } from '../reaction/base-reaction.service';
import { Reaction, ReactionDocument } from '../reaction/schemas/reaction.schema';

@Injectable()
export class ReactCommentService extends BaseReactionService {
  constructor(
    @InjectModel(Reaction.name)
    reactionModel: Model<ReactionDocument>,
    eventEmitter: EventEmitter2,
  ) {
    super(reactionModel, eventEmitter);
  }

  protected get targetIdField(): string { return 'commentId'; }
  protected get reactionType(): string { return 'comment'; }

  //Thêm hoặc đổi emoji
  async createOrUpdate(userId: string, dto: CreateReactCommentDto) {
    const { commentId, emojiId } = dto;
    const { result, isCreated } = await this.createOrUpdateReaction(userId, commentId, emojiId);

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

    const mapped = this.mapToTargetField(result);
    return ReactCommentResponseDto.fromReactComments([mapped])[0];
  }

  //Lấy người dùng react comment, kèm số bạn chung (nếu có viewerId)
  async findByComment(commentId: string, viewerId?: string): Promise<ReactCommentResponseDto[]> {
    const reacts = await this.findReactionsByTarget(commentId);
    const mapped = this.mapManyToTargetField(reacts);
    let reactDtos = ReactCommentResponseDto.fromReactComments(mapped);

    if (viewerId && Types.ObjectId.isValid(viewerId)) {
      reactDtos = await this.enrichWithMutualFriends(reactDtos, viewerId);
    }

    return reactDtos;
  }

  //kiểm tra user hiện tại có react comment không
  async findUserReactOnComment(userId: string, commentId: string): Promise<EmojiResponseDto | null> {
    return this.findUserReactionOnTarget(userId, commentId);
  }

  //Cập nhật emoji
  async update(userId: string, commentId: string, dto: UpdateReactCommentDto) {
    return this.updateReaction(userId, commentId, dto.emojiId);
  }

  //xóa react
  async remove(userId: string, commentId: string) {
    return this.removeReaction(userId, commentId);
  }

  @OnEvent(AppEvents.REACT_COMMENT_GET)
  async onGetReactsEvent(payload: { commentIds: string[], viewerId?: string }) {
    return this.getReactionsMapForTargets(
      payload.commentIds,
      payload.viewerId,
      (id, viewerId) => this.findByComment(id, viewerId),
    );
  }

  @OnEvent(AppEvents.REACT_COMMENT_FIND_BY_USER)
  async onFindByUserEvent(payload: { userId: string, commentIds: string[] }): Promise<{ [key: string]: EmojiResponseDto | null }> {
    return this.findUserReactionsOnTargets(payload.userId, payload.commentIds);
  }
}
