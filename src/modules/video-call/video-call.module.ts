import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { VideoCallService } from './video-call.service';
import { VideoCallGateway } from './video-call.gateway';
import { CallHistory, CallHistorySchema } from './schemas/call-history.schema';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: CallHistory.name, schema: CallHistorySchema },
        ]),
    ],
    providers: [VideoCallGateway, VideoCallService],
    exports: [VideoCallService],
})
export class VideoCallModule { }

