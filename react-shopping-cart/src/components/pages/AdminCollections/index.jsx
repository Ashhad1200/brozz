import { useState, useEffect } from 'react';

import { useCollection } from 'hooks/useCollection';
import { useAdmin } from 'hooks/useAdmin';

import { Loader, ConfirmModal, ProductCard } from 'components/common';

import styles from './index.module.scss';

const AdminCollections = () => {
  const { getCollection } = useCollection();
  const { deleteVariant, isLoading } = useAdmin();

  const [products, setProducts] = useState(null);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [productToBeDeleted, setProductToBeDeleted] = useState(null);

  useEffect(() => {
    if (!products) {
      const fetchProducts = async () => {
        const fetchedProducts = await getCollection({ limit: 100 });
        setProducts(fetchedProducts);
      };

      fetchProducts();
    }
  }, [products]);

  const handleDeleteStart = ({ productId, variantId }) => {
    setProductToBeDeleted({ productId, variantId });
    setIsConfirmOpen(true);
  };

  const handleDeleteOnConfirm = async () => {
    setIsConfirmOpen(false);
    await deleteVariant(productToBeDeleted);
    setProducts(null); // Refresh products list
  };

  const closeConfirm = () => {
    setIsConfirmOpen(false);
    setProductToBeDeleted(null);
  };

  return (
    <>
      <ConfirmModal
        show={isConfirmOpen}
        close={closeConfirm}
        handleConfirm={handleDeleteOnConfirm}
        text="Are you sure you want to delete this variant? If product only has this variant, the whole product will be deleted."
      />
      {(!products || isLoading) && <Loader />}
      {products && (
        <section>
          <div className={`${styles.container} main-container`}>
            <h1>Admin Products/Variants</h1>
            <div className={styles.products_wrapper}>
              {products.length === 0 && (
                <p>No products yet. Add one or seed the demo catalog.</p>
              )}
              {products.map((productVariant) => (
                <ProductCard
                  key={productVariant.id}
                  productId={productVariant.productId}
                  variantId={productVariant.variantId}
                  model={productVariant.model}
                  color={productVariant.color}
                  discount={productVariant.discount}
                  currentPrice={productVariant.price}
                  actualPrice={productVariant.actualPrice}
                  type={productVariant.type}
                  slides={productVariant.slides}
                  numberOfVariants={productVariant.numberOfVariants}
                  skus={productVariant.skus}
                  isSoldOut={productVariant.isSoldOut}
                  allVariants={productVariant.allVariants}
                  handleDeleteStart={handleDeleteStart}
                  isAdmin={true}
                />
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  );
};

export default AdminCollections;
