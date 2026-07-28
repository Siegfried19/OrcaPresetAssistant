import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './App'
import { I18nProvider } from './i18n/I18nProvider'
import './styles/tokens.css'
import './styles/app.css'

const rootElement = document.getElementById('root')
if (!rootElement) {
  throw new Error('Application root was not found.')
}

createRoot(rootElement).render(
  <StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </StrictMode>,
)
