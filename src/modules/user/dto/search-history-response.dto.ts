import { Expose, Type } from 'class-transformer';
import { Types } from 'mongoose';
import UserResponseDto from './user.response.dto';

export class SearchHistoryResponseDto {
    @Expose()
    _id: Types.ObjectId;

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

