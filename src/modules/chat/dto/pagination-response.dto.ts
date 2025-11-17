export class PaginationMetaDto {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
}

export class PaginatedResponseDto<T> {
    data: T[];
    pagination: PaginationMetaDto;
}

