import { useState, useRef, useCallback } from 'react';

import { api } from '../api/client';

const ITEMS_PER_PAGE = 8;

// Fetches storefront cards (one per product variant) page by page.
export const useCollection = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState(0);

  const offset = useRef(0);

  const getCollection = useCallback(async (options = {}) => {
    const {
      collectionName = 'products',
      isNewQuery = true,
      sortBy = { field: 'createdAt', direction: 'asc' },
      limit = ITEMS_PER_PAGE,
    } = options;

    setError(null);
    setIsLoading(true);

    if (isNewQuery) {
      offset.current = 0;
      setHasMore(true);
    }

    try {
      const params = new URLSearchParams({
        collection: collectionName,
        sort: sortBy.field === 'price' ? 'price' : 'createdAt',
        direction: sortBy.direction === 'desc' ? 'desc' : 'asc',
        offset: String(offset.current),
        limit: String(limit),
      });

      const { items, total, hasMore: more } = await api(`/products?${params}`);

      offset.current += items.length;
      setTotalCount(total);
      setHasMore(more);
      return items;
    } catch (err) {
      console.error('Error fetching collection:', err);
      setError(err);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { getCollection, isLoading, error, hasMore, totalCount };
};
