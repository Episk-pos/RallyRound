import { useAuth } from '../hooks/useAuth';
import { NotificationBell } from './NotificationBell';

export function Header() {
  const { googleUser, isAuthenticated, isLoading, login, logout } = useAuth();

  return (
    <header className="header">
      <div className="container">
        <h1 className="logo">RallyRound</h1>
        <nav className="nav">
          {isLoading ? (
            <span>Loading...</span>
          ) : isAuthenticated && googleUser ? (
            <div className="user-info">
              <NotificationBell />
              {googleUser.picture && (
                <img src={googleUser.picture} alt="Avatar" className="avatar" />
              )}
              <span className="user-name">{googleUser.name}</span>
              <button onClick={logout} className="btn btn-secondary">
                Logout
              </button>
            </div>
          ) : (
            <button onClick={login} className="btn btn-primary">
              Sign in with Google
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
