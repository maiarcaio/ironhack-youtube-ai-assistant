import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthGate } from './components/auth/AuthGate.tsx'
import { NotesProvider } from './features/notes/NotesProvider.tsx'
import type { NotesOwner } from './features/notes/notesStorage.ts'

const useMockApi = import.meta.env.VITE_USE_MOCK_API === 'true'

function resolveNotesOwner(
  userId: string | undefined,
): NotesOwner {
  if (useMockApi) return { kind: 'mock' }
  if (!userId) return null
  return { kind: 'user', userId }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthGate>{(session) => {
      const owner = resolveNotesOwner(session?.user.id)
      const ownerKey = owner?.kind === 'user'
        ? `user:${owner.userId}`
        : owner?.kind ?? 'disabled'

      return (
        <NotesProvider key={ownerKey} owner={owner}>
          <App key={ownerKey} session={session} />
        </NotesProvider>
      )
    }}</AuthGate>
  </StrictMode>,
)
