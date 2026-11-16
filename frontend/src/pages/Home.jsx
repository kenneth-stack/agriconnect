import { Link } from 'react-router-dom';

const paths = [
  ['🌱', 'Register as a farmer', '/login?role=farmer'],
  ['💰', 'Become an investor', '/login?role=investor'],
  ['🚜', 'Hire equipment', '/equipment'],
  ['🛒', 'Buy produce', '/marketplace']
];

export default function Home({ easy }) {
  return (
    <section className="hero">
      <h1>Connecting farmers to capital, technology and markets.</h1>
      {!easy && <p>Sell directly to buyers, get funded for your next season and book a tractor or drone.</p>}
      <div className="paths">
        {paths.map(([icon, label, to]) => (
          <Link key={to} to={to} className="path"><span aria-hidden>{icon}</span>{label}</Link>
        ))}
      </div>
    </section>
  );
}
