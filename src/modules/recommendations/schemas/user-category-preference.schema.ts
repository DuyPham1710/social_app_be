import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PostCategory } from 'src/common/enums/post-category.enum';

export type UserCategoryPreferenceDocument = UserCategoryPreference & Document;

@Schema({ timestamps: true })
export class UserCategoryPreference {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(PostCategory),
    required: true,
  })
  category: PostCategory;

  @Prop({ type: Number, default: 0 })
  score: number;

  @Prop({ type: Number, default: 0 })
  reactCount: number;

  @Prop({ type: Number, default: 0 })
  commentCount: number;

  @Prop({ type: Number, default: 0 })
  saveCount: number;

  @Prop({ type: Number, default: 0 })
  shareCount: number;

  @Prop({ type: Number, default: 0 })
  viewCount: number;

  @Prop({ type: Number, default: 0 })
  videoWatchCount: number;

  @Prop({ type: Number, default: 0 })
  hideCount: number;

  @Prop({ type: Date, default: Date.now })
  lastInteractedAt: Date;
}

export const UserCategoryPreferenceSchema = SchemaFactory.createForClass(
  UserCategoryPreference,
);

UserCategoryPreferenceSchema.index(
  { userId: 1, category: 1 },
  { unique: true },
);
UserCategoryPreferenceSchema.index({ userId: 1, score: -1 });
UserCategoryPreferenceSchema.index({ userId: 1, lastInteractedAt: -1 });
