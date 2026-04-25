import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { AppEvents } from '../enums/app-events.enum';
import { FaceRecognitionService } from '../services/face-recognition.service';

@Injectable()
export class FaceRecognitionListener {
    private readonly logger = new Logger(FaceRecognitionListener.name);

    constructor(
        private readonly faceRecognitionService: FaceRecognitionService,
        private readonly eventEmitter: EventEmitter2,
    ) { }

    /**
     * Khi user đổi avatar hoặc enroll selfie → gọi AI service để lưu face embedding.
     */
    @OnEvent(AppEvents.FACE_ENROLL)
    async handleEnrollFace(payload: { userId: string; imageUrl: string; source: 'avatar' | 'selfie' }) {
        try {
            this.logger.log(`Enrolling face for user ${payload.userId} (source: ${payload.source})`);
            const result = await this.faceRecognitionService.enrollFace(
                payload.userId,
                payload.imageUrl,
                payload.source,
            );
            if (result.success) {
                this.logger.log(`Face enrolled successfully for user ${payload.userId} (confidence: ${result.confidence})`);
            } else {
                this.logger.log(`No face detected in image for user ${payload.userId} — skipped`);
            }
        } catch (error) {
            this.logger.error(`Face enroll failed for user ${payload.userId}: ${error.message}`);
            // Fail silently — không ảnh hưởng user flow
        }
    }

    /**
     * Khi user đăng post có ảnh → detect faces + search Qdrant.
     * Nếu ảnh chỉ có 1 face và không match ai → auto enroll selfie.
     * Nếu có matched users (trừ poster) → gửi notification.
     */
    @OnEvent(AppEvents.FACE_SEARCH_IN_POST)
    async handleSearchInPost(payload: { postId: string; posterId: string; imageUrls: string[] }) {
        try {
            this.logger.log(`Searching faces in post ${payload.postId} (${payload.imageUrls.length} images)`);
            const result = await this.faceRecognitionService.searchFaces(payload.imageUrls);

            // Collect tất cả matched users từ mọi ảnh (deduplicate)
            const allMatchedMap = new Map<string, number>(); // userId → best confidence

            for (const r of result.results) {
                // Ảnh chỉ có 1 face → có thể là selfie → thử enroll
                // Case 1: 1 face + không match ai (user chưa có trong vector DB)
                // Case 2: 1 face + match chính poster (thêm góc mặt mới)
                const isSingleFace = r.faces_detected === 1;
                const isUnmatched = r.matched_users.length === 0;
                const isMatchedSelf = r.matched_users.length === 1
                    && r.matched_users[0].user_id === payload.posterId;

                if (isSingleFace && (isUnmatched || isMatchedSelf)) {
                    const imageUrl = payload.imageUrls[r.image_index];
                    this.logger.log(`Auto-enrolling selfie for user ${payload.posterId} from post image`);
                    try {
                        await this.faceRecognitionService.enrollFace(
                            payload.posterId,
                            imageUrl,
                            'selfie',
                        );
                    } catch (enrollError) {
                        this.logger.error(`Selfie auto-enroll failed: ${enrollError.message}`);
                    }
                }

                // Collect matched users (deduplicate, giữ confidence cao nhất)
                for (const m of r.matched_users) {
                    const existing = allMatchedMap.get(m.user_id);
                    if (!existing || m.confidence > existing) {
                        allMatchedMap.set(m.user_id, m.confidence);
                    }
                }
            }

            // Lọc bỏ poster (không gửi thông báo cho chính mình)
            const usersToNotify = Array.from(allMatchedMap.entries())
                .filter(([userId]) => userId !== payload.posterId);

            // Gửi notification cho từng user qua EventEmitter
            for (const [userId, confidence] of usersToNotify) {
                this.logger.log(
                    `Notifying user ${userId} (confidence: ${(confidence * 100).toFixed(1)}%) about post ${payload.postId}`,
                );
                this.eventEmitter.emit(AppEvents.FACE_DETECTED_IN_POST, {
                    receiver: userId,
                    sender: payload.posterId,
                    postId: payload.postId,
                });
            }

            // Tổng kết
            this.logger.log(
                `Post ${payload.postId}: ${allMatchedMap.size} matched user(s), ${usersToNotify.length} notification(s) sent`,
            );
        } catch (error) {
            this.logger.error(`Face search failed for post ${payload.postId}: ${error.message}`);
            // Fail silently
        }
    }
}
