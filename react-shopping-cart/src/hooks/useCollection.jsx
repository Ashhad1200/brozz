import { useState, useRef } from "react";
import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  startAfter,
  limit,
  getCountFromServer,
} from "firebase/firestore";

import { db } from "../firebase/firebase-config";

const ITEMS_PER_PAGE = 4;

export const useCollection = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  const latestDoc = useRef();

  const getCollection = async (options = {}) => {
    const {
      collectionName = "products",
      isNewQuery = true,
      sortBy = { field: "createdAt", direction: "asc" },
    } = options;

    setError(null);
    setIsLoading(true);

    try {
      const productsRef = collection(db, collectionName); // ✅ Dynamic collection
      let constraints = [];

      if (isNewQuery) {
        latestDoc.current = null;
        setHasMore(true);

        // ✅ Count total matching documents
        const countQuery = query(productsRef);
        const snapshot = await getCountFromServer(countQuery);
        setTotalCount(snapshot.data().count || 0);
      }

      // ✅ Apply sorting
      if (sortBy.field && sortBy.field !== "price") {
        constraints.push(orderBy(sortBy.field, sortBy.direction));
      }

      if (latestDoc.current) {
        constraints.push(startAfter(latestDoc.current));
      }

      constraints.push(limit(ITEMS_PER_PAGE));

      const productsQuery = query(productsRef, ...constraints);
      const productsSnapshot = await getDocs(productsQuery);

      if (productsSnapshot.empty) {
        setHasMore(false);
        setIsLoading(false);
        return [];
      }

      latestDoc.current =
        productsSnapshot.docs[productsSnapshot.docs.length - 1];
      setHasMore(productsSnapshot.docs.length === ITEMS_PER_PAGE);

      let products = productsSnapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // ✅ Fix in-memory price sorting
      if (sortBy.field === "price") {
        products = products.sort((a, b) => {
          const priceA = a.price || 0;
          const priceB = b.price || 0;
          return sortBy.direction === "asc" ? priceA - priceB : priceB - priceA;
        });
      }

      setIsLoading(false);
      return products;
    } catch (err) {
      console.error("Error fetching collection:", err);
      setError(err);
      setIsLoading(false);
      return [];
    }
  };

  return { getCollection, isLoading, error, hasMore, totalCount };
};
