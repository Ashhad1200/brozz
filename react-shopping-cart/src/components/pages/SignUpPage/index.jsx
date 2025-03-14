import { useRef, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { useAuth } from 'hooks/useAuth';
import { useToast } from 'hooks/useToast';

import { Loader } from 'components/common';

import styles from './index.module.scss';

// Password validation rules
const passwordRules = {
  minLength: { rule: (val) => val.length >= 8, text: 'At least 8 characters' },
  hasUpperCase: { rule: (val) => /[A-Z]/.test(val), text: 'One uppercase letter' },
  hasLowerCase: { rule: (val) => /[a-z]/.test(val), text: 'One lowercase letter' },
  hasNumber: { rule: (val) => /\d/.test(val), text: 'One number' },
  hasSpecial: { rule: (val) => /[@$!%*?&]/.test(val), text: 'One special character (@$!%*?&)' }
};

// Password suggestions
const passwordSuggestions = [
  'BrozzShop@2024',
  'Shopping#123',
  'Fashion$2024',
  'Secure!Shop24',
  'MyCart@2024'
];

const SignUpPage = () => {
  const { state: routerState } = useLocation();
  const navigate = useNavigate();

  const { signUp, signInWithGoogle, isLoading, error, defaultValue } = useAuth();
  const { sendToast } = useToast();

  const nameInput = useRef();
  const lastNameInput = useRef();
  const emailInput = useRef();
  const passwordInput = useRef();

  const [password, setPassword] = useState('');
  const [validationResults, setValidationResults] = useState({});
  const [showPassword, setShowPassword] = useState(false);

  // Validate password as user types
  const handlePasswordChange = (e) => {
    const value = e.target.value;
    setPassword(value);

    // Check each rule
    const results = {};
    Object.entries(passwordRules).forEach(([key, { rule }]) => {
      results[key] = rule(value);
    });
    setValidationResults(results);
  };

  const handleSuggestPassword = () => {
    const randomIndex = Math.floor(Math.random() * passwordSuggestions.length);
    const suggestedPassword = passwordSuggestions[randomIndex];
    setPassword(suggestedPassword);
    
    // Update validation results for the suggested password
    const results = {};
    Object.entries(passwordRules).forEach(([key, { rule }]) => {
      results[key] = rule(suggestedPassword);
    });
    setValidationResults(results);

    // Focus the password input
    passwordInput.current.focus();
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const handleGoogleSignUp = async () => {
    try {
      await signInWithGoogle();
    } catch (err) {
      sendToast({
        error: true,
        content: {
          message: err.message || 'An error occurred during Google sign up. Please try again.'
        }
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Check if all password rules pass
    const allRulesPassed = Object.values(validationResults).every(result => result);
    if (!allRulesPassed) {
      sendToast({ 
        error: true, 
        content: { 
          message: 'Please ensure your password meets all requirements' 
        } 
      });
      return;
    }

    try {
      await signUp({
        name: nameInput.current.value,
        lastName: lastNameInput.current.value,
        email: emailInput.current.value,
        password: passwordInput.current.value,
      });
    } catch (err) {
      // Handle specific Firebase errors
      if (err.code === 'auth/provider-already-linked' || err.code === 'auth/email-already-in-use') {
        sendToast({
          error: true,
          content: {
            message: 'This email is already registered. Please try logging in instead.',
            action: {
              label: 'Go to Login',
              onClick: () => navigate('/account/login', { state: routerState })
            }
          }
        });
        // Safely focus the email input if it exists
        if (emailInput.current) {
          emailInput.current.focus();
        }
      } else {
        // Handle other errors
        sendToast({
          error: true,
          content: {
            message: err.message || 'An error occurred during sign up. Please try again.'
          }
        });
      }
    }
  };

  useEffect(() => {
    if (error) {
      // Only show general errors here, specific errors are handled in handleSubmit
      if (error.code !== 'auth/provider-already-linked' && error.code !== 'auth/email-already-in-use') {
        sendToast({ error: true, content: { message: error.message } });
      }
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
                  <h2 className={styles.title}>Create Account</h2>
                  
                  <button 
                    type="button"
                    className={styles.google_button}
                    onClick={handleGoogleSignUp}
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
                    <span>Name:</span>
                    <input
                      defaultValue={defaultValue?.name || ''}
                      className={styles.input}
                      type="text"
                      placeholder="Name"
                      required
                      ref={nameInput}
                    />
                  </label>
                  <label className={styles.label}>
                    <span>Last Name:</span>
                    <input
                      defaultValue={defaultValue?.lastName || ''}
                      className={styles.input}
                      type="text"
                      placeholder="Last Name"
                      required
                      ref={lastNameInput}
                    />
                  </label>
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
                    <div className={styles.password_input_wrapper}>
                      <input
                        className={styles.input}
                        type={showPassword ? "text" : "password"}
                        required
                        ref={passwordInput}
                        value={password}
                        onChange={handlePasswordChange}
                      />
                      <button 
                        type="button"
                        className={styles.password_toggle}
                        onClick={togglePasswordVisibility}
                      >
                        {showPassword ? '🔒' : '👁️'}
                      </button>
                    </div>
                    <div className={styles.password_requirements}>
                      <div className={styles.requirements_header}>
                        <p className={styles.requirements_title}>Password must have:</p>
                        <button 
                          type="button"
                          className={styles.suggest_button}
                          onClick={handleSuggestPassword}
                        >
                          Suggest Password
                        </button>
                      </div>
                      {Object.entries(passwordRules).map(([key, { text }]) => (
                        <div 
                          key={key} 
                          className={`${styles.requirement} ${
                            validationResults[key] ? styles.valid : styles.invalid
                          }`}
                        >
                          {validationResults[key] ? '✓' : '•'} {text}
                        </div>
                      ))}
                    </div>
                  </label>
                  <button 
                    className={styles.button} 
                    type="submit"
                    disabled={!Object.values(validationResults).every(result => result)}
                  >
                    Create Account
                  </button>
                </form>
                <p className={styles.login}>
                  Already have an account?{' '}
                  <Link to="/account/login" state={routerState}>
                    Login
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

export default SignUpPage;
