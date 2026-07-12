import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, Router as WouterRouter } from 'wouter';

import { Layout } from '@/components/layout';
import AuthPage from '@/pages/auth';
import OnboardingPage from '@/pages/onboarding';
import DashboardPage from '@/pages/dashboard';
import PracticePage from '@/pages/practice';
import LearnPage from '@/pages/learn';
import LessonPage from '@/pages/lesson';
import ProfilePage from '@/pages/profile';
import LeaderboardPage from '@/pages/leaderboard';

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/auth" component={AuthPage} />
      <Route path="/onboarding" component={OnboardingPage} />
      
      <Route path="*">
        <Layout>
          <Switch>
            <Route path="/dashboard" component={DashboardPage} />
            <Route path="/practice" component={PracticePage} />
            <Route path="/learn" component={LearnPage} />
            <Route path="/learn/:id" component={LessonPage} />
            <Route path="/profile" component={ProfilePage} />
            <Route path="/leaderboard" component={LeaderboardPage} />
            <Route path="/" component={DashboardPage} />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;