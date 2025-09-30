import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateNested } from "class-validator";
import { CreatePostUrlDto } from "./create-post.dto";
import { Type } from "class-transformer";

class UpdatePostUrlDto {
    @ApiProperty({ example: 'https://example.com/image.jpg' })
    @IsOptional()
    @IsString()
    url?: string;

    @ApiProperty({ example: 'Image title', required: false })
    @IsOptional()
    @IsString()
    title?: string;

    @ApiProperty({ example: 0, required: false })
    @IsOptional()
    @IsInt()
    @Min(0)
    order?: number;
}

export class UpdatePostDto {
    @ApiProperty({ example: '1' })
    @IsNotEmpty()
    @IsString()
    postId: string;

    @ApiProperty({ example: 'This is a post caption', required: false })
    @IsOptional()
    @IsString()
    caption?: string;

    @ApiProperty({
        type: [UpdatePostUrlDto],
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
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UpdatePostUrlDto)
    urls?: UpdatePostUrlDto[];
}