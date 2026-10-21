import { useState } from 'react';

import { useAuthContext } from './useAuthContext';

import { handleError } from 'helpers/error/handleError';
import { api } from '../api/client';

export const useProfile = () => {
  const { dispatch } = useAuthContext();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(false);

  const editProfile = async ({ name, lastName, phoneNumber = null }) => {
    setError(null);
    setIsLoading(true);
    try {
      const { user } = await api('/account/profile', {
        method: 'PATCH',
        body: { name, lastName, phoneNumber },
      });

      dispatch({
        type: 'UPDATE_USER',
        payload: {
          name: user.name,
          lastName: user.lastName,
          phoneNumber: user.phoneNumber,
        },
      });
    } catch (err) {
      console.error(err);
      setError(handleError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return { editProfile, isLoading, error };
};
