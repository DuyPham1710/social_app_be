import { Types } from 'mongoose';

export interface PostUrlResponseDto {
    _id: Types.ObjectId;
    url: string;
    title: string;
    order: number;
    createdAt: Date;
    updatedAt: Date;
}