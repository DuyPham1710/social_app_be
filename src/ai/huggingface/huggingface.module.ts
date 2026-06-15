import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { HuggingFacePostClassificationService } from './huggingface-post-classification.service';

@Module({
    imports: [HttpModule],
    providers: [HuggingFacePostClassificationService],
    exports: [HuggingFacePostClassificationService],
})
export class HuggingFaceModule {}
