import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { adminApi } from '../api/adminApi';

/**
 * The election a page (Candidates, Results) works on: ?election=<id> from the URL, otherwise the
 * running election, otherwise the newest one.
 */
export function useSelectedElection() {
  const [params, setParams] = useSearchParams();
  const [elections, setElections] = useState(null);

  useEffect(() => {
    adminApi
      .getElections({ include_mock: 'true' })
      .then((d) => setElections(Array.isArray(d) ? d : d.elections || []))
      .catch(() => setElections([]));
  }, []);

  const wanted = params.get('election');
  const election =
    (elections && (
      (wanted ? elections.find((e) => String(e.id) === wanted) : null) ||
      elections.find((e) => e.is_mock && e.status !== 'archived') ||
      elections.find((e) => !e.is_mock && e.status !== 'archived') ||
      elections.find((e) => e.status !== 'archived') ||
      elections[0]
    )) || null;

  return {
    elections,
    election,
    electionId: election ? String(election.id) : null,
    select: (id) => setParams({ election: String(id) }, { replace: true }),
  };
}
