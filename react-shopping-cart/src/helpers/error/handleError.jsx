import { ApiError } from '../../api/client';
import { CustomError } from './customError';

export const handleError = (err) => {
  if (err instanceof CustomError || err instanceof ApiError) {
    return { message: err.message };
  }
  return {
    message: 'An unexpected error occurred. Please try again later.',
  };
};
