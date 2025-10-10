import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { ReactStory, ReactStoryDocument } from './schemas/react-story.schema';
import { CreateReactStoryDto } from './dto/create-react-story.dto';
import { UpdateReactStoryDto } from './dto/update-react-story.dto';

@Injectable()
export class ReactStoryService {
  constructor(
    @InjectModel(ReactStory.name)
    private readonly reactStoryModel: Model<ReactStoryDocument>,
  ) { }

  //tạo react
  async createOrUpdate(userId: string, dto: CreateReactStoryDto) {
    const { storyId, emojiId } = dto;
    const existing = await this.reactStoryModel.findOne({ userId, storyId });

    if (existing) {
      existing.emojiId = new Types.ObjectId(emojiId);
      return existing.save();
    }

    const created = new this.reactStoryModel({
      userId: new Types.ObjectId(userId),
      storyId: new Types.ObjectId(storyId),
      emojiId: new Types.ObjectId(emojiId),
    });

    return created.save();
  }


  //Lấy danh sách react của 1 story
  async findByStory(storyId: string) {
    return this.reactStoryModel
      .find({ storyId })
      .populate('userId', 'username avatarUrl')
      .populate('emojiId', 'name icon');
  }

  //kiểm tra user hiện tại có thả react cho story không
  async findUserReactOnStory(userId: string, storyId: string) {
    const react = await this.reactStoryModel
      .findOne({ userId, storyId })
      .populate('emojiId', 'name icon');
    return react ? react.emojiId : null;
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
}
