import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ReactPost, ReactPostDocument } from './schemas/react-post.schema';
import { CreateReactPostDto } from './dto/create-react-post.dto';
import { UpdateReactPostDto } from './dto/update-react-post.dto';

@Injectable()
export class ReactPostService {
  constructor(
    @InjectModel(ReactPost.name)
    private reactPostModel: Model<ReactPostDocument>,
  ) {}

  async create(dto: CreateReactPostDto & { userId: string }) {
    const userId = new Types.ObjectId(dto.userId);
    const emojiId = new Types.ObjectId(dto.emojiId);
    const postId = dto.postId ? new Types.ObjectId(dto.postId) : null;
    const commentId = dto.commentId ? new Types.ObjectId(dto.commentId) : null;

    const existing = await this.reactPostModel.findOne({
      userId,
      postId,
      commentId,
    });

    if (existing) {
      existing.emojiId = emojiId;
      return existing.save();
    }

    return this.reactPostModel.create({
      userId,
      postId,
      commentId,
      emojiId,
    });
  }

  async update(id: string, dto: UpdateReactPostDto) {
    return this.reactPostModel.findByIdAndUpdate(
      new Types.ObjectId(id),
      { $set: { emojiId: new Types.ObjectId(dto.emojiId) } },
      { new: true },
    );
  }

  async remove(id: string, userId: string) {
    return this.reactPostModel.findOneAndDelete({
      _id: new Types.ObjectId(id),
      userId: new Types.ObjectId(userId),
    });
  }
}
