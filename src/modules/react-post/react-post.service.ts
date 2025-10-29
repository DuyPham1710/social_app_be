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

@Injectable()
export class ReactPostService {
  constructor(
    @InjectModel(ReactPost.name)
    private readonly reactPostModel: Model<ReactPostDocument>,
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
      existing.emojiId = emojiObjectId;
      result = await existing.save();
    } else {
      const created = new this.reactPostModel({
        userId: userIdObjectId,
        postId: postObjectId,
        emojiId: emojiObjectId,
      });
      result = await created.save();
    }

    result = await result.populate('userId', 'username avatarUrl');
    result = await result.populate('emojiId', 'label icon');

    return ReactPostResponseDto.fromReactPosts([result])[0];
  }

  //Lấy người dùng react bài post
  async findByPost(postId: string): Promise<ReactPostResponseDto[]> {
    if (!Types.ObjectId.isValid(postId)) {
      throw new NotFoundException('Invalid postId');
    }

    const postObjectId = new Types.ObjectId(postId);
    const reacts = await this.reactPostModel
      .find({ postId: postObjectId })
      .populate('userId', 'username avatarUrl')
      .populate('emojiId', 'label icon');

    return ReactPostResponseDto.fromReactPosts(reacts);
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
  async onGetReactsEvent(payload: { postIds: string[] }) {
    const { postIds } = payload;
    const reactsMap = {};

    await Promise.all(postIds.map(async (postId) => {
      const reacts = await this.findByPost(postId);
      reactsMap[postId] = reacts;
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
