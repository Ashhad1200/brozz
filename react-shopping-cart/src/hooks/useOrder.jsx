import { useState } from 'react';

import { useCartContext } from './useCartContext';

import { handleError } from 'helpers/error/handleError';
import { api } from '../api/client';

export const useOrder = () => {
  const { dispatch: dispatchCartAction } = useCartContext();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // The server re-checks stock, prices and shipping, then clears the cart.
  const createOrder = async (paymentInfo, billingAddress) => {
    setError(null);
    setIsLoading(true);

    try {
      const { order } = await api('/orders', {
        method: 'POST',
        body: { payment: paymentInfo, billingAddress },
      });

      dispatchCartAction({ type: 'DELETE_CART' });
      return order.id;
    } catch (err) {
      console.error(err);
      // Stock changed while checking out: show the trimmed cart.
      if (err.status === 409 && err.data?.items) {
        dispatchCartAction({ type: 'UPDATE_CART', payload: err.data.items });
      }
      setError(handleError(err));
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const getOrders = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const { orders } = await api('/orders');
      return orders;
    } catch (err) {
      console.error(err);
      setError(handleError(err));
      return [];
    } finally {
      setIsLoading(false);
    }
  };

  return { createOrder, getOrders, isLoading, error };
};
