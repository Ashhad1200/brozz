import { useState } from 'react';

import { handleError } from 'helpers/error/handleError';
import { api } from '../api/client';

const fileNameFromSrc = (src) => src.split('/').pop();

export const useAdmin = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);

  const skuSizeCode = {
    s: 'sm',
    m: 'md',
    l: 'lg',
    xl: 'xl',
    xxl: 'xx',
  };

  // Runs an admin request with shared loading/error handling.
  const run = async (request, fallback = null) => {
    setError(null);
    setIsLoading(true);
    try {
      return await request();
    } catch (err) {
      console.error(err);
      setError(handleError(err));
      return fallback;
    } finally {
      setIsLoading(false);
    }
  };

  // Uploads images to the API's /uploads storage; skips names already present.
  const uploadFiles = async (directory, { currentFiles, newFiles }) => {
    setError(null);
    setUploadProgress(0);

    const existingNames = currentFiles.map((image) => image.name);
    const filesToUpload = newFiles.filter(
      (file) =>
        file.type.startsWith('image/') && !existingNames.includes(file.name)
    );
    if (filesToUpload.length === 0) return currentFiles;

    const formData = new FormData();
    for (const file of filesToUpload) formData.append('images', file);

    try {
      const { images } = await api('/admin/uploads', {
        method: 'POST',
        formData,
      });
      setUploadProgress(100);
      return [...currentFiles, ...images];
    } catch (err) {
      console.error('Upload files error:', err);
      setError(handleError(err));
      return currentFiles;
    }
  };

  // Removes an uploaded image that was never saved to a product.
  const deleteFile = async (directory, file) => {
    if (!file?.src) return;
    try {
      await api(`/admin/uploads/${fileNameFromSrc(file.src)}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.error(err);
      setError(handleError(err));
    }
  };

  const getProduct = (productId) =>
    run(async () => (await api(`/admin/products/${productId}`)).product);

  const createProduct = ({ productData, variants, images }) =>
    run(() =>
      api('/admin/products', {
        method: 'POST',
        body: { product: productData, variants, images },
      })
    );

  const editProduct = ({ productData, variants, images }) =>
    run(() =>
      api(`/admin/products/${productData.id}`, {
        method: 'PUT',
        body: { product: productData, variants, images },
      })
    );

  const deleteVariant = ({ productId, variantId }) =>
    run(() =>
      api(`/admin/products/${productId}/variants/${variantId}`, {
        method: 'DELETE',
      })
    );

  const deleteProduct = (productId) =>
    run(() => api(`/admin/products/${productId}`, { method: 'DELETE' }));

  return {
    uploadFiles,
    deleteFile,
    createProduct,
    editProduct,
    deleteVariant,
    deleteProduct,
    getProduct,
    isLoading,
    error,
    uploadProgress,
    skuSizeCode,
  };
};
