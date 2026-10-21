import { useState } from 'react';

import { useAuthContext } from './useAuthContext';
import { useCartContext } from './useCartContext';

import { handleError } from 'helpers/error/handleError';
import {
  api,
  setToken,
  clearToken,
  startGuestSession,
} from '../api/client';

export const useAuth = () => {
  const { dispatch: dispatchAuthAction } = useAuthContext();
  const { dispatch: dispatchCartAction } = useCartContext();

  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [defaultValue, setDefaultValue] = useState(false);

  // Signing up upgrades the current guest session, so the cart is kept.
  const signUp = async ({ name, lastName, email, password }) => {
    setError(null);
    setIsLoading(true);
    setDefaultValue({ name, lastName, email });

    try {
      const { token, user } = await api('/auth/signup', {
        method: 'POST',
        body: { name, lastName, email, password },
      });
      setToken(token);
      dispatchAuthAction({ type: 'LOGIN', payload: user });
    } catch (err) {
      console.error(err);
      setError(handleError(err));
    } finally {
      setIsLoading(false);
    }
  };

  // Logging in merges the guest cart into the account cart on the server.
  const login = async ({ email, password }) => {
    setError(null);
    setIsLoading(true);
    setDefaultValue({ email });

    try {
      dispatchCartAction({ type: 'IS_LOGIN' });
      const { token, user } = await api('/auth/login', {
        method: 'POST',
        body: { email, password },
      });
      setToken(token);
      dispatchAuthAction({ type: 'LOGIN', payload: user });
    } catch (err) {
      console.error(err);
      setError(handleError(err));
      dispatchCartAction({ type: 'IS_NOT_LOGIN' });
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setError(null);
    setIsLoading(true);
    try {
      clearToken();
      dispatchCartAction({ type: 'DELETE_CART' });
      const guest = await startGuestSession();
      dispatchAuthAction({ type: 'LOGIN', payload: guest });
    } catch (err) {
      console.error(err);
      setError(handleError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const changePassword = async (currentPassword, newPassword) => {
    setError(null);
    setIsLoading(true);
    try {
      await api('/auth/password', {
        method: 'PUT',
        body: { currentPassword, newPassword },
      });
    } catch (err) {
      console.error(err);
      setError(handleError(err));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    signUp,
    login,
    logout,
    changePassword,
    isLoading,
    error,
    defaultValue,
  };
};
