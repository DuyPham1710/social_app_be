import { ApiProperty } from "@nestjs/swagger";
import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString } from "class-validator";
import { LayoutType } from "src/shared/enums/layout_type";
import { PrivacyType } from "src/shared/enums/privacy_type";
import { File } from "multer";
import { Transform } from "class-transformer";

// export class CreatePostUrlDto {
//     @ApiProperty({ example: 'https://example.com/image.jpg' })
//     @IsNotEmpty()
//     @IsString()
//     url: string;

//     @ApiProperty({ example: 'Image title', required: false })
//     @IsOptional()
//     @IsString()
//     title?: string;

//     @ApiProperty({ example: 0, required: false })
//     @IsOptional()
//     order?: number;
// }

export class CreatePostDto {
    @ApiProperty({ example: 'This is a post caption', required: false })
    @IsOptional()
    @IsString()
    caption?: string;

    @ApiProperty({ example: 'Hanoi, Vietnam', required: false })
    @IsOptional()
    @IsString()
    location?: string;

    // @ApiProperty({
    //     type: [CreatePostUrlDto],
    //     example: [
    //         {
    //             url: 'https://example.com/image1.jpg',
    //             title: 'First image',
    //             order: 0
    //         },
    //         {
    //             url: 'https://example.com/image2.jpg',
    //             title: 'Second image',
    //             order: 1
    //         }
    //     ]
    // })
    // @IsNotEmpty()
    // @IsArray()
    // urls: CreatePostUrlDto[];
    @ApiProperty({
        type: 'string',
        format: 'binary',
        isArray: true,
        required: true,
    })
    @IsOptional()
    files?: File[];

    @ApiProperty({
        type: [String],
        example: ['Ảnh 1', 'Ảnh 2'],
        required: false,
    })
    @IsOptional()
    @Transform(({ value }) => {
        if (!value) return [];

        if (Array.isArray(value)) return value; // nếu form-data tự tách rồi thì giữ nguyên

        try {
            // nếu người dùng nhập JSON hợp lệ
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed;
        } catch {
            // nếu là chuỗi cách nhau bằng dấu phẩy
            if (typeof value === 'string') {
                return value.split(',').map((v) => v.trim());
            }
        }

        // fallback cuối cùng
        return [String(value)];
    })
    @IsArray()
    titles?: string[];

    @ApiProperty({
        type: [Number],
        example: [0, 1],
        required: false,
    })
    @IsOptional()
    @Transform(({ value }) => {
        if (!value) return [];

        if (Array.isArray(value)) return value.map((v) => Number(v));

        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed.map((v) => Number(v));
        } catch {
            if (typeof value === 'string') {
                return value.split(',').map((v) => Number(v.trim()));
            }
        }

        return [Number(value)];
    })
    @IsArray()
    orders?: number[];

    @IsOptional()
    @IsEnum(LayoutType)
    @ApiProperty({ example: LayoutType.CLASSIC, required: false })
    layout?: LayoutType;

    @IsOptional()
    @IsEnum(PrivacyType)
    @ApiProperty({ example: PrivacyType.PUBLIC, required: false })
    privacy_type?: PrivacyType;

    @IsOptional()
    @Transform(({ value }) => {
        if (!value) return undefined;
        if (Array.isArray(value)) return value; 
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed;
        } catch {
            if (typeof value === 'string') {
                return value.split(',').map((v) => v.trim());
            }
        }
        return [String(value)];
    })
    @ApiProperty({ example: ['1', '2', '3'], required: false })
    friends_except?: string[];

    @IsOptional()
    @Transform(({ value }) => {
        if (!value) return undefined;
        if (Array.isArray(value)) return value; 
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed;
        } catch {
            if (typeof value === 'string') {
                return value.split(',').map((v) => v.trim());
            }
        }
        return [String(value)];
    })
    @ApiProperty({ example: ['1', '2', '3'], required: false })
    friends_detail?: string[];

    @ApiProperty({ description: 'ID cộng đồng (nếu đăng bài vào cộng đồng)', required: false })
    @IsOptional()
    @IsString()
    communityId?: string;

    @IsOptional()
    @Transform(({ value }) => {
        if (!value) return undefined;
        if (Array.isArray(value)) return value; 
        try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) return parsed;
        } catch {
            if (typeof value === 'string') {
                return value.split(',').map((v) => v.trim());
            }
        }
        return [String(value)];
    })
    @ApiProperty({ example: ['1', '2', '3'], required: false })
    taggedUserIds?: string[];
}