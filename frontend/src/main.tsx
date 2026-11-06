import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthGate } from './components/auth/AuthGate.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>{(session) => <App key={session?.user.id ?? 'mock'} session={session} />}</AuthGate>
  </StrictMode>,
)
