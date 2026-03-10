import { Global, Module } from '@nestjs/common';
import { FcmService } from './services/fcm.service';
import { HttpModule } from '@nestjs/axios';
import { ImageModerationService } from './services/image-moderation.service';

@Global()
@Module({
    imports: [HttpModule],
    providers: [FcmService, ImageModerationService],
    exports: [FcmService, ImageModerationService],
})
export class SharedModule { }
