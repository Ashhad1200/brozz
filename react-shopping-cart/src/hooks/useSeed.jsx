import { useState } from 'react';

import { api } from '../api/client';

export const useSeed = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const uploadProducts = async () => {
    setError(null);
    setIsLoading(true);

    try {
      setResult(await api('/admin/seed', { method: 'POST' }));
    } catch (err) {
      console.error(err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  };

  return { uploadProducts, isLoading, error, result };
};
