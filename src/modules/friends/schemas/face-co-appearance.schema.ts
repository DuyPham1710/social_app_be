import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type FaceCoAppearanceDocument = FaceCoAppearance & Document;

/**
 * Lưu trữ dữ liệu 2 user cùng xuất hiện trong một bức ảnh post.
 * user_a luôn là ObjectId nhỏ hơn user_b để tránh duplicate (A,B) vs (B,A).
 */
@Schema({ timestamps: true })
export class FaceCoAppearance {
  /** User có ObjectId nhỏ hơn trong cặp */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user_a: Types.ObjectId;

  /** User có ObjectId lớn hơn trong cặp */
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  user_b: Types.ObjectId;

  /** Danh sách postId mà cặp này cùng xuất hiện */
  @Prop({ type: [{ type: Types.ObjectId, ref: 'Post' }], default: [] })
  post_ids: Types.ObjectId[];

  /** Số lần cùng xuất hiện (= post_ids.length) — để query nhanh */
  @Prop({ type: Number, default: 1 })
  count: number;

  /** Lần cuối cùng được cập nhật */
  @Prop({ type: Date, default: Date.now })
  last_seen_at: Date;
}

export const FaceCoAppearanceSchema = SchemaFactory.createForClass(FaceCoAppearance);

// Unique index — mỗi cặp (user_a, user_b) chỉ có 1 document
FaceCoAppearanceSchema.index({ user_a: 1, user_b: 1 }, { unique: true });

// Index để tra cứu nhanh co-appearance của 1 user
FaceCoAppearanceSchema.index({ user_a: 1, count: -1 });
FaceCoAppearanceSchema.index({ user_b: 1, count: -1 });
