import { redirect } from 'next/navigation';
import { getSessionUser,isVerifiedPlatformUser } from '@/lib/server/session';
import { FeedbackForm } from './feedback-form';
export const dynamic='force-dynamic';
export default async function Page(){const user=await getSessionUser();if(!isVerifiedPlatformUser(user))redirect('/login');return <FeedbackForm/>;}
