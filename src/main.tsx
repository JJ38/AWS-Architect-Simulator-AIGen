import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/main.css'
import Layout from './Components/Layout.tsx'

createRoot(document.getElementById('root')!).render(

  <StrictMode>
    <Layout/>
  </StrictMode>,
  
)
