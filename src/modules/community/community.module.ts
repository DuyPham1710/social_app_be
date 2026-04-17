import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { CommunityService } from './community.service';
import { CommunityController } from './community.controller';

import { Community, CommunitySchema } from './schemas/community.schema';
import { CommunityMember, CommunityMemberSchema } from './schemas/community_member.schema';
import { CommunityRequest, CommunityRequestSchema } from './schemas/community_request.schema';

import { NotificationModule } from '../notification/notification.module';

@Module({
    imports: [
        MongooseModule.forFeature([
            { name: Community.name, schema: CommunitySchema },
            { name: CommunityMember.name, schema: CommunityMemberSchema },
            { name: CommunityRequest.name, schema: CommunityRequestSchema },
        ]),
        forwardRef(() => NotificationModule),
    ],
    controllers: [CommunityController],
    providers: [CommunityService],
    exports: [CommunityService],
})
export class CommunityModule {}
