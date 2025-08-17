# SavedTube

A distraction-free YouTube playlist player built with Next.js, Supabase, and Google OAuth.

## Features

- 🔐 Secure Google OAuth authentication with YouTube API access
- 🎯 Distraction-free video player interface
- 📱 Responsive design with modern UI
- 🔒 Row Level Security (RLS) for data protection
- 🚀 Deployed on Vercel with Supabase backend

## Tech Stack

- **Frontend**: Next.js 14, TypeScript, Tailwind CSS
- **Backend**: Supabase (PostgreSQL, Auth, Storage)
- **Authentication**: NextAuth.js with Google OAuth
- **Deployment**: Vercel
- **Database**: PostgreSQL with RLS policies

## Getting Started

### Prerequisites

- Node.js 18+ 
- Supabase CLI
- Google Cloud Console access
- Vercel account

### 1. Clone and Setup

```bash
git clone <your-repo-url>
cd savedtube
npm install
```

### 2. Supabase Setup

1. **Create Supabase Project**
   - Go to [supabase.com](https://supabase.com)
   - Create a new project
   - Note down your project URL and anon key

2. **Apply Database Schema**
   ```bash
   # Link to your Supabase project
   supabase link --project-ref your-project-ref
   
   # Apply migrations
   supabase db push
   ```

3. **Configure Auth Settings**
   - In Supabase Dashboard → Authentication → Settings
   - Add your domain to Site URL (localhost:3000 for development)
   - Configure redirect URLs

### 3. Google OAuth Setup

1. **Create Google Cloud Project**
   - Go to [Google Cloud Console](https://console.cloud.google.com)
   - Create a new project or select existing one

2. **Enable Required APIs**
   - Go to APIs & Services → Library
   - Search for and enable these APIs:
     - **YouTube Data API v3** (for accessing playlists and videos)
     - **Google Identity and Access Management (IAM) API** (for OAuth)

3. **Create OAuth Credentials**
   - Go to APIs & Services → Credentials
   - Create OAuth 2.0 Client ID
   - Application type: Web application
   - Add authorized redirect URIs:
     - `http://localhost:3000/api/auth/callback/google` (development)
     - `https://your-domain.vercel.app/api/auth/callback/google` (production)

4. **Configure OAuth Consent Screen**
   - Go to APIs & Services → OAuth consent screen
   - User Type: External (or Internal if using Google Workspace)
   - App name: "SavedTube"
   - User support email: your email
   - Developer contact information: your email
   - Add scopes:
     - `openid`
     - `email`
     - `profile`
     - `https://www.googleapis.com/auth/youtube.readonly`

### 4. Environment Variables

Copy `env.example` to `.env.local` and fill in your values:

```bash
cp env.example .env.local
```

Required variables:
- `NEXT_PUBLIC_SUPABASE_URL`: Your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Your Supabase anon key
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key
- `GOOGLE_CLIENT_ID`: Your Google OAuth client ID
- `GOOGLE_CLIENT_SECRET`: Your Google OAuth client secret
- `NEXTAUTH_SECRET`: Generate with `openssl rand -base64 32`
- `NEXTAUTH_URL`: Your app URL (localhost:3000 for development)

### 5. Run Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to see your app.

### 6. Deploy to Vercel

1. **Push to GitHub**
   ```bash
   git add .
   git commit -m "Initial setup"
   git push origin main
   ```

2. **Deploy on Vercel**
   - Connect your GitHub repository
   - Add environment variables in Vercel dashboard
   - Deploy

## Security Features

- **Row Level Security (RLS)**: Users can only access their own data
- **JWT Authentication**: Secure session management
- **OAuth 2.0**: Industry-standard authentication
- **Environment Variables**: Secure credential management
- **CORS Protection**: Configured for production domains

## Database Schema

The application uses a secure `profiles` table with:
- UUID primary key linked to Supabase Auth users
- Automatic profile creation on signup
- RLS policies for data isolation
- Indexes for performance optimization

## Next Steps

1. **YouTube API Integration**: Fetch user playlists and videos
2. **Video Player**: Build distraction-free player interface
3. **AI Tagging**: Add automatic video categorization
4. **Search & Filter**: Implement advanced search functionality
5. **Sharing**: Add playlist sharing features

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
