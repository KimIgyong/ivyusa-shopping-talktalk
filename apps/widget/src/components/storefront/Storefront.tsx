import { ShoppingBag, Star } from 'lucide-react';

export function Storefront() {
  return (
    <div className="min-h-full bg-gray-50">
      {/* Nav */}
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2 text-lg font-bold text-gray-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-500 text-white">
              I
            </span>
            IVY USA
          </div>
          <nav className="hidden gap-6 text-sm text-gray-600 sm:flex">
            <a href="#" className="hover:text-primary-600">Shop</a>
            <a href="#" className="hover:text-primary-600">Best Sellers</a>
            <a href="#" className="hover:text-primary-600">About</a>
          </nav>
          <button className="flex items-center gap-1.5 rounded-lg bg-gray-100 px-3 py-1.5 text-sm font-medium text-gray-700">
            <ShoppingBag className="h-4 w-4" />
            Cart
          </button>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-5xl px-6 py-16 text-center">
        <span className="inline-block rounded-lg bg-primary-500/10 px-3 py-1 text-xs font-semibold text-primary-600">
          New season · Free US shipping
        </span>
        <h1 className="mt-4 text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          Clean beauty, delivered.
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-gray-500">
          Dermatologist-tested skincare made with simple, effective
          ingredients. Loved by thousands across the US.
        </p>
        <button className="mt-6 rounded-lg bg-primary-500 px-6 py-3 text-sm font-semibold text-white hover:bg-primary-600">
          Shop the collection
        </button>
      </section>

      {/* Product card */}
      <section className="mx-auto max-w-5xl px-6 pb-24">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Featured</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { name: 'Hydra Glow Serum', price: '$32.00', tag: 'Best seller' },
            { name: 'Gentle Foam Cleanser', price: '$18.00', tag: null },
            { name: 'Barrier Repair Cream', price: '$28.00', tag: 'New' },
          ].map((p) => (
            <div
              key={p.name}
              className="overflow-hidden rounded-xl border border-gray-200 bg-white"
            >
              <div className="flex h-40 items-center justify-center bg-gradient-to-br from-primary-400/20 to-primary-500/10 text-primary-400">
                <ShoppingBag className="h-10 w-10" />
              </div>
              <div className="p-4">
                {p.tag && (
                  <span className="mb-1 inline-block rounded bg-primary-500/10 px-2 py-0.5 text-[10px] font-semibold text-primary-600">
                    {p.tag}
                  </span>
                )}
                <div className="font-medium text-gray-900">{p.name}</div>
                <div className="mt-0.5 flex items-center gap-1 text-xs text-warning">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className="h-3 w-3 fill-warning" />
                  ))}
                  <span className="text-gray-400">(128)</span>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-semibold text-gray-900">{p.price}</span>
                  <button className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-gray-800">
                    Add to cart
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
