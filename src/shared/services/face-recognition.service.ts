import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';

export interface EnrollResult {
    success: boolean;
    faces_detected: number;
    message: string;
    point_id?: string;
    confidence?: number;
}

export interface MatchedUser {
    user_id: string;
    confidence: number;
}

export interface ImageSearchResult {
    image_index: number;
    faces_detected: number;
    matched_users: MatchedUser[];
    unmatched_faces: number;
}

export interface SearchResult {
    results: ImageSearchResult[];
}

export interface RegisterFaceResult {
    success: boolean;
    message: string;
    embeddings_saved?: number;
    point_ids?: string[];
    failed_pose?: string;
    similarity?: number;
    matched_user_id?: string;
}

@Injectable()
export class FaceRecognitionService {
    private readonly logger = new Logger(FaceRecognitionService.name);
    private readonly aiServiceUrl: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.aiServiceUrl = this.configService.get<string>('AI_SERVICE_URL', 'http://localhost:8000');
    }

    /**
     * Enroll face từ avatar hoặc selfie.
     * Gọi AI service để detect face + lưu embedding vào Qdrant.
     */
    async enrollFace(userId: string, imageUrl: string, source: 'avatar' | 'selfie'): Promise<EnrollResult> {
        try {
            const response = await this.httpService.axiosRef.post(
                `${this.aiServiceUrl}/face-recognition/enroll`,
                { user_id: userId, image_url: imageUrl, source },
                { timeout: 60000 },
            );
            this.logger.log(
                `Face enroll for user ${userId} (${source}): ${response.data.message}`,
            );
            return response.data;
        } catch (error) {
            this.logger.error(`Face enroll failed for user ${userId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Search faces trong danh sách ảnh post.
     * Gọi AI service để detect faces + search Qdrant.
     */
    async searchFaces(imageUrls: string[]): Promise<SearchResult> {
        try {
            const response = await this.httpService.axiosRef.post(
                `${this.aiServiceUrl}/face-recognition/search`,
                { image_urls: imageUrls },
                { timeout: 60000 }, // 60s timeout cho nhiều ảnh
            );
            return response.data;
        } catch (error) {
            this.logger.error(`Face search failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Đăng ký khuôn mặt (5 góc) khi tạo tài khoản hoặc quét lại.
     * Gửi 5 ảnh base64 trực tiếp cho AI service → extract embeddings → lưu Qdrant.
     */
    async registerFace(userId: string, images: string[]): Promise<RegisterFaceResult> {
        try {
            const response = await this.httpService.axiosRef.post(
                `${this.aiServiceUrl}/face-recognition/register`,
                {
                    user_id: userId,
                    images,
                    poses: ['center', 'up', 'down', 'left', 'right'],
                },
                { timeout: 120000 }, // 120s timeout — 5 ảnh cần xử lý lâu hơn
            );
            this.logger.log(
                `Face registration for user ${userId}: ${response.data.message}`,
            );
            return response.data;
        } catch (error) {
            this.logger.error(`Face registration failed for user ${userId}: ${error.message}`);
            throw error;
        }
    }

    /**
     * Xóa toàn bộ dữ liệu khuôn mặt của user khỏi hệ thống AI (Qdrant).
     */
    async deleteFace(userId: string): Promise<boolean> {
        try {
            const response = await this.httpService.axiosRef.delete(
                `${this.aiServiceUrl}/face-recognition/user/${userId}`,
                { timeout: 30000 },
            );
            this.logger.log(
                `Face deletion for user ${userId}: ${JSON.stringify(response.data)}`,
            );
            return true;
        } catch (error) {
            this.logger.error(`Face deletion failed for user ${userId}: ${error.message}`);
            throw error;
        }
    }
}
