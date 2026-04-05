import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import * as FormData from 'form-data';
import * as fs from 'fs';
import * as path from 'path';
import { File } from 'multer';

export interface ModerationResult {
    is_safe: boolean;
    confidence: number;
    categories: Record<string, number>;
    filename: string;
}

export interface VideoModerationResult {
    is_safe: boolean;
    duration?: number;
    total_frames_analyzed?: number;
    violation_segments?: { start: number; end: number; categories: string[] }[];
    has_blurred_video: boolean;
    blurred_video_path?: string; // Đường dẫn tới video đã blur (nếu có)
    block_completely?: boolean; // True nếu video vi phạm quá 90% -> cấm upload
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

    /**
     * Kiểm tra video có vi phạm tiêu chuẩn cộng đồng không.
     * Nếu có vi phạm, trả về video đã được blur các đoạn vi phạm.
     */
    async checkVideo(file: File): Promise<VideoModerationResult> {
        const formData = new FormData();
        formData.append('file', fs.createReadStream(file.path), {
            filename: file.originalname,
            contentType: file.mimetype,
        });

        try {
            const response = await this.httpService.axiosRef.post(
                `${this.aiServiceUrl}/video-moderation/check`,
                formData,
                {
                    headers: formData.getHeaders(),
                    timeout: 180000, // 3 phút timeout (video xử lý lâu hơn ảnh)
                    responseType: 'arraybuffer', // Nhận binary data (video đã blur)
                    validateStatus: (status) => status < 500,
                },
            );

            // Kiểm tra header để biết video có bị vi phạm không
            // const isSafeHeader = response.headers['x-is-safe'];
            const contentType = response.headers['content-type'];

            // Nếu response là JSON → video an toàn HOẶC bị block hoàn toàn
            if (contentType?.includes('application/json')) {
                const jsonData = JSON.parse(Buffer.from(response.data).toString('utf-8'));
                return {
                    is_safe: jsonData.is_safe,
                    duration: jsonData.duration,
                    total_frames_analyzed: jsonData.total_frames_analyzed,
                    violation_segments: jsonData.violation_segments,
                    has_blurred_video: false,
                    block_completely: jsonData.block_completely || false,
                    filename: file.originalname,
                };
            }

            // Nếu response là video → video đã được blur
            const blurredDir = path.join(process.cwd(), 'temp_blurred');
            if (!fs.existsSync(blurredDir)) {
                fs.mkdirSync(blurredDir, { recursive: true });
            }

            const blurredPath = path.join(blurredDir, `blurred_${Date.now()}_${file.originalname}`);
            fs.writeFileSync(blurredPath, Buffer.from(response.data));

            this.logger.warn(
                `Video "${file.originalname}" vi phạm! Đã blur → ${blurredPath}`,
            );

            return {
                is_safe: false,
                duration: parseFloat(response.headers['x-duration'] || '0'),
                total_frames_analyzed: parseInt(response.headers['x-frames-analyzed'] || '0'),
                has_blurred_video: true,
                blurred_video_path: blurredPath,
                filename: file.originalname,
            };

        } catch (error) {
            this.logger.error(`Lỗi khi kiểm tra video "${file.originalname}": ${error.message}`);
            // Fail-open: cho phép upload nếu AI service lỗi
            return {
                is_safe: true,
                has_blurred_video: false,
                filename: file.originalname,
            };
        }
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
