import { BrowserRouter, Routes, Route, useParams } from 'react-router-dom';
import { useAuthProvider, AuthProvider } from './hooks/useAuth';
import { Header } from './components/Header';
import { Welcome } from './components/Welcome';
import { Dashboard } from './components/Dashboard';
import { LiveSession } from './components/LiveSession';
import './App.css';

// Live session page wrapper
function LiveSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  // Get token from localStorage or URL params
  const token = localStorage.getItem('discord_token') ||
                new URLSearchParams(window.location.search).get('token') ||
                undefined;

  // Store token if passed via URL
  if (token && !localStorage.getItem('discord_token')) {
    localStorage.setItem('discord_token', token);
    // Clean URL
    window.history.replaceState({}, '', window.location.pathname);
  }

  if (!sessionId) {
    return <div className="error">Session ID required</div>;
  }

  return <LiveSession sessionId={sessionId} token={token} />;
}

function AppContent() {
  const auth = useAuthProvider();

  return (
    <AuthProvider value={auth}>
      <div id="app">
        <Header />
        <main className="main">
          <div className="container">
            <Routes>
              {/* Live session route - accessible without full auth */}
              <Route path="/live/:sessionId" element={<LiveSessionPage />} />

              {/* Main app routes */}
              <Route path="*" element={
                auth.isLoading ? (
                  <div className="loading">Loading...</div>
                ) : auth.isAuthenticated ? (
                  <Dashboard />
                ) : (
                  <Welcome />
                )
              } />
            </Routes>
          </div>
        </main>
      </div>
    </AuthProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
