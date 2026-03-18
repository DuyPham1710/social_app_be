import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateReactStoryDto } from './dto/create-react-story.dto';
import { UpdateReactStoryDto } from './dto/update-react-story.dto';
import { OnEvent } from '@nestjs/event-emitter';
import { AppEvents } from 'src/shared/enums/app-events.enum';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ReactStoryResponseDto } from './dto/react-story-response.dto';
import { EmojiResponseDto } from 'src/modules/emoji/dto/emoji_response.dto';
import { BaseReactionService } from '../reaction/base-reaction.service';
import { Reaction, ReactionDocument } from '../reaction/schemas/reaction.schema';

@Injectable()
export class ReactStoryService extends BaseReactionService {
  constructor(
    @InjectModel(Reaction.name)
    reactionModel: Model<ReactionDocument>,
    eventEmitter: EventEmitter2,
  ) {
    super(reactionModel, eventEmitter);
  }

  protected get targetIdField(): string { return 'storyId'; }
  protected get reactionType(): string { return 'story'; }

  //tạo react
  async createOrUpdate(userId: string, dto: CreateReactStoryDto) {
    const { storyId, emojiId } = dto;
    const { result, isCreated } = await this.createOrUpdateReaction(userId, storyId, emojiId);

    if (isCreated) {
      this.eventEmitter.emit('react.story.created', {
        storyId: new Types.ObjectId(storyId),
        sender: userId,
        reactId: result._id.toString(),
        content: result.emojiId['label'],
        user: {
          fullName: result.userId['fullName'],
          username: result.userId['username'],
        }
      });
    }

    if (!result) return null;

    const mapped = this.mapToTargetField(result);
    return mapped;
  }

  //Lấy danh sách react của 1 story
  async findByStory(storyId: string, viewerId?: string): Promise<ReactStoryResponseDto[]> {
    const reacts = await this.findReactionsByTarget(storyId);
    const mapped = this.mapManyToTargetField(reacts);
    let reactDtos = ReactStoryResponseDto.fromReactStories(mapped);

    if (viewerId && Types.ObjectId.isValid(viewerId)) {
      reactDtos = await this.enrichWithMutualFriends(reactDtos, viewerId);
    }

    return reactDtos;
  }

  //kiểm tra user hiện tại có thả react cho story không
  async findUserReactOnStory(userId: string, storyId: string): Promise<EmojiResponseDto | null> {
    const react = await this.findUserReactionOnTarget(userId, storyId);
    if (!react) return null;

    // ReactStory trả về format cụ thể hơn
    const emojiId = react as any;
    return {
      _id: emojiId._id?.toString() || emojiId.toString(),
      label: emojiId.label,
      icon: emojiId.icon,
    } as unknown as EmojiResponseDto;
  }

  //cập nhật react
  async update(userId: string, storyId: string, dto: UpdateReactStoryDto) {
    return this.updateReaction(userId, storyId, dto.emojiId);
  }

  //xóa react
  async remove(userId: string, storyId: string) {
    return this.removeReaction(userId, storyId);
  }

  @OnEvent(AppEvents.REACT_STORY_GET)
  async onGetReactsEvent(payload: { storyIds: string[], viewerId?: string }) {
    return this.getReactionsMapForTargets(
      payload.storyIds,
      payload.viewerId,
      (id, viewerId) => this.findByStory(id, viewerId),
    );
  }

  @OnEvent(AppEvents.REACT_STORY_FIND_BY_USER)
  async onFindByUserEvent(payload: { userId: string, storyIds: string[] }): Promise<{ [key: string]: EmojiResponseDto | null }> {
    return this.findUserReactionsOnTargets(payload.userId, payload.storyIds);
  }

  @OnEvent(AppEvents.REACT_STORY_FIND_BY_STORY)
  async onFindByStoryEvent(payload: { storyId: string, viewerId?: string }) {
    return this.findByStory(payload.storyId, payload.viewerId);
  }

  // ===== ADMIN EVENT LISTENERS =====
  @OnEvent(AppEvents.ADMIN_REACT_STORY_FIND_BY_USER)
  async handleAdminFindByUser({ userId }: { userId: string }) {
    if (!Types.ObjectId.isValid(userId)) {
      throw new NotFoundException('Invalid userId');
    }

    const reactions = await this.reactionModel
      .find({ userId: new Types.ObjectId(userId), type: 'story' })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate({ path: 'postId', model: 'Story' })
      .populate('emojiId', 'label icon')
      .lean()
      .exec();

    // Map postId → storyId trong response để giữ nguyên output
    const mapped = (reactions || []).map((r: any) => ({
      ...r,
      storyId: r.postId,
      postId: undefined,
    }));

    return mapped;
  }
}
