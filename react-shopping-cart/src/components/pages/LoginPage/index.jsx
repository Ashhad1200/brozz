import { useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { useAuth } from 'hooks/useAuth';
import { useToast } from 'hooks/useToast';

import { Loader } from 'components/common';

import styles from './index.module.scss';

const LoginPage = () => {
  const { state: routerState } = useLocation();

  const { login, signInWithGoogle, isLoading, error, defaultValue } = useAuth();
  const { sendToast } = useToast();

  const emailInput = useRef();
  const passwordInput = useRef();

  const handleGoogleSignIn = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      sendToast({
        error: true,
        content: {
          message: err.message || 'An error occurred during Google sign in. Please try again.'
        }
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    await login({
      email: emailInput.current.value,
      password: passwordInput.current.value,
    });
  };

  useEffect(() => {
    if (error) {
      sendToast({ error: true, content: { message: error.message } });
    }
  }, [error]);

  return (
    <>
      {isLoading && <Loader />}
      {!isLoading && (
        <>
          <section className={styles.nav_section}></section>
          <section className={styles.section}>
            <div className={styles.container}>
              <div className={`${styles.wrapper} main-container`}>
                <form onSubmit={handleSubmit} className={styles.form}>
                  <h2 className={styles.title}>Login</h2>

                  <button 
                    type="button"
                    className={styles.google_button}
                    onClick={handleGoogleSignIn}
                  >
                    <img 
                      src="/google-icon.svg" 
                      alt="Google" 
                      className={styles.google_icon}
                    />
                    Continue with Google
                  </button>

                  <div className={styles.divider}>
                    <span>or</span>
                  </div>

                  <label className={styles.label}>
                    <span>Email:</span>
                    <input
                      defaultValue={defaultValue?.email || ''}
                      className={styles.input}
                      type="email"
                      placeholder="yourname@email.com"
                      required
                      ref={emailInput}
                    />
                  </label>
                  <label className={styles.label}>
                    <span>Password:</span>
                    <input
                      className={styles.input}
                      type="password"
                      required
                      ref={passwordInput}
                    />
                  </label>
                  <button className={styles.button} type="submit">
                    Login
                  </button>
                </form>
                <p className={styles.signup}>
                  Don't have an account?{' '}
                  <Link to="/account/signup" state={routerState}>
                    Create Account
                  </Link>
                </p>
              </div>
            </div>
          </section>
        </>
      )}
    </>
  );
};

export default LoginPage;
