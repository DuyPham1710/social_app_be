import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ReactPost, ReactPostDocument } from './schemas/react-post.schema';
import { CreateReactPostDto } from './dto/create-react-post.dto';
import { UpdateReactPostDto } from './dto/update-react-post.dto';
import { ReactPostResponseDto } from './dto/react-post-response.dto';
import { OnEvent } from '@nestjs/event-emitter';
import { AppEvents } from 'src/shared/enums/app-events.enum';
import { EmojiResponseDto } from '../emoji/dto/emoji_response.dto';
import { EventEmitter2 } from '@nestjs/event-emitter';

@Injectable()
export class ReactPostService {
  constructor(
    @InjectModel(ReactPost.name)
    private readonly reactPostModel: Model<ReactPostDocument>,
    private readonly eventEmitter: EventEmitter2,
  ) { }

  //Thêm hoặc đổi emoji
  async createOrUpdate(userId: string, dto: CreateReactPostDto) {
    const { postId, emojiId } = dto;
    if (!Types.ObjectId.isValid(postId) || !Types.ObjectId.isValid(emojiId)) {
      throw new NotFoundException('Invalid postId or emojiId');
    }
    const userIdObjectId = new Types.ObjectId(userId);
    const postObjectId = new Types.ObjectId(postId);
    const emojiObjectId = new Types.ObjectId(emojiId);
    const existing = await this.reactPostModel.findOne({ userId: userIdObjectId, postId: postObjectId });

    let result;
    if (existing) {
      if (existing.emojiId.toString() === emojiObjectId.toString()) {
        // await existing.deleteOne();
        // return null;
        result = await this.reactPostModel.findOneAndDelete({
          userId: userIdObjectId,
          postId: postObjectId,
        });
      } else {
        existing.emojiId = emojiObjectId;
        result = await existing.save();
      }
    } else {
      const created = new this.reactPostModel({
        userId: userIdObjectId,
        postId: postObjectId,
        emojiId: emojiObjectId,
      });
      result = await created.save();
    }

    result = await result.populate('userId', 'fullName username avatarUrl');
    result = await result.populate('emojiId', 'label icon');

    return ReactPostResponseDto.fromReactPosts([result])[0];
  }

  //Lấy người dùng react bài post, kèm số bạn chung (nếu có viewerId)
  async findByPost(postId: string, viewerId?: string): Promise<ReactPostResponseDto[]> {
    if (!Types.ObjectId.isValid(postId)) {
      throw new NotFoundException('Invalid postId');
    }

    const postObjectId = new Types.ObjectId(postId);
    const reacts = await this.reactPostModel
      .find({ postId: postObjectId })
      .populate('userId', 'fullName username avatarUrl')
      .populate('emojiId', 'label icon');

    let reactDtos = ReactPostResponseDto.fromReactPosts(reacts);

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

  //kiểm tra user hiện tại có react bài post không
  async findUserReactOnPost(userId: string, postId: string): Promise<EmojiResponseDto | null> {
    if (!Types.ObjectId.isValid(postId)) {
      throw new NotFoundException('Invalid postId');
    }

    const postObjectId = new Types.ObjectId(postId);
    const userIdObjectId = new Types.ObjectId(userId);

    const react = await this.reactPostModel
      .findOne({ userId: userIdObjectId, postId: postObjectId })
      .populate('emojiId', 'label icon')
      .lean()
      .exec();

    if (!react) return null;

    return react.emojiId as unknown as EmojiResponseDto;
  }

  //Cập nhật emoji
  async update(userId: string, postId: string, dto: UpdateReactPostDto) {
    const react = await this.reactPostModel.findOne({ userId, postId });
    if (!react) throw new NotFoundException('React not found');

    react.emojiId = new Types.ObjectId(dto.emojiId);
    return react.save();
  }

  //xóa react
  async remove(userId: string, postId: string) {
    const deleted = await this.reactPostModel.findOneAndDelete({ userId, postId });
    if (!deleted) throw new NotFoundException('React not found');
    return deleted;
  }

  @OnEvent(AppEvents.REACT_POST_GET)
  async onGetReactsEvent(payload: { postIds: string[], viewerId?: string }) {
    const { postIds, viewerId } = payload;
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

    await Promise.all(postIds.map(async (postId) => {
      const reacts = await this.findByPost(postId, viewerId);

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

      reactsMap[postId] = sortedReacts;
    }));

    return reactsMap;
  }

  @OnEvent(AppEvents.REACT_POST_FIND_BY_USER)
  async onFindByUserEvent(payload: { userId: string, postIds: string[] }): Promise<{ [key: string]: EmojiResponseDto | null }> {
    const { userId, postIds } = payload;
    const reactMap: { [key: string]: EmojiResponseDto | null } = {};

    await Promise.all(postIds.map(async (postId) => {
      const react = await this.findUserReactOnPost(userId, postId);
      reactMap[postId] = react || null;
    }));

    return reactMap;
  }
}
