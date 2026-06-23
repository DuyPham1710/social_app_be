import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type CommunityRoadmapPointDocument = CommunityRoadmapPoint & Document;

@Schema({ timestamps: true })
export class CommunityRoadmapPoint {
    _id: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Community', required: true })
    communityId: Types.ObjectId;

    @Prop({ type: String, required: true })
    locationName: string;

    @Prop({
        type: {
            type: String,
            enum: ['Point'],
            required: true,
            default: 'Point',
        },
        coordinates: {
            type: [Number], // [longitude, latitude]
            required: true,
        },
    })
    locationCoordinates: {
        type: string;
        coordinates: number[];
    };

    @Prop({ type: Number, default: 1 })
    postCount: number;

    @Prop({ type: [{ type: Types.ObjectId, ref: 'Post' }], default: [] })
    postIds: Types.ObjectId[];

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    firstPostedBy: Types.ObjectId;

    @Prop({ type: Date, required: true })
    firstPostedAt: Date;

    @Prop({ type: Date, required: true })
    lastPostedAt: Date;

    @Prop({ type: String, default: null })
    thumbnailUrl?: string;
}

export const CommunityRoadmapPointSchema = SchemaFactory.createForClass(CommunityRoadmapPoint);

CommunityRoadmapPointSchema.index({ communityId: 1 });
CommunityRoadmapPointSchema.index({ locationCoordinates: '2dsphere' });
