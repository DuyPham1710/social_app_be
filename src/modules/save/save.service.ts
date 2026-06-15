import {
  Injectable,
  ConflictException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AppEvents } from '../../shared/enums/app-events.enum';
import { Saved, SaveDocument } from './schemas/saved.schema';
import { CreateSaveDto } from './dto/create-save.dto';
import { RecommendationInteractionService } from 'src/recommendations/services/recommendation-interaction.service';
import { PostInteractionType } from 'src/common/enums/post-interaction-type.enum';

@Injectable()
export class SaveService {
  private readonly logger = new Logger(SaveService.name);

  constructor(
    @InjectModel(Saved.name)
    private readonly saveModel: Model<SaveDocument>,
    private readonly eventEmitter: EventEmitter2,
    private readonly recommendationInteractionService: RecommendationInteractionService,
  ) {}

  // Lưu bài post (hoặc reel, comment)
  async save(userId: string, dto: CreateSaveDto): Promise<SaveDocument> {
    try {
      const saved = await this.saveModel.create({
        userId: new Types.ObjectId(userId),
        targetId: new Types.ObjectId(dto.targetId),
        type: dto.type,
        content: dto.content || '',
        collection: dto.collection || 'default',
        note: dto.note || '',
      });

      if (dto.type === 'post') {
        await this.trackRecommendationInteraction(userId, dto.targetId);
      }

      return saved;
    } catch (error) {
      if (error.code === 11000) {
        throw new ConflictException('Bạn đã lưu mục này rồi');
      }
      throw error;
    }
  }

  // Bỏ lưu
  async unsave(userId: string, savedId: string): Promise<{ message: string }> {
    const result = await this.saveModel.deleteOne({
      _id: new Types.ObjectId(savedId),
      userId: new Types.ObjectId(userId),
    });

    if (result.deletedCount === 0) {
      throw new NotFoundException('Không tìm thấy mục đã lưu');
    }

    return { message: 'Đã bỏ lưu thành công' };
  }

  // Lấy danh sách bài đã lưu của user
  async getSavedByUser(
    userId: string,
    type?: string,
    collection?: string,
    page: number = 1,
    limit: number = 20,
  ): Promise<{ data: SaveDocument[]; total: number; page: number; limit: number }> {
    const filter: any = { userId: new Types.ObjectId(userId) };

    if (type) {
      filter.type = type;
    }

    if (collection) {
      filter.collection = collection;
    }

    const [data, total] = await Promise.all([
      this.saveModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      this.saveModel.countDocuments(filter),
    ]);

    // Populate động thông tin tác giả và cập nhật content
    const populatedData = await Promise.all(
      data.map(async (item) => {
        const itemObj = item as any;
        try {
          if (itemObj.type === 'post') {
            const [postResult] = await this.eventEmitter.emitAsync(
              AppEvents.POST_GET_DETAIL,
              { postId: itemObj.targetId.toString(), userId: userId },
            );
            if (postResult && postResult.userId) {
              itemObj.authorId = postResult.userId.userId;
              itemObj.authorName = postResult.userId.fullName;
              itemObj.authorAvatar = postResult.userId.avatarUrl;
              
              if (postResult.urls && postResult.urls.length > 0 && typeof postResult.urls[0] === 'object') {
                itemObj.content = postResult.urls[0].url;
              } else if (postResult.caption) {
                itemObj.content = postResult.caption;
              }
            }
          } else if (itemObj.type === 'comment') {
            const [commentResult] = await this.eventEmitter.emitAsync(
              AppEvents.ADMIN_COMMENT_GET_BY_ID,
              { commentId: itemObj.targetId.toString() },
            );
            if (commentResult && commentResult.userId) {
              itemObj.authorId = commentResult.userId._id?.toString() || commentResult.userId.userId;
              itemObj.authorName = commentResult.userId.fullName;
              itemObj.authorAvatar = commentResult.userId.avatarUrl;
              itemObj.content = commentResult.content;
            }
          } else if (itemObj.type === 'reel') {
            const [reelResult] = await this.eventEmitter.emitAsync(
              AppEvents.STORY_GET,
              { storyId: itemObj.targetId.toString() },
            );
            if (reelResult && reelResult.userId) {
               itemObj.authorId = reelResult.userId._id?.toString() || reelResult.userId.userId;
               itemObj.authorName = reelResult.userId.fullName;
               itemObj.authorAvatar = reelResult.userId.avatarUrl;
               if (reelResult.url) {
                 itemObj.content = reelResult.url;
               }
            }
          }
        } catch (e) {
          // Bỏ qua lỗi (ví dụ item đã bị xoá hoặc comment bị xoá ko fetch được)
        }
        return itemObj;
      }),
    );

    return { data: populatedData as SaveDocument[], total, page, limit };
  }

  // Kiểm tra user đã lưu mục này chưa
  async isSaved(userId: string, targetId: string, type: string): Promise<boolean> {
    const exists = await this.saveModel.exists({
      userId: new Types.ObjectId(userId),
      targetId: new Types.ObjectId(targetId),
      type,
    });
    return !!exists;
  }

  // Đếm số lượt lưu của 1 target
  async countSaves(targetId: string, type: string): Promise<number> {
    return this.saveModel.countDocuments({
      targetId: new Types.ObjectId(targetId),
      type,
    });
  }

  private async trackRecommendationInteraction(userId: string, postId: string): Promise<void> {
    try {
      await this.recommendationInteractionService.trackInteraction(
        userId,
        postId,
        PostInteractionType.SAVE,
      );
    } catch (error) {
      this.logger.warn(`Không thể ghi nhận recommendation interaction cho save post: ${error.message}`);
    }
  }
}
