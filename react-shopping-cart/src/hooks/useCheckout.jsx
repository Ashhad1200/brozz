import { useState } from 'react';

import { useCheckoutContext } from './useCheckoutContext';
import { useAddress } from './useAddress';

import { handleError } from 'helpers/error/handleError';
import { api } from '../api/client';

export const useCheckout = () => {
  const { dispatch } = useCheckoutContext();
  const { createAddress } = useAddress();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const selectPreviousStep = () => {
    dispatch({ type: 'SELECT_PREVIOUS_STEP' });
  };

  const selectStep = (index) => {
    dispatch({ type: 'SELECT_STEP', payload: index });
  };

  const submitShippingInfo = async (userInput) => {
    setError(null);
    setIsLoading(true);
    try {
      const { email, ...shippingAddress } = userInput;

      let selectedAddress = shippingAddress;

      if (shippingAddress.value === 'new') {
        selectedAddress = await createAddress({ ...shippingAddress });
        if (!selectedAddress) {
          throw new Error('Could not save the new address');
        }
      }

      await api('/checkout/shipping-info', {
        method: 'PUT',
        body: { email, shippingAddressId: selectedAddress.id },
      });

      dispatch({
        type: 'SUBMIT_SHIPPING_INFO',
        payload: { email, shippingAddress: selectedAddress },
      });
    } catch (err) {
      console.error(err);
      setError(handleError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const selectShippingOption = (option) => {
    dispatch({
      type: 'SELECT_SHIPPING_OPTION',
      payload: {
        standard: option === 'standard',
        expedited: option !== 'standard',
      },
    });
  };

  // The server decides what each option costs.
  const submitShippingOption = async ({ shippingOption }) => {
    setError(null);
    setIsLoading(true);
    try {
      const session = await api('/checkout/shipping-option', {
        method: 'PUT',
        body: { option: shippingOption.standard ? 'standard' : 'expedited' },
      });

      dispatch({ type: 'SUBMIT_SHIPPING_OPTION', payload: session.shippingCost });
    } catch (err) {
      console.error(err);
      setError(handleError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return {
    selectPreviousStep,
    selectStep,
    submitShippingInfo,
    selectShippingOption,
    submitShippingOption,
    isLoading,
    error,
  };
};
