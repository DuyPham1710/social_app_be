import { PostResponseDto } from "./post-response.dto";

export interface PostListDto {
    data: PostResponseDto[];
    page: number,
    limit: number,
    total: number,
    hasNext: boolean
}