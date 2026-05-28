import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OnEvent } from '@nestjs/event-emitter';
import { AppEvents } from 'src/shared/enums/app-events.enum';
import {
  FaceCoAppearance,
  FaceCoAppearanceDocument,
} from './schemas/face-co-appearance.schema';

const MIN_CONFIDENCE = 0.6;

@Injectable()
export class FaceCoAppearanceService {
  private readonly logger = new Logger(FaceCoAppearanceService.name);

  constructor(
    @InjectModel(FaceCoAppearance.name)
    private readonly coAppearanceModel: Model<FaceCoAppearanceDocument>,
  ) { }

  /**
   * Lắng nghe event từ FaceRecognitionListener.
   * Ghi nhận tất cả cặp user xuất hiện chung trong ảnh post.
   */
  @OnEvent(AppEvents.FACE_CO_APPEARANCE_RECORD)
  async handleRecord(payload: {
    postId: string;
    userIds: string[];          // poster + matched users (đã qua privacy check)
    confidences: Record<string, number>; // userId → confidence (poster = 1.0)
  }) {
    try {
      const { postId, userIds, confidences } = payload;

      // Lọc chỉ giữ user có confidence >= ngưỡng (poster luôn = 1.0)
      const qualifiedUserIds = userIds.filter(
        (uid) => (confidences[uid] ?? 1.0) >= MIN_CONFIDENCE,
      );

      // Cần ít nhất 2 user để tạo cặp
      if (qualifiedUserIds.length < 2) return;

      const postObjId = new Types.ObjectId(postId);

      // Tạo tất cả cặp (n*(n-1)/2) từ danh sách user
      const pairs: Array<{ userA: Types.ObjectId; userB: Types.ObjectId }> = [];
      for (let i = 0; i < qualifiedUserIds.length; i++) {
        for (let j = i + 1; j < qualifiedUserIds.length; j++) {
          const idA = new Types.ObjectId(qualifiedUserIds[i]);
          const idB = new Types.ObjectId(qualifiedUserIds[j]);

          // Đảm bảo user_a luôn < user_b để tránh duplicate
          const [userA, userB] = idA.toString() < idB.toString()
            ? [idA, idB]
            : [idB, idA];

          pairs.push({ userA, userB });
        }
      }

      // Upsert từng cặp — thêm postId vào post_ids, tăng count
      await Promise.all(
        pairs.map(({ userA, userB }) =>
          this.coAppearanceModel.findOneAndUpdate(
            { user_a: userA, user_b: userB },
            {
              $addToSet: { post_ids: postObjId },
              $set: { last_seen_at: new Date() },
              $setOnInsert: { count: 1 },     // chỉ chạy khi upsert, khởi tạo count = 1
            },
            { upsert: true, new: true },
          ).then(async (doc) => {
            // Sau khi upsert, đồng bộ count = post_ids.length
            await this.coAppearanceModel.findByIdAndUpdate(doc._id, {
              $set: { count: doc.post_ids.length },
            });
          }),
        ),
      );

      this.logger.log(
        `Recorded ${pairs.length} co-appearance pair(s) for post ${postId}`,
      );
    } catch (error) {
      this.logger.error(`Failed to record co-appearance: ${error.message}`);
      // Fail silently — không ảnh hưởng user flow
    }
  }

  /**
   * Tra cứu số lần đồng xuất hiện giữa userId và tất cả user khác.
   * Trả về Map<targetUserId, coAppearanceCount> để getFriendSuggestions dùng.
   */
  async getCoAppearanceScores(userId: string): Promise<Map<string, number>> {
    const userObjId = new Types.ObjectId(userId);

    const records = await this.coAppearanceModel
      .find({
        $or: [{ user_a: userObjId }, { user_b: userObjId }],
        count: { $gt: 0 },
      })
      .select('user_a user_b count')
      .lean();

    const scoreMap = new Map<string, number>();
    for (const record of records) {
      const targetId =
        record.user_a.toString() === userId
          ? record.user_b.toString()
          : record.user_a.toString();
      scoreMap.set(targetId, record.count);
    }

    return scoreMap;
  }
}
