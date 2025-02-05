import { create } from 'zustand';

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: 'tshirts' | 'trousers' | 'glasses';
  image: string;
}

interface ProductStore {
  products: Product[];
}

export const products: Product[] = [
  {
    id: '1',
    name: 'Urban Tech Tee',
    description: 'Premium cotton blend t-shirt with modern street design',
    price: 49.99,
    category: 'tshirts',
    image: 'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&q=80',
  },
  {
    id: '2',
    name: 'Street Cargo Pants',
    description: 'Functional cargo pants with multiple pockets',
    price: 89.99,
    category: 'trousers',
    image: 'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&q=80',
  },
  {
    id: '3',
    name: 'Retro Shades',
    description: 'Classic sunglasses with modern twist',
    price: 129.99,
    category: 'glasses',
    image: 'https://images.unsplash.com/photo-1577803645773-f96470509666?auto=format&fit=crop&q=80',
  },
  {
    id: '4',
    name: 'Essential Tee',
    description: 'Minimalist design t-shirt for everyday wear',
    price: 39.99,
    category: 'tshirts',
    image: 'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80',
  },
  {
    id: '5',
    name: 'Tech Cargo Joggers',
    description: 'Modern joggers with cargo pockets',
    price: 79.99,
    category: 'trousers',
    image: 'https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&q=80',
  },
  {
    id: '6',
    name: 'Aviator Glasses',
    description: 'Classic aviator style sunglasses',
    price: 149.99,
    category: 'glasses',
    image: 'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&q=80',
  },
];

export const useProductStore = create<ProductStore>()(() => ({
  products,
}));