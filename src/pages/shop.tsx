import { useState } from 'react';
import { useProductStore, type Product } from '@/store/products';
import { ProductCard } from '@/components/shop/product-card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Category = Product['category'] | 'all';

const categories: { value: Category; label: string }[] = [
  { value: 'all', label: 'All Products' },
  { value: 'tshirts', label: 'T-Shirts' },
  { value: 'trousers', label: 'Trousers' },
  { value: 'glasses', label: 'Glasses' },
];

export function Shop() {
  const [selectedCategory, setSelectedCategory] = useState<Category>('all');
  const products = useProductStore((state) => state.products);

  const filteredProducts =
    selectedCategory === 'all'
      ? products
      : products.filter((product) => product.category === selectedCategory);

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Hero Section */}
      <div className="relative h-[300px] -mt-8 mb-12 rounded-lg overflow-hidden">
        <img
          src="https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&q=80"
          alt="Shop Banner"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
          <div className="text-center text-white">
            <h1 className="text-4xl md:text-5xl font-bold mb-4">Our Collection</h1>
            <p className="text-lg md:text-xl">
              Discover the latest in street fashion
            </p>
          </div>
        </div>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-4 mb-8">
        {categories.map((category) => (
          <Button
            key={category.value}
            onClick={() => setSelectedCategory(category.value)}
            variant={selectedCategory === category.value ? 'default' : 'outline'}
            className={cn(
              'min-w-[100px]',
              selectedCategory === category.value
                ? ''
                : 'hover:bg-gray-100 hover:text-black'
            )}
          >
            {category.label}
          </Button>
        ))}
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredProducts.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>

      {filteredProducts.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">
            No products found in this category.
          </p>
        </div>
      )}
    </div>
  );
}