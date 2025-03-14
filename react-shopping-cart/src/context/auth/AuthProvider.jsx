import { useReducer, useEffect } from 'react';
import PropTypes from 'prop-types';

import { 
  onAuthStateChanged, 
  signInAnonymously
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

import AuthContext from './auth-context';
import { auth, db } from '../../firebase/firebase-config';

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
  sessionExpiry: null
};

const SESSION_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

const authReducer = (state, action) => {
  switch (action.type) {
    case 'AUTH_IS_READY': {
      const sessionExpiry = new Date().getTime() + SESSION_DURATION;
      return {
        user: action.payload.user,
        name: action.payload.name,
        lastName: action.payload.lastName,
        email: action.payload.email,
        phoneNumber: action.payload.phoneNumber || null,
        addresses: action.payload.addresses || [],
        isVerified: action.payload.emailVerified || false,
        isAdmin: action.payload.isAdmin || false,
        authIsReady: true,
        lastLoginAt: action.payload.lastLoginAt || new Date().toISOString(),
        sessionExpiry
      };
    }

    case 'ANONYMOUS_AUTH_IS_READY': {
      return {
        ...initialState,
        user: action.payload.user,
        authIsReady: true,
        sessionExpiry: new Date().getTime() + SESSION_DURATION
      };
    }

    case 'LOGIN': {
      const sessionExpiry = new Date().getTime() + SESSION_DURATION;
      return {
        ...state,
        user: action.payload.user,
        name: action.payload.name,
        lastName: action.payload.lastName,
        email: action.payload.email,
        phoneNumber: action.payload.phoneNumber || null,
        addresses: action.payload.addresses || [],
        isVerified: action.payload.emailVerified || false,
        isAdmin: action.payload.isAdmin || false,
        lastLoginAt: new Date().toISOString(),
        sessionExpiry
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

    case 'REFRESH_SESSION': {
      return {
        ...state,
        sessionExpiry: new Date().getTime() + SESSION_DURATION
      };
    }

    default: {
      return state;
    }
  }
};

const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Check session expiry
  useEffect(() => {
    if (state.sessionExpiry) {
      const checkSession = () => {
        const now = new Date().getTime();
        if (now > state.sessionExpiry) {
          dispatch({ type: 'LOGOUT' });
        }
      };

      const interval = setInterval(checkSession, 60000); // Check every minute
      return () => clearInterval(interval);
    }
  }, [state.sessionExpiry]);

  // Handle auth state changes
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const userRef = doc(db, 'users', user.uid);
          const userDoc = await getDoc(userRef);

          if (userDoc.exists()) {
            const userData = userDoc.data();
            
            // Check if the user's session is expired
            const lastLoginAt = userData.lastLoginAt ? new Date(userData.lastLoginAt).getTime() : 0;
            const now = new Date().getTime();
            
            if (now - lastLoginAt > SESSION_DURATION) {
              await auth.signOut();
              dispatch({ type: 'LOGOUT' });
              return;
            }

            dispatch({
              type: 'AUTH_IS_READY',
              payload: { 
                user, 
                ...userData,
                emailVerified: user.emailVerified 
              },
            });
          } else {
            dispatch({
              type: 'ANONYMOUS_AUTH_IS_READY',
              payload: { user },
            });
          }
        } catch (error) {
          console.error('Error fetching user data:', error);
          dispatch({ type: 'LOGOUT' });
        }
      } else {
        try {
          await signInAnonymously(auth);
        } catch (error) {
          console.error('Error signing in anonymously:', error);
          dispatch({ type: 'LOGOUT' });
        }
      }
    });

    return () => unsub();
  }, []);

  // Remove console.log in production
  if (process.env.NODE_ENV !== 'production') {
    console.log('auth-context', state);
  }

  return (
    <AuthContext.Provider value={{ ...state, dispatch, auth }}>
      {children}
    </AuthContext.Provider>
  );
};

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired,
};

export default AuthProvider;
