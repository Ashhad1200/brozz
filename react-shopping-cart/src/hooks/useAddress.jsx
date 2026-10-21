import { useState } from 'react';

import { useAuthContext } from './useAuthContext';

import { handleError } from 'helpers/error/handleError';
import { api } from '../api/client';

// Main-address and ordering rules are enforced by the API, which always
// returns the full, re-ordered address list.
export const useAddress = () => {
  const { dispatch } = useAuthContext();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const toBody = ({
    name,
    lastName,
    phoneNumber,
    address,
    zipCode,
    city,
    state,
    isMain = false,
  }) => ({ name, lastName, phoneNumber, address, zipCode, city, state, isMain });

  const createAddress = async (input) => {
    setError(null);
    setIsLoading(true);
    try {
      const { address, addresses } = await api('/account/addresses', {
        method: 'POST',
        body: toBody(input),
      });
      dispatch({ type: 'UPDATE_ADDRESSES', payload: addresses });
      return address;
    } catch (err) {
      console.error(err);
      setError(handleError(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const editAddress = async (input) => {
    setError(null);
    setIsLoading(true);
    try {
      const { addresses } = await api(`/account/addresses/${input.id}`, {
        method: 'PUT',
        body: toBody(input),
      });
      dispatch({ type: 'UPDATE_ADDRESSES', payload: addresses });
    } catch (err) {
      console.error(err);
      setError(handleError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const deleteAddress = async (id) => {
    setError(null);
    setIsLoading(true);
    try {
      const { addresses } = await api(`/account/addresses/${id}`, {
        method: 'DELETE',
      });
      dispatch({ type: 'UPDATE_ADDRESSES', payload: addresses });
    } catch (err) {
      console.error(err);
      setError(handleError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return { createAddress, editAddress, deleteAddress, isLoading, error };
};
