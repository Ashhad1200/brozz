import { useState } from 'react';

import { handleError } from 'helpers/error/handleError';
import { api } from '../api/client';

export const useNewsletter = () => {
  const [success, setSuccess] = useState(null);
  const [error, setError] = useState(null);

  const subscribeToNewsletter = async ({ email }) => {
    setError(null);
    try {
      const { message } = await api('/newsletter', {
        method: 'POST',
        body: { email },
      });
      setSuccess({ message });
    } catch (err) {
      console.error(err);
      setError(handleError(err));
    }
  };

  return { subscribeToNewsletter, success, error };
};
