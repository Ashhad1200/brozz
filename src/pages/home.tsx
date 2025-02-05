import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export function Home() {
  return (
    <div>
      {/* Hero Section */}
      <section
        className="h-screen bg-cover bg-center flex items-center"
        style={{
          backgroundImage:
            'url(https://images.unsplash.com/photo-1523398002811-999ca8dec234?auto=format&fit=crop&q=80)',
        }}
      >
        <div className="container mx-auto px-4">
          <div className="max-w-2xl">
            <h1 className="text-5xl md:text-7xl font-bold text-white mb-6">
              BROZZ Streetwear
            </h1>
            <p className="text-xl text-white mb-8">
              Elevate your style with our premium streetwear collection
            </p>
            <Button size="lg" asChild>
              <Link to="/shop">
                Shop Now <ArrowRight className="ml-2 h-5 w-5" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Featured Categories */}
      <section className="py-20">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">
            Featured Categories
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                title: 'T-Shirts',
                image:
                  'https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&q=80',
              },
              {
                title: 'Trousers',
                image:
                  'https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&q=80',
              },
              {
                title: 'Glasses',
                image:
                  'https://images.unsplash.com/photo-1511499767150-a48a237f0083?auto=format&fit=crop&q=80',
              },
            ].map((category) => (
              <Link
                key={category.title}
                to="/shop"
                className="group relative overflow-hidden rounded-lg"
              >
                <div className="aspect-square">
                  <img
                    src={category.image}
                    alt={category.title}
                    className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-110"
                  />
                </div>
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                  <h3 className="text-2xl font-bold text-white">{category.title}</h3>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Latest Drops */}
      <section className="py-20 bg-black text-white">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-12">Latest Drops</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              {
                name: 'Urban Tech Tee',
                price: 49.99,
                image:
                  'https://images.unsplash.com/photo-1583743814966-8936f5b7be1a?auto=format&fit=crop&q=80',
              },
              {
                name: 'Street Cargo Pants',
                price: 89.99,
                image:
                  'https://images.unsplash.com/photo-1624378439575-d8705ad7ae80?auto=format&fit=crop&q=80',
              },
              {
                name: 'Retro Shades',
                price: 129.99,
                image:
                  'https://images.unsplash.com/photo-1577803645773-f96470509666?auto=format&fit=crop&q=80',
              },
              {
                name: 'Urban Hoodie',
                price: 79.99,
                image:
                  'https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&q=80',
              },
            ].map((product) => (
              <div key={product.name} className="group">
                <div className="aspect-square rounded-lg overflow-hidden mb-4">
                  <img
                    src={product.image}
                    alt={product.name}
                    className="object-cover w-full h-full transition-transform duration-300 group-hover:scale-110"
                  />
                </div>
                <h3 className="font-semibold mb-2">{product.name}</h3>
                <p className="text-gray-400">${product.price}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}