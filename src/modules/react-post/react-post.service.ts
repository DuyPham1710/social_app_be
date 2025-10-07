import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ReactPost, ReactPostDocument } from './schemas/react-post.schema';
import { CreateReactPostDto } from './dto/create-react-post.dto';
import { UpdateReactPostDto } from './dto/update-react-post.dto';

@Injectable()
export class ReactPostService {
  constructor(
    @InjectModel(ReactPost.name)
    private readonly reactPostModel: Model<ReactPostDocument>,
  ) {}

  //Thêm hoặc đổi emoji
  async createOrUpdate(userId: string, dto: CreateReactPostDto) {
    const { postId, emojiId } = dto;

    const existing = await this.reactPostModel.findOne({ userId, postId });

    if (existing) {
      existing.emojiId = new Types.ObjectId(emojiId);
      return existing.save();
    }

    const created = new this.reactPostModel({
      userId: new Types.ObjectId(userId),
      postId: new Types.ObjectId(postId),
      emojiId: new Types.ObjectId(emojiId),
    });

    return created.save();
  }

  //Lấy người dùng react bài post
  async findByPost(postId: string) {
    return this.reactPostModel
      .find({ postId })
      .populate('userId', 'username avatar')
      .populate('emojiId', 'name icon');
  }

  //kiểm tra user hiện tại có react bài post không
  async findUserReactOnPost(userId: string, postId: string) {
    const react = await this.reactPostModel
      .findOne({ userId, postId })
      .populate('emojiId', 'name icon');
    return react ? react.emojiId : null;
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
}
