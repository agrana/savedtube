import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getUserProgress } from '@/lib/actions';
import { redirect } from 'next/navigation';

interface ServerPlaylistProgressProps {
  playlistId: string;
  children: (progress: unknown[]) => React.ReactNode;
}

export default async function ServerPlaylistProgress({
  playlistId,
  children,
}: ServerPlaylistProgressProps) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    redirect('/');
  }

  try {
    const progress = await getUserProgress(playlistId);
    return <>{children(progress)}</>;
  } catch (error) {
    console.error('Error fetching progress in server component:', error);
    return <>{children([])}</>;
  }
}
