import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/auth/requireSession';
import { prisma } from '@/lib/prisma';
import { SignOutButton } from './SignOutButton';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  // Server-side session guard (AGENTS.md §3 rule 8 / FR8 / Tech Req 10)
  const session = await requireSession();

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
  });

  if (!user) {
    redirect('/auth');
  }

  // Dashboard contains the user's name/email and a sign out button ONLY (PRD §3 Non-Goals)
  return (
    <main className="dashboard-container">
      <div className="dashboard-card">
        <p className="dashboard-text">
          Welcome, <strong>{user.fullName || user.email}</strong>
        </p>
        {user.fullName && (
          <p className="dashboard-subtext" style={{ fontSize: '0.875rem', opacity: 0.8, marginBottom: '1rem' }}>
            Signed in as {user.email}
          </p>
        )}
        <SignOutButton />
      </div>
    </main>
  );
}
