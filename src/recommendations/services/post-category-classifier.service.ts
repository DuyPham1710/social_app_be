import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HuggingFacePostClassificationService } from 'src/ai/huggingface/huggingface-post-classification.service';
import { PostCategory } from 'src/common/enums/post-category.enum';
import { PostCategorySource } from 'src/common/enums/post-category-source.enum';
import { RuleBasedPostCategoryService } from './rule-based-post-category.service';

export interface PostCategoryClassificationResult {
    category: PostCategory | null;
    confidence: number;
    source: PostCategorySource;
    isRecommendable: boolean;
    raw?: any;
}

@Injectable()
export class PostCategoryClassifierService {
    private readonly logger = new Logger(PostCategoryClassifierService.name);

    constructor(
        private readonly ruleBasedClassifier: RuleBasedPostCategoryService,
        private readonly huggingFacePostClassificationService: HuggingFacePostClassificationService,
        private readonly configService: ConfigService,
    ) {}

    async classifyCaption(caption?: string | null): Promise<PostCategoryClassificationResult> {
        if (!caption || caption.trim().length === 0) {
            return {
                category: null,
                confidence: 0,
                source: PostCategorySource.NONE,
                isRecommendable: false,
            };
        }

        const ruleResult = this.ruleBasedClassifier.classify(caption);
        if (ruleResult.category && ruleResult.confidence >= 0.85) {
            return {
                category: ruleResult.category,
                confidence: ruleResult.confidence,
                source: PostCategorySource.RULE,
                isRecommendable: true,
                raw: { matchedKeywords: ruleResult.matchedKeywords },
            };
        }

        try {
            const huggingFaceResult = await this.huggingFacePostClassificationService.classifyCaptionWithAI(caption);
            if (huggingFaceResult.category) {
                const confidenceThreshold = this.getConfidenceThreshold();
                if (huggingFaceResult.confidence >= confidenceThreshold) {
                    return {
                        category: huggingFaceResult.category,
                        confidence: huggingFaceResult.confidence,
                        source: PostCategorySource.HUGGINGFACE,
                        isRecommendable: true,
                        raw: huggingFaceResult.raw,
                    };
                }

                return {
                    category: PostCategory.OTHER,
                    confidence: huggingFaceResult.confidence,
                    source: PostCategorySource.HUGGINGFACE,
                    isRecommendable: true,
                    raw: huggingFaceResult.raw,
                };
            }
        } catch (error) {
            this.logger.error(`Unexpected post classification error: ${error.message}`);
        }

        if (ruleResult.category && ruleResult.confidence >= 0.5) {
            return {
                category: ruleResult.category,
                confidence: ruleResult.confidence,
                source: PostCategorySource.FALLBACK,
                isRecommendable: true,
                raw: { matchedKeywords: ruleResult.matchedKeywords },
            };
        }

        return {
            category: null,
            confidence: 0,
            source: PostCategorySource.NONE,
            isRecommendable: false,
        };
    }

    private getConfidenceThreshold(): number {
        const threshold = Number(this.configService.get<string>('POST_CATEGORY_CONFIDENCE_THRESHOLD', '0.45'));
        return Number.isFinite(threshold) && threshold >= 0 && threshold <= 1 ? threshold : 0.45;
    }
}
