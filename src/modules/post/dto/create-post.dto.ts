import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsNotEmpty, IsOptional, IsString } from "class-validator";

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

    // privacy default is public
    // @ApiProperty({ example: 'public', required: false })
    // @IsOptional()
    // @IsString()
    // privacy?: string;
}