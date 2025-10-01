import { IsEnum, IsOptional, IsArray } from 'class-validator';
import { PrivacyType } from 'src/shared/enums/privacy_type';
import { Types } from 'mongoose';
import { ApiProperty } from '@nestjs/swagger';

export class UpdatePrivacyDto {
    @ApiProperty({ example: PrivacyType.PUBLIC, enum: PrivacyType })
    @IsEnum(PrivacyType)
    privacy_type: PrivacyType;

    @ApiProperty({ example: ['123', '456'] })
    @IsOptional()
    @IsArray()
    friends_except?: Types.ObjectId[];

    @ApiProperty({ example: ['123', '456'] })
    @IsOptional()
    @IsArray()
    friends_detail?: Types.ObjectId[];
}
