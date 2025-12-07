import { useAuth } from '../hooks/useAuth';

export function Welcome() {
  const { login } = useAuth();

  return (
    <section className="section welcome">
      <h2>Welcome to RallyRound</h2>
      <p>A decentralized platform for organizing community presentations and discussions.</p>
      <p>Sign in with Google to get started.</p>
      <button className="btn btn-primary btn-large" onClick={login}>
        Sign in with Google
      </button>
    </section>
  );
}
