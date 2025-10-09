import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { LayoutType } from "src/shared/enums/layout_type";
import { PrivacyType } from "src/shared/enums/privacy_type";

export class CreatePostUrlDto {
    @ApiProperty({ example: 'https://example.com/image.jpg' })
    @IsNotEmpty()
    @IsString()
    url: string;

    @ApiProperty({ example: 'Image title', required: false })
    @IsOptional()
    @IsString()
    title?: string;

    @ApiProperty({ example: 0, required: false })
    @IsOptional()
    order?: number;
}

export class CreatePostDto {
    @ApiProperty({ example: 'This is a post caption', required: false })
    @IsOptional()
    @IsString()
    caption?: string;

    @ApiProperty({
        type: [CreatePostUrlDto],
        example: [
            {
                url: 'https://example.com/image1.jpg',
                title: 'First image',
                order: 0
            },
            {
                url: 'https://example.com/image2.jpg',
                title: 'Second image',
                order: 1
            }
        ]
    })
    @IsNotEmpty()
    @IsArray()
    urls: CreatePostUrlDto[];

    @IsOptional()
    @IsEnum(LayoutType)
    @ApiProperty({ example: LayoutType.CLASSIC, required: false })
    layout?: LayoutType;

    @IsOptional()
    @IsEnum(PrivacyType)
    @ApiProperty({ example: PrivacyType.PUBLIC, required: false })
    privacy_type?: PrivacyType;

    @IsOptional()
    @ApiProperty({ example: ['1', '2', '3'], required: false })
    friends_except?: string[];

    @IsOptional()
    @ApiProperty({ example: ['1', '2', '3'], required: false })
    friends_detail?: string[];
}