import { useState } from 'react';

import { useCartContext } from './useCartContext';

import { handleError } from 'helpers/error/handleError';
import { api } from '../api/client';

// Stock checks happen on the server; every call returns the updated cart and,
// when stock forced a change, a warning to show the shopper.
export const useCart = () => {
  const { dispatch } = useCartContext();

  const [isLoading, setIsLoading] = useState(false);
  const [loadingItemId, setLoadingItemId] = useState(false);
  const [error, setError] = useState(null);

  const applyCart = ({ items, warning }) => {
    if (items.length === 0) {
      dispatch({ type: 'DELETE_CART' });
    } else {
      dispatch({ type: 'UPDATE_CART', payload: items });
    }
    if (warning) setError({ message: warning });
  };

  const run = async (skuId, request) => {
    setLoadingItemId(skuId);
    setError(null);
    setIsLoading(true);
    try {
      applyCart(await request());
    } catch (err) {
      console.error(err);
      setError(handleError(err));
    } finally {
      setLoadingItemId(null);
      setIsLoading(false);
    }
  };

  const addItem = async (itemToAdd) => {
    if (isLoading) return;
    await run(itemToAdd.skuId, () =>
      api('/cart/items', { method: 'POST', body: { skuId: itemToAdd.skuId } })
    );
  };

  const removeItem = (productId, skuId) =>
    run(skuId, () =>
      api(`/cart/items/${skuId}/decrement`, { method: 'POST' })
    );

  const deleteItem = (skuId) =>
    run(skuId, () => api(`/cart/items/${skuId}`, { method: 'DELETE' }));

  const deleteCart = async () => {
    await api('/cart', { method: 'DELETE' });
    dispatch({ type: 'DELETE_CART' });
  };

  const activateCartCheck = () => {
    dispatch({ type: 'CHECK' });
  };

  return {
    addItem,
    removeItem,
    deleteItem,
    deleteCart,
    activateCartCheck,
    isLoading,
    loadingItemId,
    error,
  };
};
