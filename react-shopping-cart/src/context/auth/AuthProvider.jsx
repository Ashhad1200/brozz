import { useReducer, useEffect } from 'react';
import PropTypes from 'prop-types';

import AuthContext from './auth-context';
import { api, getToken, clearToken, startGuestSession } from '../../api/client';

const initialState = {
  user: null,
  name: null,
  lastName: null,
  email: null,
  phoneNumber: null,
  addresses: [],
  isVerified: false,
  isAdmin: false,
  authIsReady: false,
  lastLoginAt: null,
};

// Maps the API's user payload onto auth context state.
const userToState = (user) => ({
  user: { id: user.id, uid: user.id },
  name: user.name,
  lastName: user.lastName,
  email: user.email,
  phoneNumber: user.phoneNumber || null,
  addresses: user.addresses || [],
  isVerified: user.isVerified,
  isAdmin: user.isAdmin,
  lastLoginAt: user.lastLoginAt,
});

const authReducer = (state, action) => {
  switch (action.type) {
    case 'AUTH_IS_READY':
    case 'LOGIN': {
      return {
        ...initialState,
        ...userToState(action.payload),
        authIsReady: true,
      };
    }

    case 'LOGOUT': {
      return {
        ...initialState,
      };
    }

    case 'UPDATE_USER': {
      return {
        ...state,
        ...action.payload,
      };
    }

    case 'UPDATE_ADDRESSES': {
      return {
        ...state,
        addresses: action.payload,
      };
    }

    default: {
      return state;
    }
  }
};

const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  useEffect(() => {
    const restoreSession = async () => {
      try {
        let user = null;
        if (getToken()) {
          try {
            ({ user } = await api('/auth/me'));
          } catch {
            clearToken();
          }
        }
        if (!user) {
          user = await startGuestSession();
        }
        dispatch({ type: 'AUTH_IS_READY', payload: user });
      } catch (error) {
        console.error('Could not reach the API:', error);
      }
    };

    restoreSession();
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, dispatch }}>
      {children}
    </AuthContext.Provider>
  );
};

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default AuthProvider;
