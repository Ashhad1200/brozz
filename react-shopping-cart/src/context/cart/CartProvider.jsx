import { useReducer, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

import { useAuthContext } from 'hooks/useAuthContext';
import { useToast } from 'hooks/useToast';

import CartContext from './cart-context';

import { api } from '../../api/client';

const initialState = {
  items: [],
  cartIsReady: false,
  cartNeedsCheck: true,
  isLogin: true,
};

const cartReducer = (state, action) => {
  const { type, payload } = action;
  switch (type) {
    case 'CART_IS_READY': {
      return {
        ...state,
        cartIsReady: true,
        isLogin: false,
      };
    }
    case 'CART_NOT_READY': {
      return {
        ...state,
        cartIsReady: false,
      };
    }
    case 'UPDATE_CART': {
      return {
        ...state,
        items: payload,
        cartIsReady: true,
        isLogin: false,
      };
    }
    case 'DELETE_CART': {
      return {
        ...initialState,
        cartIsReady: true,
      };
    }
    case 'CHECK': {
      return {
        ...state,
        cartNeedsCheck: true,
      };
    }
    case 'NO_CHECK': {
      return {
        ...state,
        cartNeedsCheck: false,
      };
    }
    case 'IS_LOGIN': {
      return {
        ...state,
        isLogin: true,
      };
    }
    case 'IS_NOT_LOGIN': {
      return {
        ...state,
        isLogin: false,
      };
    }

    default: {
      return state;
    }
  }
};

const CartProvider = ({ children }) => {
  const { sendToast } = useToast();

  const [state, dispatch] = useReducer(cartReducer, initialState);
  const location = useLocation();

  const { user } = useAuthContext();

  const firstLoad = useRef(true);

  // (Re)load the cart whenever the session changes: first visit, login, logout.
  useEffect(() => {
    if (user && state.isLogin) {
      dispatch({ type: 'CART_NOT_READY' });
      const getCart = async () => {
        try {
          if (
            (location.pathname === '/cart' ||
              location.pathname === '/checkout') &&
            firstLoad.current
          ) {
            dispatch({ type: 'NO_CHECK' });
          }
          firstLoad.current = false;

          // The API trims quantities to available stock before answering.
          const { items, warning } = await api('/cart');

          if (warning) {
            sendToast({ error: true, content: { message: warning } });
          }

          dispatch({ type: 'UPDATE_CART', payload: items });
        } catch (err) {
          console.error(err);
          dispatch({ type: 'CART_IS_READY' });
        }
      };
      getCart();
    }
  }, [user]);

  return (
    <CartContext.Provider value={{ ...state, dispatch }}>
      {children}
    </CartContext.Provider>
  );
};

export default CartProvider;
