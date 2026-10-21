import { useReducer, useEffect } from 'react';

import { useParams, useLocation, useNavigate } from 'react-router-dom';

import ProductContext from './product-context';
import { api } from '../../api/client';

const initialState = {
  productIsReady: false,
  selectedProduct: null,
  selectedVariant: null,
  selectedSkuId: '',
  selectedSize: '',
  singleSize: null,
};

const productReducer = (state, action) => {
  const { type, payload } = action;

  switch (type) {
    case 'CLEAR_PRODUCT': {
      return {
        ...initialState,
      };
    }

    case 'SET_PRODUCT': {
      return {
        ...state,
        productIsReady: true,
        selectedProduct: payload.product,
        selectedVariant: payload.variant,
      };
    }

    case 'SELECT_VARIANT': {
      return {
        ...state,
        selectedVariant: payload,
        selectedSkuId: '',
        selectedSize: '',
      };
    }

    case 'SELECT_SIZE': {
      return {
        ...state,
        selectedSkuId: payload.skuId,
        selectedSize: payload.value,
      };
    }

    case 'SINGLE_SIZE': {
      return {
        ...state,
        singleSize: { quantity: payload.quantity },
        selectedSkuId: payload.selectedSkuId,
      };
    }

    default: {
      return state;
    }
  }
};

const ProductProvider = ({ children }) => {
  const { id: slugId } = useParams();
  const { pathname, state: slugState } = useLocation();
  const navigate = useNavigate();

  const [state, dispatch] = useReducer(productReducer, initialState);

  const getProduct = async () => {
    try {
      const { product, variantId } = await api(
        `/products/slug/${encodeURIComponent(slugId)}`
      );
      const selectedVariant = product.variants.find(
        (variant) => variant.variantId === variantId
      );

      if (selectedVariant.sizes.length === 1) {
        dispatch({
          type: 'SINGLE_SIZE',
          payload: {
            selectedSkuId: selectedVariant.sizes[0].skuId,
            quantity: selectedVariant.sizes[0].quantity,
          },
        });
      }

      return { product, variant: selectedVariant };
    } catch (err) {
      if (err.status !== 404) console.error(err);
      return { product: null, variant: null };
    }
  };

  useEffect(() => {
    if (slugState) {
      navigate({ pathname, state: null });
    } else {
      if (state.productIsReady) {
        dispatch({ type: 'CLEAR_PRODUCT' });
      }
      const fetchProduct = async () => {
        const { product, variant } = await getProduct();

        dispatch({ type: 'SET_PRODUCT', payload: { product, variant } });
      };

      fetchProduct();
    }
  }, [slugId, slugState]);

  return (
    <ProductContext.Provider value={{ ...state, dispatch }}>
      {children}
    </ProductContext.Provider>
  );
};

export default ProductProvider;
