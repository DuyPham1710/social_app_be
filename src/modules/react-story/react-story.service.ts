import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ReactStory, ReactStoryDocument } from './schemas/react-story.schema';
import { CreateReactStoryDto } from './dto/create-react-story.dto';
import { UpdateReactStoryDto } from './dto/update-react-story.dto';
import { OnEvent } from '@nestjs/event-emitter';
import { AppEvents } from 'src/shared/enums/app-events.enum';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ReactStoryResponseDto } from './dto/react-story-response.dto';
import { EmojiResponseDto } from 'src/modules/emoji/dto/emoji_response.dto';

@Injectable()
export class ReactStoryService {
  constructor(
    @InjectModel(ReactStory.name)
    private readonly reactStoryModel: Model<ReactStoryDocument>,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  //tạo react
  async createOrUpdate(userId: string, dto: CreateReactStoryDto) {
    const { storyId, emojiId } = dto;
    if (!Types.ObjectId.isValid(storyId) || !Types.ObjectId.isValid(emojiId)) {
      throw new NotFoundException('Invalid storyId or emojiId');
    }
    const userIdObjectId = new Types.ObjectId(userId);
    const storyObjectId = new Types.ObjectId(storyId);
    const emojiObjectId = new Types.ObjectId(emojiId);
    const existing = await this.reactStoryModel.findOne({ userId: userIdObjectId, storyId: storyObjectId });

    let result;
    let isDeleted = false;
    if (existing) {
      if (existing.emojiId.toString() === emojiObjectId.toString()) {

        result = await this.reactStoryModel.findOneAndDelete({
          userId: userIdObjectId,
          storyId: storyObjectId,
        });
        isDeleted = true;
      } else {

        existing.emojiId = emojiObjectId;
        result = await existing.save();
      }
    } else {

      const created = new this.reactStoryModel({
        userId: userIdObjectId,
        storyId: storyObjectId,
        emojiId: emojiObjectId,
      });
      result = await created.save();
    }


    if (isDeleted) {
      return null;
    }


    if (result) {
      result = await result.populate('userId', 'fullName username avatarUrl');
      result = await result.populate('emojiId', 'label icon');
    }

    return result;
  }


  //Lấy danh sách react của 1 story
  async findByStory(storyId: string, viewerId?: string): Promise<ReactStoryResponseDto[]> {
    if (!Types.ObjectId.isValid(storyId)) {
      throw new NotFoundException('Invalid storyId');
    }

    const storyObjectId = new Types.ObjectId(storyId);
    const reacts = await this.reactStoryModel
      .find({ storyId: storyObjectId })
      .populate('userId', 'fullName username avatarUrl')
      .populate('emojiId', 'label icon');

    let reactDtos = ReactStoryResponseDto.fromReactStories(reacts);

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

  //kiểm tra user hiện tại có thả react cho story không
  async findUserReactOnStory(userId: string, storyId: string): Promise<EmojiResponseDto | null> {
    if (!Types.ObjectId.isValid(storyId)) {
      throw new NotFoundException('Invalid storyId');
    }

    const storyObjectId = new Types.ObjectId(storyId);
    const userIdObjectId = new Types.ObjectId(userId);

    const react = await this.reactStoryModel
      .findOne({ userId: userIdObjectId, storyId: storyObjectId })
      .populate('emojiId', 'label icon')
      .lean()
      .exec();

    if (!react || !react.emojiId) return null;

    const emojiId = react.emojiId as any;
    return {
      _id: emojiId._id?.toString() || emojiId.toString(),
      label: emojiId.label,
      icon: emojiId.icon,
    } as unknown as EmojiResponseDto;
  }

  //cập nhật react
  async update(userId: string, storyId: string, dto: UpdateReactStoryDto) {
    const react = await this.reactStoryModel.findOne({ userId, storyId });
    if (!react) throw new NotFoundException('React not found');

    react.emojiId = new Types.ObjectId(dto.emojiId);
    return react.save();
  }

  //xóa react
  async remove(userId: string, storyId: string) {
    const deleted = await this.reactStoryModel.findOneAndDelete({ userId, storyId });
    if (!deleted) throw new NotFoundException('React not found');
    return deleted;
  }

  @OnEvent(AppEvents.REACT_STORY_GET)
  async onGetReactsEvent(payload: { storyIds: string[], viewerId?: string }) {
    const { storyIds, viewerId } = payload;
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

    await Promise.all(storyIds.map(async (storyId) => {
      const reacts = await this.findByStory(storyId, viewerId);

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

      reactsMap[storyId] = sortedReacts;
    }));

    return reactsMap;
  }

  @OnEvent(AppEvents.REACT_STORY_FIND_BY_USER)
  async onFindByUserEvent(payload: { userId: string, storyIds: string[] }): Promise<{ [key: string]: EmojiResponseDto | null }> {
    const { userId, storyIds } = payload;
    const reactMap: { [key: string]: EmojiResponseDto | null } = {};

    await Promise.all(storyIds.map(async (storyId) => {
      const react = await this.findUserReactOnStory(userId, storyId);
      reactMap[storyId] = react || null;
    }));

    return reactMap;
  }
}
