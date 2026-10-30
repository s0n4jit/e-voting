import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { resultsApi } from '../../api/resultsApi';
import { BrandMark, ThemeToggle } from '../ui';
import LoadingSpinner from '../common/LoadingSpinner';
import ResultsView from './ResultsView';

/** Public results page, opened from the share link. No sign-in. */
export default function PublicResults() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    resultsApi.publicResults(token).then(setData).catch(() => setMissing(true));
  }, [token]);

  return (
    <div className="min-h-screen bg-bg">
      <header className="border-b border-line">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center justify-between">
          <BrandMark />
          <ThemeToggle />
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-4 py-8 animate-page-in">
        {missing ? (
          <div className="text-center py-20">
            <h1 className="text-xl font-semibold">Results not available</h1>
            <p className="text-muted mt-2">This link is not valid, or the results have not been published.</p>
          </div>
        ) : !data ? (
          <LoadingSpinner size="lg" />
        ) : (
          <ResultsView data={data} />
        )}
      </main>
    </div>
  );
}
