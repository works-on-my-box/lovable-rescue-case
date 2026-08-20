import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="container">
      <div className="card">
        <h1>Page not found</h1>
        <p className="muted">The address may be wrong, or the page has moved.</p>
        <Link to="/tasks">Go to tasks</Link>
      </div>
    </div>
  );
}
