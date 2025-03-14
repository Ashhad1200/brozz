import { useState } from 'react';

import moment from 'moment';

import {
  writeBatch,
  doc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  addDoc,
  increment,
  serverTimestamp
} from 'firebase/firestore';

import { db } from '../firebase/firebase-config';

import { useAuthContext } from './useAuthContext';
import { useCartContext } from './useCartContext';
import { useCheckoutContext } from './useCheckoutContext';
import { useCart } from './useCart';
import { useCheckout } from './useCheckout';

import { handleError } from 'helpers/error/handleError';

export const useOrder = () => {
  const { user } = useAuthContext();
  const { items } = useCartContext();
  const { email, shippingAddress, shippingOption, shippingCost } =
    useCheckoutContext();
  const { deleteCart } = useCart();
  const { deleteCheckoutSession } = useCheckout();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const ordersRef = collection(db, 'orders');

  const createOrder = async (paymentInfo, billingAddress) => {
    setError(null);
    setIsLoading(true);
    
    const batch = writeBatch(db);
    
    try {
      // Update inventory
      for (const item of items) {
        const skuRef = doc(
          collection(db, 'products', item.productId, 'skus'),
          item.skuId
        );
        batch.update(skuRef, { 
          quantity: increment(-item.quantity),
          lastUpdated: serverTimestamp()
        });
      }

      // Commit inventory updates
      await batch.commit();

      // Create order
      const orderData = {
        createdAt: serverTimestamp(),
        items,
        email,
        shippingAddress,
        shippingOption,
        shippingCost,
        paymentInfo,
        billingAddress,
        createdBy: user.uid,
        status: 'pending',
        total: items.reduce((sum, item) => sum + (item.price * item.quantity), 0) + shippingCost
      };

      const orderRef = await addDoc(ordersRef, orderData);

      // Clean up cart and checkout session
      await Promise.all([
        deleteCart(),
        deleteCheckoutSession()
      ]);

      setIsLoading(false);
      return orderRef.id;
    } catch (err) {
      console.error(err);
      setError(handleError(err));
      setIsLoading(false);
      return null;
    }
  };

  const getOrders = async () => {
    setError(null);
    setIsLoading(true);

    try {
      const q = query(
        ordersRef,
        where('createdBy', '==', user.uid),
        orderBy('createdAt', 'desc')
      );

      const querySnapshot = await getDocs(q);
      const orders = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        createdAt: doc.data().createdAt?.toDate() || null
      }));

      setIsLoading(false);
      return orders;
    } catch (err) {
      console.error(err);
      setError(handleError(err));
      setIsLoading(false);
      return [];
    }
  };

  return { createOrder, getOrders, isLoading, error };
};
