import { useState } from 'react';

import { useCartContext } from './useCartContext';

import { handleError } from 'helpers/error/handleError';
import { api } from '../api/client';

export const useInventory = () => {
  const { dispatch } = useCartContext();

  const [isLoading, setIsLoading] = useState();
  const [error, setError] = useState();

  // Asks the server to trim the cart to current stock before checkout.
  const checkInventory = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const { items, warning } = await api('/cart/check', { method: 'POST' });

      if (items.length === 0) {
        dispatch({ type: 'DELETE_CART' });
      } else {
        dispatch({ type: 'UPDATE_CART', payload: items });
      }

      if (warning) setError({ message: warning });
    } catch (err) {
      console.error(err);
      setError(handleError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return { checkInventory, isLoading, error };
};

export default useInventory;
