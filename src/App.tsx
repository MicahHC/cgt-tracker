import { useState } from 'react';
import { Layout, PageKey } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { AssetsList } from './components/AssetsList';
import { AssetDetail } from './components/AssetDetail';
import { AssetEditForm } from './components/AssetEditForm';
import { Companies } from './components/Companies';
import { ScoringPage } from './components/ScoringPage';
import { ChangeLogPage } from './components/ChangeLogPage';
import { ScoreHistoryPage } from './components/ScoreHistoryPage';
import { CatalystsPage } from './components/CatalystsPage';
import { AdminPage } from './components/AdminPage';

function App() {
  const [page, setPage] = useState<PageKey>('dashboard');
  const [openAssetId, setOpenAssetId] = useState<string | null>(null);
  const [creatingAsset, setCreatingAsset] = useState(false);

  const canEdit = true;

  function navigate(p: PageKey) {
    setPage(p);
    setOpenAssetId(null);
    setCreatingAsset(false);
  }

  function openAsset(id: string) {
    setOpenAssetId(id);
    setCreatingAsset(false);
  }

  function content() {
    if (creatingAsset) {
      return (
        <AssetEditForm
          onCancel={() => setCreatingAsset(false)}
          onSaved={() => { setCreatingAsset(false); setPage('assets'); }}
        />
      );
    }
    if (openAssetId) {
      return (
        <AssetDetail
          assetId={openAssetId}
          onBack={() => setOpenAssetId(null)}
        />
      );
    }
    switch (page) {
      case 'dashboard': return <Dashboard onNavigate={navigate} onOpenAsset={openAsset} />;
      case 'assets': return <AssetsList onOpenAsset={openAsset} onCreateAsset={() => setCreatingAsset(true)} canEdit={canEdit} />;
      case 'companies': return <Companies onOpenAsset={openAsset} canEdit={canEdit} />;
      case 'scoring': return <ScoringPage />;
      case 'changelog': return <ChangeLogPage onOpenAsset={openAsset} />;
      case 'scorehistory': return <ScoreHistoryPage onOpenAsset={openAsset} />;
      case 'catalysts': return <CatalystsPage onOpenAsset={openAsset} />;
      case 'admin': return <AdminPage />;
      default: return <Dashboard onNavigate={navigate} onOpenAsset={openAsset} />;
    }
  }

  return (
    <Layout currentPage={page} onNavigate={navigate}>
      {content()}
    </Layout>
  );
}

export default App;
