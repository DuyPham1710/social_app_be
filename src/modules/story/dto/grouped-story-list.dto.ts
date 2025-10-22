import UserResponseDto from "src/modules/user/dto/user.response.dto";
import { StoryResponseDto } from "./story-response.dto";

export interface GroupedStoryListDto {
    users: {
        user: UserResponseDto;
        stories: StoryResponseDto[];
    }[];
    page: number;
    limit: number;
    total: number;
    hasNext: boolean;
}
