import EmployeesClient from './EmployeesClient'

export const dynamic = 'force-dynamic'

export default function EmployeesPage() {
  return (
    <main style={{ padding: '2rem', maxWidth: 900, margin: '0 auto' }}>
      <h1 style={{ fontSize: '1.6rem', marginBottom: '1rem' }}>Employees</h1>
      <EmployeesClient />
    </main>
  )
}


