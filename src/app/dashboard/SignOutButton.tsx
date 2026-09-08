'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';

export function SignOutButton() {
  const router = useRouter();
  const [isSigningOut, setIsSigningOut] = useState(false);

  const handleSignOut = async () => {
    try {
      setIsSigningOut(true);
      await fetch('/api/auth/signout', {
        method: 'POST',
      });
      router.push('/auth');
      router.refresh();
    } catch {
      router.push('/auth');
    } finally {
      setIsSigningOut(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleSignOut}
      disabled={isSigningOut}
      className="btn-secondary"
      id="dashboard-signout-button"
    >
      {isSigningOut ? 'Signing out...' : 'Sign out'}
    </button>
  );
}
