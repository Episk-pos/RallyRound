import { useAuthProvider, AuthProvider } from './hooks/useAuth';
import { Header } from './components/Header';
import { Welcome } from './components/Welcome';
import { Dashboard } from './components/Dashboard';
import './App.css';

function AppContent() {
  const auth = useAuthProvider();

  return (
    <AuthProvider value={auth}>
      <div id="app">
        <Header />
        <main className="main">
          <div className="container">
            {auth.isLoading ? (
              <div className="loading">Loading...</div>
            ) : auth.isAuthenticated ? (
              <Dashboard />
            ) : (
              <Welcome />
            )}
          </div>
        </main>
      </div>
    </AuthProvider>
  );
}

function App() {
  return <AppContent />;
}

export default App;
