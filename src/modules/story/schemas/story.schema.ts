import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { PrivacyBase } from 'src/common/base/privacy.base';
import { PrivacyType } from 'src/shared/enums/privacy_type';
import { DeezerMusic } from 'src/shared/interfaces/deezer-music.interface';

export type StoryDocument = Story & Document;

@Schema({ timestamps: true }) // createdAt, updatedAt
export class Story extends PrivacyBase {
    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    userId: Types.ObjectId;

    @Prop({ type: String })
    title?: string;

    @Prop({ type: String })
    mediaUrl?: string;

    @Prop({ enum: ['image', 'video', 'text'], default: 'text' })
    mediaType: string;

    @Prop({ type: Object })
    music?: DeezerMusic;

    // Thời gian hết hạn (mặc định 24h kể từ createdAt)
    @Prop({ type: Date, default: new Date(Date.now() + 24 * 60 * 60 * 1000) })
    expireAt: Date;
}

export const StorySchema = SchemaFactory.createForClass(Story);

// Index tự động xóa story khi hết hạn
StorySchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });
