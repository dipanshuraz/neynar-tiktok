import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div className="text-center">
        <h2 className="text-white text-6xl font-bold mb-4">404</h2>
        <p className="text-white/60 text-xl mb-8">Page not found</p>
        <Link
          href="/"
          className="inline-block px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}

