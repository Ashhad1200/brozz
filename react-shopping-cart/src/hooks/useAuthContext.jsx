import { useContext } from 'react';
import AuthContext from '../context/auth/auth-context';

// import AuthContext from 'context/auth/auth-context';

export const useAuthContext = () => {
  const context = useContext(AuthContext);

  if (!context) {
    throw Error('useAuthContext hook must be used inside AuthProvider');
  }

  return context;
};
