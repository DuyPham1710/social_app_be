import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';
import { PrivacyType } from 'src/shared/enums/privacy_type';

export class UpdateDefaultPrivacyDto {
    @ApiProperty({
        description: 'Default privacy setting',
        enum: PrivacyType,
        example: PrivacyType.PUBLIC,
    })
    @IsNotEmpty()
    @IsEnum(PrivacyType)
    defaultPrivacy: PrivacyType;

    @ApiPropertyOptional({
        description: 'List of friend IDs to exclude (required if defaultPrivacy is friends_except)',
        example: ['68af2546e5af803fed30af6c', '68af4aca968b17834dab17c1'],
        type: [String],
    })
    @ValidateIf((o) => o.defaultPrivacy === PrivacyType.FRIENDS_EXCEPT)
    @IsNotEmpty({ message: 'friends_except is required when defaultPrivacy is friends_except' })
    @IsArray()
    @IsString({ each: true })
    friends_except?: string[];

    @ApiPropertyOptional({
        description: 'List of friend IDs with detail access (required if defaultPrivacy is friends_detail)',
        example: ['68af2546e5af803fed30af6c', '68af4aca968b17834dab17c1'],
        type: [String],
    })
    @ValidateIf((o) => o.defaultPrivacy === PrivacyType.FRIENDS_DETAIL)
    @IsNotEmpty({ message: 'friends_detail is required when defaultPrivacy is friends_detail' })
    @IsArray()
    @IsString({ each: true })
    friends_detail?: string[];
}

