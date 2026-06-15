import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type UserReportDocument = UserReport & Document;

@Schema({ timestamps: true, collection: 'user_reports' })
export class UserReport {
  _id: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  reportedUserId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  reporterId: Types.ObjectId;

  @Prop({ type: String, required: true, trim: true })
  reason: string;

  @Prop({ type: String, required: false, trim: true })
  description?: string;

  @Prop({
    type: String,
    enum: ['pending', 'reviewed', 'rejected'],
    default: 'pending',
  })
  status: string;
}

export const UserReportSchema = SchemaFactory.createForClass(UserReport);

UserReportSchema.index({ reportedUserId: 1, reporterId: 1 }, { unique: true });
