import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PostViewSource } from 'src/common/enums/post-view-source.enum';

export type UserPostViewDocument = UserPostView & Document;

const postViewTtlDays = Number(process.env.POST_VIEW_TTL_DAYS ?? 14);
const postViewTtlSeconds =
  Number.isFinite(postViewTtlDays) && postViewTtlDays > 0
    ? postViewTtlDays * 24 * 60 * 60
    : 14 * 24 * 60 * 60;

@Schema({ timestamps: true })
export class UserPostView {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Post', required: true })
  postId: Types.ObjectId;

  @Prop({ type: Date, default: Date.now })
  viewedAt: Date;

  @Prop({
    type: String,
    enum: Object.values(PostViewSource),
    default: PostViewSource.RECOMMENDATION,
  })
  source: PostViewSource;
}

export const UserPostViewSchema = SchemaFactory.createForClass(UserPostView);

UserPostViewSchema.index({ userId: 1, postId: 1 }, { unique: true });
UserPostViewSchema.index(
  { viewedAt: 1 },
  { expireAfterSeconds: postViewTtlSeconds },
);
