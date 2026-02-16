export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface ApiError {
  error: string;
  statusCode: number;
  details?: string[];
}
