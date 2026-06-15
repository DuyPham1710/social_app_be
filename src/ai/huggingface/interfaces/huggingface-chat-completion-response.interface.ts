export interface HuggingFaceChatCompletionResponse {
    choices?: {
        message?: {
            content?: string;
        };
    }[];
}
