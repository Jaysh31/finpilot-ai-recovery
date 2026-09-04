import { Link } from 'react-router-dom';

export default function Navbar() {
  return (
    <nav className="bg-blue-600 text-white p-4 shadow-lg">
      <div className="container mx-auto flex gap-6">
        <Link to="/" className="hover:text-blue-200 transition">Dashboard</Link>
        <Link to="/upload" className="hover:text-blue-200 transition">Upload</Link>
        <Link to="/reconcile" className="hover:text-blue-200 transition">Reconcile</Link>
        <Link to="/exceptions" className="hover:text-blue-200 transition">Exceptions</Link>
        <Link to="/export" className="hover:text-blue-200 transition">Export</Link>
      </div>
    </nav>
  );
}