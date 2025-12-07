import { Expose, Transform, Type } from 'class-transformer';
import { Types } from 'mongoose';
import UserResponseDto from './user.response.dto';

export class SearchHistoryResponseDto {
    @Expose()
    @Transform(({ obj }) => {
        // Convert ObjectId to string
        if (obj._id) {
            return typeof obj._id === 'string' ? obj._id : obj._id.toString();
        }
        return obj._id;
    })
    _id: string;

    @Expose()
    query?: string;

    @Expose()
    resultCount?: number;

    @Expose()
    @Type(() => UserResponseDto)
    viewedUser?: UserResponseDto;

    @Expose()
    createdAt: Date;

    @Expose()
    updatedAt: Date;
}

