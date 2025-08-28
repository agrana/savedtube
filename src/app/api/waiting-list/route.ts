import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRateLimiter } from '@/lib/rate-limit';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Rate limiting: 5 submissions per IP per hour
const waitingListRateLimit = createRateLimiter({
  maxRequests: 5,
  windowMs: 60 * 60 * 1000, // 1 hour
});

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = waitingListRateLimit(request);
    if (rateLimitResult) {
      return rateLimitResult;
    }

    const { email } = await request.json();

    // Validate email
    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // Basic email validation
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const { data: existingEmail } = await supabase
      .from('waiting_list')
      .select('email')
      .eq('email', email.toLowerCase())
      .single();

    if (existingEmail) {
      return NextResponse.json(
        { error: 'This email is already on the waiting list' },
        { status: 409 }
      );
    }

    // Insert email into waiting list
    const { error } = await supabase
      .from('waiting_list')
      .insert([{ email: email.toLowerCase() }]);

    if (error) {
      console.error('Error adding to waiting list:', error);
      return NextResponse.json(
        { error: 'Failed to add to waiting list. Please try again.' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Successfully added to waiting list!' },
      { status: 201 }
    );
  } catch (error) {
    console.error('Waiting list submission error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
