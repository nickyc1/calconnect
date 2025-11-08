/**
 * Custom application error class
 */
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode: number = 500,
    public isOperational: boolean = true
  ) {
    super(message);
    Error.captureStackTrace(this, this.constructor);
    this.name = this.constructor.name;
  }
}

/**
 * Error response type
 */
export interface ErrorResponse {
  message: string;
  statusCode: number;
  code?: string;
}

/**
 * Handle and format errors for API responses
 */
export function handleError(error: unknown): ErrorResponse {
  // Log error (in production, send to Sentry/logging service)
  console.error('Error occurred:', error);

  // Custom AppError
  if (error instanceof AppError) {
    return {
      message: error.message,
      statusCode: error.statusCode,
      code: error.code
    };
  }

  // Pipedream API errors
  if (isApiError(error)) {
    if (error.status === 429) {
      return {
        message: 'Rate limit exceeded. Please try again later.',
        statusCode: 429,
        code: 'RATE_LIMIT_EXCEEDED'
      };
    }

    if (error.status === 401) {
      return {
        message: 'Authentication failed. Please reconnect your account.',
        statusCode: 401,
        code: 'AUTH_FAILED'
      };
    }

    if (error.status === 403) {
      return {
        message: 'Permission denied. Please check account permissions.',
        statusCode: 403,
        code: 'PERMISSION_DENIED'
      };
    }

    if (error.status === 404) {
      return {
        message: 'Resource not found.',
        statusCode: 404,
        code: 'NOT_FOUND'
      };
    }
  }

  // Google Calendar specific errors
  if (isGoogleCalendarError(error)) {
    return {
      message: error.message || 'Google Calendar API error',
      statusCode: error.code || 500,
      code: 'GOOGLE_CALENDAR_ERROR'
    };
  }

  // Supabase errors
  if (isSupabaseError(error)) {
    return {
      message: 'Database operation failed',
      statusCode: 500,
      code: 'DATABASE_ERROR'
    };
  }

  // Default error
  return {
    message: 'An unexpected error occurred',
    statusCode: 500,
    code: 'INTERNAL_SERVER_ERROR'
  };
}

/**
 * Type guards for different error types
 */
function isApiError(error: any): error is { status: number; message?: string } {
  return error && typeof error.status === 'number';
}

function isGoogleCalendarError(error: any): error is { code: number; message: string } {
  return error && error.errors && Array.isArray(error.errors);
}

function isSupabaseError(error: any): error is { code: string; message: string } {
  return error && typeof error.code === 'string' && error.message;
}

/**
 * Create a standardized error response for Next.js API routes
 */
export function createErrorResponse(error: unknown) {
  const errorResponse = handleError(error);

  return new Response(
    JSON.stringify({
      error: errorResponse.message,
      code: errorResponse.code
    }),
    {
      status: errorResponse.statusCode,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}
