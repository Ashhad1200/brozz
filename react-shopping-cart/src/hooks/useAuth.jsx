import { useState } from "react";

import {
  EmailAuthProvider,
  linkWithCredential,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  GoogleAuthProvider,
  signInWithPopup
} from "firebase/auth";
import { doc, getDoc, deleteDoc, setDoc } from "firebase/firestore";

import { useAuthContext } from "./useAuthContext";
import { useCartContext } from "./useCartContext";

import { handleError } from "helpers/error/handleError";
import { db, auth } from "../firebase/firebase-config";

// Password validation regex
const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{8,}$/;

export const useAuth = () => {
  const { user, dispatch: dispatchAuthAction } = useAuthContext();
  const { dispatch: dispatchCartAction } = useCartContext();

  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [defaultValue, setDefaultValue] = useState(false);

  const validatePassword = (password) => {
    if (!PASSWORD_REGEX.test(password)) {
      throw new Error(
        'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character'
      );
    }
  };

  const signInWithGoogle = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;

      // Check if user document exists
      const userDoc = await getDoc(doc(db, "users", user.uid));
      
      if (!userDoc.exists()) {
        // Create new user document
        const names = user.displayName?.split(' ') || ['', ''];
        const userData = {
          name: names[0],
          lastName: names.slice(1).join(' '),
          email: user.email,
          phoneNumber: user.phoneNumber || null,
          addresses: [],
          isVerified: true,
          createdAt: new Date().toISOString(),
          lastLoginAt: new Date().toISOString(),
          lastPasswordChange: new Date().toISOString()
        };

        await setDoc(doc(db, "users", user.uid), userData);

        dispatchAuthAction({ 
          type: "LOGIN", 
          payload: { 
            user,
            ...userData,
            emailVerified: true
          } 
        });
      } else {
        // Update last login time
        await setDoc(doc(db, "users", user.uid), {
          lastLoginAt: new Date().toISOString()
        }, { merge: true });

        dispatchAuthAction({ 
          type: "LOGIN", 
          payload: { 
            user,
            ...userDoc.data(),
            emailVerified: true
          } 
        });
      }

      // Handle anonymous cart if exists
      if (user) {
        const anonymousCartRef = doc(db, "carts", user.uid);
        const anonymousCartDoc = await getDoc(anonymousCartRef);
        if (anonymousCartDoc.exists()) {
          await deleteDoc(anonymousCartRef);
        }
      }

    } catch (err) {
      console.error(err);
      setError(handleError(err));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const signUp = async ({ name, lastName, email, password }) => {
    setError(null);
    setIsLoading(true);
    setDefaultValue({ name, lastName, email });

    try {
      // Validate password
      validatePassword(password);

      const credential = EmailAuthProvider.credential(email, password);

      const userCredential = await linkWithCredential(
        auth.currentUser,
        credential
      );

      if (!userCredential) {
        throw new Error("Could not create account");
      }

      const user = userCredential.user;

      // Update profile
      await updateProfile(user, {
        displayName: `${name} ${lastName}`
      });

      // Send verification email
      await sendEmailVerification(user);

      const userData = {
        name,
        lastName,
        email,
        phoneNumber: null,
        addresses: [],
        isVerified: false,
        createdAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
        lastPasswordChange: new Date().toISOString()
      };

      await setDoc(doc(db, "users", user.uid), userData);

      dispatchAuthAction({ 
        type: "LOGIN", 
        payload: { 
          user, 
          ...userData,
          emailVerified: user.emailVerified 
        } 
      });
    } catch (err) {
      console.error(err);
      setError(handleError(err));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const login = async ({ email, password }) => {
    setError(null);
    setIsLoading(true);
    setDefaultValue({ email });

    try {
      dispatchCartAction({ type: "IS_LOGIN" });
      const anonymousUser = user;

      const anonymousCartRef = doc(db, "carts", anonymousUser.uid);
      const anonymousCartDoc = await getDoc(anonymousCartRef);

      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      
      if (!userCredential) {
        throw new Error("Login failed");
      }

      const user = userCredential.user;

      // Check if email is verified
      if (!user.emailVerified) {
        // Send another verification email if needed
        await sendEmailVerification(user);
        throw new Error("Please verify your email address. A new verification email has been sent.");
      }

      // Update last login time
      await setDoc(doc(db, "users", user.uid), {
        lastLoginAt: new Date().toISOString()
      }, { merge: true });

      if (anonymousCartDoc.exists()) {
        await deleteDoc(doc(db, "carts", anonymousUser.uid));
      }

      const userDoc = await getDoc(doc(db, "users", user.uid));
      if (userDoc.exists()) {
        dispatchAuthAction({ 
          type: "LOGIN", 
          payload: { 
            user,
            ...userDoc.data(),
            emailVerified: user.emailVerified
          } 
        });
      }
    } catch (err) {
      console.error(err);
      setError(handleError(err));
      dispatchCartAction({ type: "IS_NOT_LOGIN" });
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    setError(null);
    setIsLoading(true);
    try {
      await signOut(auth);
      dispatchCartAction({ type: "DELETE_CART" });
      dispatchAuthAction({ type: "LOGOUT" });
    } catch (err) {
      console.error(err);
      setError(handleError(err));
    } finally {
      setIsLoading(false);
    }
  };

  const changePassword = async (currentPassword, newPassword) => {
    setError(null);
    setIsLoading(true);
    try {
      // Validate new password
      validatePassword(newPassword);

      // Re-authenticate user
      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword
      );
      await reauthenticateWithCredential(user, credential);

      // Change password
      await updatePassword(user, newPassword);

      // Update last password change timestamp
      await setDoc(doc(db, "users", user.uid), {
        lastPasswordChange: new Date().toISOString()
      }, { merge: true });

    } catch (err) {
      console.error(err);
      setError(handleError(err));
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const resendVerificationEmail = async () => {
    setError(null);
    setIsLoading(true);
    try {
      await sendEmailVerification(user);
    } catch (err) {
      console.error(err);
      setError(handleError(err));
    } finally {
      setIsLoading(false);
    }
  };

  return { 
    signUp, 
    login,
    signInWithGoogle, 
    logout, 
    changePassword,
    resendVerificationEmail,
    isLoading, 
    error, 
    defaultValue 
  };
};
