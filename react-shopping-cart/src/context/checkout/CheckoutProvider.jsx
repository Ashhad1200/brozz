import { useReducer, useEffect } from 'react';

import { useAuthContext } from 'hooks/useAuthContext';

import CheckoutContext from './checkout-context';

import { api } from '../../api/client';

const initialState = {
  checkoutIsReady: false,
  currentStep: 1,
  email: null,
  id: null,
  shippingAddress: { id: null },
  shippingOption: { standard: false, expedited: false },
  shippingCost: 0,
};

const checkoutReducer = (state, action) => {
  const { type, payload } = action;
  switch (type) {
    case 'SELECT_STEP': {
      return {
        ...state,
        currentStep: payload,
      };
    }
    case 'SELECT_PREVIOUS_STEP': {
      return {
        ...state,
        currentStep: state.currentStep - 1,
      };
    }
    case 'SUBMIT_SHIPPING_INFO': {
      return {
        ...state,
        currentStep: state.currentStep + 1,
        email: payload.email,
        shippingAddress: payload.shippingAddress,
      };
    }
    case 'SELECT_SHIPPING_OPTION': {
      return {
        ...state,
        shippingOption: payload,
      };
    }
    case 'SUBMIT_SHIPPING_OPTION': {
      return {
        ...state,
        shippingCost: payload,
        currentStep: state.currentStep + 1,
      };
    }
    case 'UPDATE_CHECKOUT_SESSION': {
      return {
        ...state,
        checkoutIsReady: true,
        email: payload.email,
        id: payload.id,
        shippingAddress: payload.shippingAddress,
        shippingOption: payload.shippingOption,
        shippingCost: payload.shippingCost,
      };
    }

    default: {
      return state;
    }
  }
};

const CheckoutProvider = ({ children }) => {
  const { user } = useAuthContext();

  const [state, dispatch] = useReducer(checkoutReducer, initialState);

  useEffect(() => {
    const getCheckoutSession = async () => {
      try {
        const session = await api('/checkout');
        dispatch({
          type: 'UPDATE_CHECKOUT_SESSION',
          payload: { ...session, id: user.id },
        });
      } catch (err) {
        console.error(err);
      }
    };

    getCheckoutSession();
  }, []);

  return (
    <CheckoutContext.Provider value={{ ...state, dispatch }}>
      {children}
    </CheckoutContext.Provider>
  );
};

export default CheckoutProvider;
