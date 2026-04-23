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
}
