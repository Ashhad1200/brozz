import { useState, useEffect } from 'react';
import styles from './index.module.scss';
import { ProductSlider } from '../../../common';
import { useCollection } from '../../../../hooks/useCollection';

const ProductSliderSection = ({ titleTop, titleBottom, sortBy }) => {
  const { getCollection } = useCollection();
  const [slides, setSlides] = useState([]);
  console.log('ProductSliderSection', slides);
  useEffect(() => {
    const fetchData = async () => {
      try {
        const fetchedVariants = await getCollection({ sortBy });

        if (Array.isArray(fetchedVariants)) {
          setSlides(
            fetchedVariants.sort((a, b) => (a.color || '').localeCompare(b.color || ''))
          );
        } else {
          setSlides([]);
        }
      } catch (error) {
        console.error("Error fetching collection:", error);
        setSlides([]);
      }
    };

    fetchData();
  }, [sortBy, getCollection]);

  return (
    <section className={styles.section}>
      <div className={`${styles.container} main-container`}>
        {titleTop && <p className={styles.section_title_top}>{titleTop}</p>}
        {titleBottom && (
          <h1 className={styles.section_title_bottom}>{titleBottom}</h1>
        )}
        <div className={styles.carousel_container}>
          <ProductSlider
            slides={slides}
            slidesPerView="auto"
            spaceBetween={20}
            pagination={false}
            sliderClassName={styles.slider}
            slideClassName={styles.slide}
            fillClassName={styles.fill}
          />
        </div>
      </div>
    </section>
  );
};

export default ProductSliderSection;
