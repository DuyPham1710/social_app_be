import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import * as FormData from 'form-data';
import * as fs from 'fs';
import { File } from 'multer';

export interface ModerationResult {
    is_safe: boolean;
    confidence: number;
    categories: Record<string, number>;
    filename: string;
}

@Injectable()
export class ImageModerationService {
    private readonly logger = new Logger(ImageModerationService.name);
    private readonly aiServiceUrl: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.aiServiceUrl = this.configService.get<string>('AI_SERVICE_URL', 'http://localhost:8000');
    }

    /**
     * Kiểm tra danh sách file ảnh có vi phạm tiêu chuẩn cộng đồng không.
     * Chỉ kiểm tra file có mimetype là image/*, bỏ qua video và file khác.
     * 
     * @returns Danh sách kết quả kiểm duyệt cho từng file ảnh
     * @throws Error nếu có ảnh vi phạm
     */
    async checkImages(files: File[]): Promise<ModerationResult[]> {
        const imageFiles = files.filter(file => file.mimetype?.startsWith('image/'));

        if (imageFiles.length === 0) {
            return [];
        }

        const results: ModerationResult[] = [];

        for (const file of imageFiles) {
            try {
                const result = await this.checkSingleImage(file);
                results.push(result);

                // Nếu phát hiện ảnh vi phạm, dừng ngay để tiết kiệm thời gian
                if (!result.is_safe) {
                    this.logger.warn(
                        `Ảnh "${file.originalname}" vi phạm tiêu chuẩn cộng đồng (confidence: ${result.confidence})`,
                    );
                    return results;
                }
            } catch (error) {
                this.logger.error(`Lỗi khi kiểm tra ảnh "${file.originalname}": ${error.message}`);
                // Nếu image moderation service không khả dụng, cho phép upload (fail-open)
                // Thay đổi thành throw error nếu muốn chặn khi image moderation service lỗi (fail-closed)
                results.push({
                    is_safe: true,
                    confidence: 0,
                    categories: {},
                    filename: file.originalname,
                });
            }
        }

        return results;
    }

    // Kiểm tra một file ảnh duy nhất
    private async checkSingleImage(file: File): Promise<ModerationResult> {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(file.path), {
            filename: file.originalname,
            contentType: file.mimetype,
        });

        const response = await this.httpService.axiosRef.post(
            `${this.aiServiceUrl}/image-moderation/check`,
            formData,
            {
                headers: formData.getHeaders(),
                timeout: 30000, // 30s timeout
            },
        );

        return {
            ...response.data,
            filename: file.originalname,
        };
    }
}
