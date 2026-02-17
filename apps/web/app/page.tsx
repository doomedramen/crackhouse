'use client';

import { useState } from 'react';
import { useAuthSession, useNetworks, useDictionaries, useJobs, useUsers, useResults } from '@/lib/api-hooks';
import { NetworksTab } from '@/components/networks-tab';
import { DictionariesTab } from '@/components/dictionaries-tab';
import { JobsTab } from '@/components/jobs-tab';
import { UsersTab } from '@/components/users-tab';
import { ResultsTab } from '@/components/results-tab';
import { AdminTab } from '@/components/admin-tab';
import { StatsCards } from '@/components/stats-cards';
import { Button } from '@workspace/ui/components/button';
import { CreateJobModal } from '@/components/create-job-modal';
import { UploadModal } from '@/components/upload-modal';
import {
  Radar,
  BookOpen,
  Package,
  Users,
  Skull,
  Upload,
  Plus,
  Shield,
  Key
} from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';
import { AvatarDropdown } from '@/components/avatar-dropdown';
import { SystemNotifications } from '@/components/system-notifications';

type TabType = 'networks' | 'dictionaries' | 'jobs' | 'results' | 'users' | 'admin';

export default function Page() {
  const [activeTab, setActiveTab] = useState<TabType>('networks');
  const { data: authData, isLoading, error } = useAuthSession();

  // Check if user is admin or superuser
  const isAdmin = (authData?.user as any)?.role === 'admin' || (authData?.user as any)?.role === 'superuser';

  // Fetch data for tab counts
  const { data: networksData } = useNetworks();
  const { data: dictionariesData } = useDictionaries();
  const { data: jobsData } = useJobs();
  // Only fetch users if admin to avoid 403 errors
  const { data: usersData } = useUsers(isAdmin);
  const { data: resultsData } = useResults();

  // Get counts for tabs
  const networksCount = networksData?.data?.length || 0;
  const dictionariesCount = dictionariesData?.data?.length || 0;
  const jobsCount = jobsData?.data?.length || 0;
  const resultsCount = resultsData?.count || 0;
  const usersCount = usersData?.data?.length || 0;

  if (authData === undefined && !isLoading) {
    // Redirect to login if there's no session
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center font-mono">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-sm text-muted-foreground">authenticating...</p>
        </div>
      </div>
    );
  }

  const renderActiveTab = () => {
    switch (activeTab) {
      case 'networks':
        return <NetworksTab />;
      case 'dictionaries':
        return <DictionariesTab />;
      case 'jobs':
        return <JobsTab />;
      case 'results':
        return <ResultsTab />;
      case 'users':
        return <UsersTab />;
      case 'admin':
        return <AdminTab />;
      default:
        return <NetworksTab />;
    }
  };

  const getTabIcon = (tabId: string) => {
    switch (tabId) {
      case 'networks':
        return <Radar className="h-4 w-4" />;
      case 'dictionaries':
        return <BookOpen className="h-4 w-4" />;
      case 'jobs':
        return <Package className="h-4 w-4" />;
      case 'results':
        return <Key className="h-4 w-4" />;
      case 'users':
        return <Users className="h-4 w-4" />;
      case 'admin':
        return <Shield className="h-4 w-4" />;
      default:
        return <Radar className="h-4 w-4" />;
    }
  };

  return (
    <div className="min-h-screen bg-background" data-testid="dashboard">
      {/* Header with default shadcn colors */}
      <header className="border-b" data-testid="header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Skull className="h-8 w-8" />
              <div>
                <h1 className="text-xl font-mono font-bold uppercase tracking-wider">
                  CrackHouse
                </h1>
                <p className="text-xs text-muted-foreground font-mono">
                  where handshakes go to break
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <UploadModal>
                <Button variant="outline" size="sm" className="font-mono text-xs" data-testid="header-upload-button">
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Files
                </Button>
              </UploadModal>
              <CreateJobModal>
                <Button variant="outline" size="sm" className="font-mono text-xs" data-testid="header-create-job-button">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Jobs
                </Button>
              </CreateJobModal>
              <SystemNotifications />
              <ThemeToggle />
              <AvatarDropdown />
            </div>
          </div>
        </div>
      </header>

      {/* Stats Cards */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" data-testid="stats-cards-container">
        <StatsCards />
      </div>

      {/* Tab Navigation */}
      <div className="border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex space-x-8" aria-label="Tabs">
            {[
              { id: 'networks', name: 'Networks', count: networksCount },
              { id: 'dictionaries', name: 'Dictionaries', count: dictionariesCount },
              { id: 'jobs', name: 'Jobs', count: jobsCount },
              { id: 'results', name: 'Results', count: resultsCount },
              { id: 'users', name: 'Users', count: usersCount },
              ...(isAdmin ? [{ id: 'admin', name: 'Admin', count: 0 }] : []),
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                data-testid={`${tab.id}-tab`}
                data-tab={tab.id}
                className={`py-4 px-1 border-b-2 font-medium text-sm font-mono uppercase tracking-wider flex items-center space-x-2 ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-muted-foreground'
                }`}
              >
                {getTabIcon(tab.id)}
                <span>{tab.name}</span>
                <span className="bg-muted text-muted-foreground px-2 py-0.5 rounded-full text-xs">
                  {tab.count}
                </span>
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-6" data-testid={`${activeTab}-content`}>
          {renderActiveTab()}
        </div>
      </main>
    </div>
  );
}
