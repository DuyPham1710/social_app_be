import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type SearchHistoryDocument = SearchHistory & Document;

@Schema({ timestamps: true, collection: 'search_histories' })
export class SearchHistory {
    _id: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
    userId: Types.ObjectId;

    @Prop({ type: String, required: false, trim: true })
    query?: string;

    @Prop({ type: Number, default: 0 })
    resultCount?: number;

    @Prop({ type: Types.ObjectId, ref: 'User', required: false, index: true })
    viewedUserId?: Types.ObjectId;
}

export const SearchHistorySchema = SchemaFactory.createForClass(SearchHistory);

// Tạo index compound để tối ưu query
SearchHistorySchema.index({ userId: 1, createdAt: -1 });

